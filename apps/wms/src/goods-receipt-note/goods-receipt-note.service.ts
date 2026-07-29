// apps/wms/src/goods-receipt-note/goods-receipt-note.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException } from '@app/common/errors/app.exception';
import { CloudinaryService } from '@app/common/cloudinary/cloudinary.service';
import {
  GoodsReceiptNoteRepository,
  ResolvedGoodsReceiptNoteItem,
} from './goods-receipt-note.repository';
import { PurchaseOrderService } from '../purchase-order/purchase-order.service';
import { LocationService } from '../location/location.service';
import { StockRepository } from '../stock/stock.repository';
import { StockService } from '../stock/stock.service';
import { StockTransactionHelper } from '../stock/helpers/with-stock-transaction.helper';
import { PutAwayService } from '../put-away/put-away.service';
import { isMongoDuplicateKeyError } from '../stock/barcode/barcode.service';
import { MovementType } from '../stock/schemas/stock-movement.schema';
import { SupplierService } from '../supplier/supplier.service';
import { SupplierStatus } from '../supplier/schemas/supplier.schema';
import {
  GoodsReceiptNoteStatus,
  type GoodsReceiptNoteDocument,
} from './schemas/goods-receipt-note.schema';
import { PurchaseOrderStatus } from '../purchase-order/schemas/purchase-order.schema';
import type {
  CreateGoodsReceiptNoteDto,
  CreateGoodsReceiptNoteItemDto,
  QueryGoodsReceiptNoteDto,
} from './dto/goods-receipt-note.dto';

const NON_RECEIVABLE_STATUSES = new Set([
  PurchaseOrderStatus.CANCELLED,
  PurchaseOrderStatus.COMPLETED,
]);

// Giới hạn upload ảnh minh chứng GRN — theo đúng ràng buộc thiết kế IMG-01/IMG-04.
const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// grnNumber sinh từ đếm document trong ngày (không atomic) — 2 request tạo GRN
// gần như đồng thời có thể đọc cùng count và cùng sinh trùng số, insert bị
// unique index chặn (E11000). Retry đếm lại + insert lại thay vì để lộ
// MongoServerError 500 (xem GRN_NUMBER_GENERATION_CONFLICT).
const MAX_GRN_NUMBER_RETRIES = 3;

function manufacturedDateFromLotNumber(lotNumber?: string): Date | undefined {
  const match = /^LOT-(\d{2})(\d{2})(\d{2})-\d{3}$/.exec(lotNumber ?? '');
  if (!match) return undefined;
  const date = new Date(`20${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class GoodsReceiptNoteService {
  private readonly logger = new Logger(GoodsReceiptNoteService.name);

  constructor(
    private readonly repo: GoodsReceiptNoteRepository,
    private readonly purchaseOrderService: PurchaseOrderService,
    private readonly locationService: LocationService,
    private readonly stockRepo: StockRepository,
    private readonly stockService: StockService,
    private readonly stockTransactionHelper: StockTransactionHelper,
    private readonly putAwayService: PutAwayService,
    private readonly cloudinary: CloudinaryService,
    private readonly supplierService: SupplierService,
  ) {}

  async createGoodsReceiptNote(
    dto: CreateGoodsReceiptNoteDto,
    actorId: string,
    imageFiles: UploadedImageFile[],
  ): Promise<GoodsReceiptNoteDocument> {
    if (imageFiles.length === 0) {
      throw new AppException('GRN_IMAGE_REQUIRED');
    }
    imageFiles.forEach((file) => this.validateImageFile(file));

    const po = await this.purchaseOrderService.getPurchaseOrder(
      dto.purchaseOrderId,
    );
    if (NON_RECEIVABLE_STATUSES.has(po.status)) {
      throw new AppException('PO_NOT_RECEIVABLE');
    }

    // Mỗi dòng GRN phải mang ngày sản xuất và thông tin lô do Receiver xác nhận.
    // Backend không thể tự suy đoán các dữ liệu này từ PO khi client bỏ trống items.
    if (!dto.items?.length) {
      throw new AppException('GRN_LOT_INFO_MISSING');
    }
    const items: CreateGoodsReceiptNoteItemDto[] = dto.items;

    const resolvedItems = await this.resolveAndValidateItems(po, items);

    // Chỉ upload sau khi PO và toàn bộ dòng hàng đã hợp lệ để hạn chế ảnh mồ côi.
    const images: string[] = [];
    for (const file of imageFiles) {
      const { url } = await this.cloudinary.uploadImage(file.buffer, 'wms/grn');
      images.push(url);
    }

    for (let attempt = 0; attempt < MAX_GRN_NUMBER_RETRIES; attempt++) {
      const grnNumber = await this.generateGrnNumber();
      try {
        return await this.repo.createGoodsReceiptNote(
          dto.purchaseOrderId,
          grnNumber,
          resolvedItems,
          actorId,
          images,
        );
      } catch (err) {
        if (!isMongoDuplicateKeyError(err)) throw err;
      }
    }
    throw new AppException('GRN_NUMBER_GENERATION_CONFLICT');
  }

  /**
   * Resolve + validate danh sách item client gửi (create hoặc update DRAFT) đối
   * chiếu với PO — dùng chung để 2 luồng không lệch quy tắc nhau. Ném đúng các
   * AppException hiện có: GRN_ITEM_NOT_IN_PO, GRN_QTY_EXCEEDS_PO, GRN_LOT_INFO_MISSING.
   */
  private async resolveAndValidateItems(
    po: {
      items: {
        itemId: Types.ObjectId;
        sku: string;
        unit: string;
        expectedQty: number;
        receivedQty: number;
      }[];
    },
    items: CreateGoodsReceiptNoteItemDto[],
  ): Promise<ResolvedGoodsReceiptNoteItem[]> {
    const poItemIds = new Set(po.items.map((i) => i.itemId.toString()));
    const resolvedItems: ResolvedGoodsReceiptNoteItem[] = [];
    for (const item of items) {
      const poItem = po.items.find((i) => i.itemId.toString() === item.itemId);
      if (!poItemIds.has(item.itemId) || !poItem) {
        throw new AppException('GRN_ITEM_NOT_IN_PO');
      }

      // Chặn ngay lúc tạo/sửa (không đợi tới approve) nếu dòng PO này đã nhận đủ hoặc
      // actualQty client gửi vượt phần còn thiếu — tránh tạo/sửa GRN DRAFT "vô nghĩa"
      // chắc chắn sẽ bị GRN_QTY_EXCEEDS_PO chặn lại lúc approve, đỡ tốn công RECEIVER
      // nhập lô/hạn dùng/ảnh minh chứng cho một phiếu không thể duyệt được.
      const remainingQty = poItem.expectedQty - poItem.receivedQty;
      if (remainingQty <= 0 || item.actualQty > remainingQty) {
        throw new AppException('GRN_QTY_EXCEEDS_PO');
      }

      const warehouseItem = await this.stockRepo.findItemById(item.itemId);
      const manufacturedDate = new Date(item.manufacturedDate);
      if (
        !item.manufacturedDate ||
        Number.isNaN(manufacturedDate.getTime()) ||
        manufacturedDate > new Date()
      ) {
        throw new AppException('GRN_MANUFACTURED_DATE_INVALID');
      }
      if (
        warehouseItem?.isPerishable &&
        (!item.lotNumber || !item.expiryDate)
      ) {
        throw new AppException('GRN_LOT_INFO_MISSING');
      }

      resolvedItems.push({
        itemId: item.itemId,
        // sku luôn denormalize từ PO (đã gắn 1-1 với itemId lúc tạo PO) — không tin sku client tự gửi,
        // tránh lệch dữ liệu nếu client gõ nhầm hoặc dùng bản cũ.
        sku: poItem.sku,
        expectedQty: poItem.expectedQty,
        // actualQty luôn là số thùng nguyên — không còn quy đổi qua đơn vị lẻ.
        actualQty: item.actualQty,
        lotNumber: item.lotNumber,
        manufacturedDate,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        wholePackageOnly: true,
        note: item.note,
      });
    }
    return resolvedItems;
  }

  /**
   * Sửa toàn bộ items của 1 GRN còn DRAFT — thay thế hoàn toàn (không merge),
   * chạy lại đúng validate như lúc tạo. Chỉ cho phép khi DRAFT/REJECTED vì sau APPROVED
   * đã cộng tồn kho thật, sửa items sẽ làm lệch số liệu đã ghi sổ.
   */
  async updateGoodsReceiptNoteItems(
    id: string,
    items: CreateGoodsReceiptNoteItemDto[],
  ): Promise<GoodsReceiptNoteDocument> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    if (
      grn.status !== GoodsReceiptNoteStatus.DRAFT &&
      grn.status !== GoodsReceiptNoteStatus.REJECTED
    ) {
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }

    const po = await this.purchaseOrderService.getPurchaseOrder(
      grn.purchaseOrderId.toString(),
    );
    const resolvedItems = await this.resolveAndValidateItems(po, items);

    const updated = await this.repo.replaceItems(id, resolvedItems);
    if (!updated) throw new AppException('GRN_NOT_FOUND');
    return updated;
  }

  /**
   * Xóa vật lý 1 GRN còn DRAFT — chưa cộng tồn kho/PO nên xóa cứng an toàn,
   * khác với chứng từ đã APPROVED (hủy bằng status, không soft-delete).
   */
  async deleteGoodsReceiptNote(id: string): Promise<void> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    if (grn.status !== GoodsReceiptNoteStatus.DRAFT) {
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }
    await this.repo.deleteGoodsReceiptNote(id);
  }

  async submitGoodsReceiptNote(
    id: string,
    actorId: string,
  ): Promise<GoodsReceiptNoteDocument> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    if (
      grn.status !== GoodsReceiptNoteStatus.DRAFT &&
      grn.status !== GoodsReceiptNoteStatus.REJECTED
    ) {
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }
    await this.assertReadyForApproval(grn);
    const submitted = await this.repo.updateStatusSubmitted(id, actorId);
    if (!submitted) throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    return submitted;
  }

  async approveGoodsReceiptNote(
    id: string,
    actorId: string,
  ): Promise<GoodsReceiptNoteDocument> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    if (grn.status === GoodsReceiptNoteStatus.APPROVED) return grn;
    if (grn.status !== GoodsReceiptNoteStatus.PENDING_APPROVAL) {
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }
    await this.assertReadyForApproval(grn);

    const po = await this.purchaseOrderService.getPurchaseOrder(
      grn.purchaseOrderId.toString(),
    );
    await this.warnIfSupplierNotActive(po.supplierId.toString(), grn.grnNumber);

    const baseQtyByItem = new Map<string, number>();
    const resolvedLines: {
      itemId: string;
      sku: string;
      baseQty: number;
      packageSpec?: {
        unit: string;
        factor: number;
        depthCm: number;
        widthCm: number;
        heightCm: number;
        volumeCm3: number;
      };
      lotNumber?: string;
      manufacturedDate: Date;
      expiryDate?: Date;
    }[] = [];

    for (const line of grn.items) {
      const warehouseItem = await this.stockRepo.findItemById(
        line.itemId.toString(),
      );
      // baseQty = actualQty trực tiếp — actualQty luôn là số thùng nguyên,
      // không còn quy đổi qua factor (quyết định: quantity luôn là thùng).
      const baseQty = line.actualQty;
      const key = line.itemId.toString();
      baseQtyByItem.set(key, (baseQtyByItem.get(key) ?? 0) + baseQty);
      // packageSpec không còn snapshot ở GRN — resolve "live" từ WarehouseItem
      // ngay lúc approve, đây là điểm duy nhất còn tạo packageSpec (đi tiếp
      // xuống PutAwayTask/InventoryStock, các tầng đó vẫn giữ nguyên snapshot).
      // factor bên trong CHỈ để hiển thị tham khảo, không dùng để tính baseQty.
      const packageSpec =
        warehouseItem?.depth && warehouseItem?.width && warehouseItem?.height
          ? {
              unit: warehouseItem.unit,
              factor: warehouseItem.altUnits?.[0]?.factor ?? 1,
              depthCm: warehouseItem.depth,
              widthCm: warehouseItem.width,
              heightCm: warehouseItem.height,
              volumeCm3:
                warehouseItem.depth *
                warehouseItem.width *
                warehouseItem.height,
            }
          : undefined;
      resolvedLines.push({
        itemId: key,
        sku: line.sku,
        baseQty,
        packageSpec,
        lotNumber: line.lotNumber,
        manufacturedDate: line.manufacturedDate,
        expiryDate: line.expiryDate,
      });
    }

    for (const [itemId, totalBaseQty] of baseQtyByItem) {
      const poItem = po.items.find((i) => i.itemId.toString() === itemId);
      if (!poItem) throw new AppException('GRN_ITEM_NOT_IN_PO');
      if (poItem.receivedQty + totalBaseQty > poItem.expectedQty) {
        throw new AppException('GRN_QTY_EXCEEDS_PO');
      }
    }

    const stagingShelf = await this.locationService.findStagingShelf();
    const touchedItemIds = new Set<string>();

    const approvalCommitted =
      await this.stockTransactionHelper.withStockTransaction(
        async (session) => {
          const claimed = await this.repo.updateStatusApproved(
            id,
            actorId,
            session,
          );
          if (!claimed) return false;

          const putAwayLines: {
            itemId: string;
            lotId: Types.ObjectId | null;
            quantity: number;
            packageSpec?: {
              unit: string;
              factor: number;
              depthCm: number;
              widthCm: number;
              heightCm: number;
              volumeCm3: number;
            };
          }[] = [];

          for (const line of resolvedLines) {
            const itemObjectId = new Types.ObjectId(line.itemId);

            let lotId: Types.ObjectId | null = null;
            if (line.lotNumber && line.expiryDate) {
              const existingLot = await this.stockRepo.findActiveLotByNumber(
                itemObjectId,
                line.lotNumber,
                session,
              );
              const lot =
                existingLot ??
                (await this.stockRepo.createLot(
                  {
                    itemId: itemObjectId,
                    lotNumber: line.lotNumber,
                    manufacturedDate: line.manufacturedDate,
                    expiryDate: line.expiryDate,
                    receivedDate: new Date(),
                  },
                  session,
                ));
              lotId = lot._id;
            }

            putAwayLines.push({
              itemId: line.itemId,
              lotId,
              quantity: line.baseQty,
              packageSpec: line.packageSpec,
            });

            await this.stockRepo.upsertBalance(
              itemObjectId,
              line.baseQty,
              0,
              0,
              session,
            );
            touchedItemIds.add(line.itemId);
            await this.stockRepo.upsertInventory(
              itemObjectId,
              stagingShelf._id,
              lotId,
              line.baseQty,
              session,
              {
                packageFactor: line.packageSpec?.factor,
                packageVolumeCm3Snapshot: line.packageSpec?.volumeCm3,
              },
            );
            await this.stockRepo.insertMovement(
              {
                itemId: itemObjectId,
                shelfId: stagingShelf._id,
                lotId,
                type: MovementType.RECEIVE,
                quantity: line.baseQty,
                refType: 'grn',
                refId: grn._id,
                createdBy: new Types.ObjectId(actorId),
                packageFactor: line.packageSpec?.factor,
                packageVolumeCm3Snapshot: line.packageSpec?.volumeCm3,
              },
              session,
            );
            await this.purchaseOrderService.applyReceivedQty(
              grn.purchaseOrderId.toString(),
              line.itemId,
              line.baseQty,
              session,
            );
          }

          await this.putAwayService.createTaskFromGrn(
            grn._id,
            putAwayLines,
            actorId,
            session,
            stagingShelf._id,
          );
          return true;
        },
      );

    if (!approvalCommitted) {
      const current = await this.repo.findGoodsReceiptNoteById(id);
      if (current?.status === GoodsReceiptNoteStatus.APPROVED) return current;
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }

    for (const [itemId, totalBaseQty] of baseQtyByItem) {
      await this.stockService.publishAvailableForItem(
        itemId,
        totalBaseQty,
        'grn',
        grn._id,
      );
    }
    for (const itemIdStr of touchedItemIds) {
      await this.stockService.checkAndEmitStockLow(
        new Types.ObjectId(itemIdStr),
      );
    }

    const approved = await this.repo.findGoodsReceiptNoteById(id);
    if (!approved) throw new AppException('GRN_NOT_FOUND');
    return approved;
  }

  async rejectGoodsReceiptNote(
    id: string,
    actorId: string,
    reason: string,
  ): Promise<GoodsReceiptNoteDocument> {
    const rejected = await this.repo.updateStatusRejected(id, actorId, reason);
    if (!rejected) throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    return rejected;
  }

  /**
   * packageSpec không còn snapshot ở GRN item (bỏ trùng lặp với WarehouseItem) —
   * tra "live" từng item để validate đủ kích thước trước khi cho submit/approve.
   * Không còn so khớp số học qua factor — actualQty đã luôn là số thùng.
   */
  private async assertReadyForApproval(
    grn: GoodsReceiptNoteDocument,
  ): Promise<void> {
    if (grn.items.length === 0) throw new AppException('GRN_ITEM_REQUIRED');
    if (grn.images.length === 0) throw new AppException('GRN_IMAGE_REQUIRED');
    for (const line of grn.items) {
      const warehouseItem = await this.stockRepo.findItemById(
        line.itemId.toString(),
      );
      if (
        !warehouseItem?.depth ||
        !warehouseItem?.width ||
        !warehouseItem?.height
      ) {
        throw new AppException('GRN_PACKAGE_SPEC_REQUIRED');
      }
      if (line.actualQty <= 0) {
        throw new AppException('GRN_PACKAGE_COUNT_REQUIRED');
      }
    }
  }
  /**
   * Thêm 1 ảnh minh chứng vào GRN (kiện hàng/hàng lỗi lúc nhận). Chỉ cho phép khi
   * GRN chưa APPROVED — tránh sửa chứng từ đã duyệt (đúng tinh thần "chứng từ giao
   * dịch hủy bằng status", xem AC IMG-04).
   */
  async uploadGrnImage(
    id: string,
    file: UploadedImageFile,
  ): Promise<GoodsReceiptNoteDocument> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    if (
      grn.status !== GoodsReceiptNoteStatus.DRAFT &&
      grn.status !== GoodsReceiptNoteStatus.REJECTED
    ) {
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }

    this.validateImageFile(file);
    const { url } = await this.cloudinary.uploadImage(file.buffer, 'wms/grn');

    const updated = await this.repo.pushImage(id, url);
    if (!updated) throw new AppException('GRN_NOT_FOUND');
    return updated;
  }

  private validateImageFile(file: UploadedImageFile): void {
    if (!file) {
      throw new AppException('VALIDATION_FAILED', 'Thiếu file ảnh');
    }
    if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Chỉ nhận file ảnh (jpeg/png/webp)',
      );
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new AppException('VALIDATION_FAILED', 'File ảnh tối đa 5MB');
    }
  }

  async listGoodsReceiptNotes(
    query: QueryGoodsReceiptNoteDto,
  ): Promise<{ data: GoodsReceiptNoteDocument[]; total: number }> {
    return this.repo.findGoodsReceiptNotes(query);
  }

  async getGoodsReceiptNote(id: string): Promise<GoodsReceiptNoteDocument> {
    const doc = await this.repo.findGoodsReceiptNoteById(id);
    if (!doc) throw new AppException('GRN_NOT_FOUND');
    return doc;
  }

  /**
   * Gắn itemName (mỗi dòng) + purchaseOrderNumber/supplierName (cấp GRN) vào 1 hoặc nhiều
   * GRN để trả về GET — tra rồi gắn thủ công thay vì Mongoose populate xuyên collection
   * (rule data-and-mongoose.md). Dedupe itemId/purchaseOrderId qua Set để tránh N+1.
   */
  async attachDisplayInfo(
    docs: GoodsReceiptNoteDocument[],
  ): Promise<Record<string, unknown>[]> {
    const itemIds = [
      ...new Set(docs.flatMap((d) => d.items.map((i) => i.itemId.toString()))),
    ];
    const purchaseOrderIds = [
      ...new Set(docs.map((d) => d.purchaseOrderId.toString())),
    ];
    const [items, purchaseOrders] = await Promise.all([
      this.stockRepo.findItemsByIds(
        itemIds.map((id) => new Types.ObjectId(id)),
      ),
      this.purchaseOrderService.listPurchaseOrdersByIds(purchaseOrderIds),
    ]);
    const itemById = new Map(items.map((i) => [i._id.toString(), i]));
    const poById = new Map(purchaseOrders.map((po) => [po._id.toString(), po]));
    const supplierIds = [
      ...new Set(purchaseOrders.map((po) => po.supplierId.toString())),
    ];
    const suppliers =
      await this.supplierService.listSuppliersByIds(supplierIds);
    const supplierNameById = new Map(
      suppliers.map((s) => [s._id.toString(), s.name]),
    );

    return docs.map((doc) => {
      const plain = doc.toObject() as unknown as Record<string, unknown>;
      const po = poById.get(doc.purchaseOrderId.toString());
      // totalPackageCount = tổng số thùng — actualQty CHÍNH LÀ số thùng
      // (không còn field packageCount riêng, quyết định: quantity luôn là thùng).
      const totalPackageCount = doc.items.reduce(
        (sum, item) => sum + item.actualQty,
        0,
      );
      // plain.items đã qua doc.toObject() — dùng làm nguồn spread thay vì doc.items
      // trực tiếp: doc.items[i] là Mongoose EmbeddedDocument, field thật nằm sau getter/
      // `_doc` chứ không phải own-enumerable property, nên `{...doc.items[i]}` chỉ copy
      // được các key nội bộ Mongoose (`_doc`, `$__`...) và làm mất actualQty/lotNumber/
      // expiryDate trong response — plain.items[i] là plain object nên spread đúng.
      const plainItems = plain.items as Record<string, unknown>[];
      return {
        ...plain,
        totalPackageCount,
        purchaseOrderNumber: po?.poNumber,
        supplierName: po
          ? supplierNameById.get(po.supplierId.toString())
          : undefined,
        items: doc.items.map((item, index) => {
          const warehouseItem = itemById.get(item.itemId.toString());
          // receivedQty/remainingQty lấy TẠI THỜI ĐIỂM trả response (không phải
          // lúc tạo GRN) — phản ánh tổng đã nhận từ MỌI GRN đã APPROVED của PO
          // này, để FE đối chiếu còn thiếu bao nhiêu so với PO.
          const poItem = po?.items.find(
            (i) => i.itemId.toString() === item.itemId.toString(),
          );
          return {
            ...plainItems[index],
            manufacturedDate:
              item.manufacturedDate ??
              manufacturedDateFromLotNumber(item.lotNumber),
            itemName: warehouseItem?.name,
            barcode: warehouseItem?.barcode,
            category: warehouseItem?.category,
            type: warehouseItem?.type,
            images: warehouseItem?.images,
            isPerishable: warehouseItem?.isPerishable,
            unitPrice: poItem?.unitPrice,
            receivedQty: poItem?.receivedQty,
            remainingQty:
              poItem != null
                ? poItem.expectedQty - poItem.receivedQty
                : undefined,
            itemDepth: warehouseItem?.depth,
            itemWidth: warehouseItem?.width,
            itemHeight: warehouseItem?.height,
          };
        }),
      };
    });
  }

  /**
   * PO chỉ chặn tạo mới nếu NCC không ACTIVE (assertSupplierActive lúc createPurchaseOrder);
   * PO đã đặt/đang giao dở vẫn cho nhận hàng tiếp để tránh tồn kho treo hoặc tranh chấp hợp
   * đồng đã ký (issue #34 — quyết định nghiệp vụ: cảnh báo, không chặn approve GRN).
   */
  private async warnIfSupplierNotActive(
    supplierId: string,
    grnNumber: string,
  ): Promise<void> {
    const supplier = await this.supplierService.getSupplier(supplierId);
    if (supplier.status !== SupplierStatus.ACTIVE) {
      this.logger.warn(
        `GRN ${grnNumber}: xác nhận nhận hàng cho PO của NCC "${supplier.name}" đang ở trạng thái ${supplier.status} (không còn ACTIVE) — cần MANAGER/ADMIN kiểm tra lại`,
      );
    }
  }

  /** Sinh mã GRN dạng GRN-YYYYMMDD-xxxx, số thứ tự reset theo ngày. */
  private async generateGrnNumber(): Promise<string> {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const prefix = `GRN-${y}${m}${d}`;
    const count = await this.repo.countByGrnNumberPrefix(prefix);
    const seq = String(count + 1).padStart(4, '0');
    return `${prefix}-${seq}`;
  }
}
