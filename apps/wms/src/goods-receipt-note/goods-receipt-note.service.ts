// apps/wms/src/goods-receipt-note/goods-receipt-note.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AppException, CloudinaryService } from '@app/common';
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
  ): Promise<GoodsReceiptNoteDocument> {
    const po = await this.purchaseOrderService.getPurchaseOrder(
      dto.purchaseOrderId,
    );
    if (NON_RECEIVABLE_STATUSES.has(po.status)) {
      throw new AppException('PO_NOT_RECEIVABLE');
    }

    // items để trống → RECEIVER xác nhận "nhận đủ theo PO": tự lấy các dòng còn thiếu
    // (expectedQty - receivedQty), actualQty mặc định = phần còn thiếu. Dòng perishable
    // vẫn thiếu lotNumber/expiryDate (không thể tự đoán) nên GRN_LOT_INFO_MISSING sẽ chặn
    // ngay dưới, buộc client gửi lại kèm items đầy đủ cho riêng dòng đó.
    const items: CreateGoodsReceiptNoteItemDto[] =
      dto.items && dto.items.length > 0
        ? dto.items
        : po.items
            .filter((poItem) => poItem.receivedQty < poItem.expectedQty)
            .map((poItem) => ({
              itemId: poItem.itemId.toString(),
              actualQty: poItem.expectedQty - poItem.receivedQty,
            }));
    if (items.length === 0) {
      throw new AppException('PO_NOT_RECEIVABLE');
    }

    const resolvedItems = await this.resolveAndValidateItems(po, items);

    const grnNumber = await this.generateGrnNumber();
    return this.repo.createGoodsReceiptNote(
      dto.purchaseOrderId,
      grnNumber,
      resolvedItems,
      actorId,
    );
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

      // Chặn ngay lúc tạo/sửa (không đợi tới confirm) nếu dòng PO này đã nhận đủ hoặc
      // actualQty client gửi vượt phần còn thiếu — tránh tạo/sửa GRN DRAFT "vô nghĩa"
      // chắc chắn sẽ bị GRN_QTY_EXCEEDS_PO chặn lại lúc confirm, đỡ tốn công RECEIVER
      // nhập lô/hạn dùng/ảnh minh chứng cho một phiếu không thể xác nhận được.
      const remainingQty = poItem.expectedQty - poItem.receivedQty;
      if (remainingQty <= 0 || item.actualQty > remainingQty) {
        throw new AppException('GRN_QTY_EXCEEDS_PO');
      }

      const warehouseItem = await this.stockRepo.findItemById(item.itemId);
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
        actualQty: item.actualQty,
        // unit cho phép khác PO (RECEIVER đếm theo đơn vị phụ) — bỏ trống thì lấy theo PO.
        unit: item.unit ?? poItem.unit,
        lotNumber: item.lotNumber,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        note: item.note,
      });
    }
    return resolvedItems;
  }

  /**
   * Sửa toàn bộ items của 1 GRN còn DRAFT — thay thế hoàn toàn (không merge),
   * chạy lại đúng validate như lúc tạo. Chỉ cho phép khi DRAFT vì sau CONFIRMED
   * đã cộng tồn kho thật, sửa items sẽ làm lệch số liệu đã ghi sổ.
   */
  async updateGoodsReceiptNoteItems(
    id: string,
    items: CreateGoodsReceiptNoteItemDto[],
  ): Promise<GoodsReceiptNoteDocument> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    if (grn.status !== GoodsReceiptNoteStatus.DRAFT) {
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
   * khác với chứng từ đã CONFIRMED/APPROVED (hủy bằng status, không soft-delete).
   */
  async deleteGoodsReceiptNote(id: string): Promise<void> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    if (grn.status !== GoodsReceiptNoteStatus.DRAFT) {
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }
    await this.repo.deleteGoodsReceiptNote(id);
  }

  async confirmGoodsReceiptNote(
    id: string,
    actorId: string,
  ): Promise<GoodsReceiptNoteDocument> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    // Guard này làm confirm idempotent với retry HTTP: check TRƯỚC mọi ghi transaction/stock,
    // nên nếu transaction đã commit (GRN → CONFIRMED) thì retry luôn rơi vào đây và bị chặn sạch,
    // không cộng tồn 2 lần; nếu transaction chưa commit (crash giữa chừng) thì chưa ghi gì, retry chạy lại bình thường.
    if (grn.status !== GoodsReceiptNoteStatus.DRAFT) {
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }
    // Bắt buộc có ảnh minh chứng trước khi cộng tồn — chặn sớm trước transaction,
    // tránh RECEIVER xác nhận nhận hàng mà không có bằng chứng đối soát sau này.
    if (grn.images.length === 0) {
      throw new AppException('GRN_IMAGE_REQUIRED');
    }

    const po = await this.purchaseOrderService.getPurchaseOrder(
      grn.purchaseOrderId.toString(),
    );
    await this.warnIfSupplierNotActive(po.supplierId.toString(), grn.grnNumber);

    // Gộp baseQty theo itemId trước khi so sánh — 1 GRN có thể có nhiều dòng cùng item (nhiều lô)
    const baseQtyByItem = new Map<string, number>();
    const resolvedLines: {
      itemId: string;
      sku: string;
      baseQty: number;
      lotNumber?: string;
      expiryDate?: Date;
    }[] = [];

    for (const line of grn.items) {
      const warehouseItem = await this.stockRepo.findItemById(
        line.itemId.toString(),
      );
      const factor =
        warehouseItem?.altUnits?.find((u) => u.unit === line.unit)?.factor ?? 1;
      const baseQty = line.actualQty * factor;
      const key = line.itemId.toString();
      baseQtyByItem.set(key, (baseQtyByItem.get(key) ?? 0) + baseQty);
      resolvedLines.push({
        itemId: key,
        sku: line.sku,
        baseQty,
        lotNumber: line.lotNumber,
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

    // S4-04: item đã chạm upsertBalance trong transaction — dùng để
    // checkAndEmitStockLow SAU KHI commit (đọc lại balance, không dedup trùng
    // trong 1 GRN vì baseQtyByItem đã gộp theo itemId).
    const touchedItemIds = new Set<string>();

    await this.stockTransactionHelper.withStockTransaction(async (session) => {
      // Tích lũy dòng put-away trong cùng vòng lặp — cần lotId ĐÃ RESOLVE (không phải
      // lotNumber gốc từ GRN), vì PutAwayTask xếp hàng theo lô thật đã tạo/tìm thấy ở dưới.
      const putAwayLines: {
        itemId: string;
        lotId: Types.ObjectId | null;
        quantity: number;
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

      // Sinh PutAwayTask cùng transaction cộng tồn — nếu rollback thì task cũng không
      // được tạo, tránh việc GRN chưa confirm mà đã có task xếp hàng "ma".
      await this.putAwayService.createTaskFromGrn(
        grn._id,
        putAwayLines,
        actorId,
        session,
      );

      await this.repo.updateStatusConfirmed(id, actorId, session);
    });

    // Ngoài transaction — BullMQ không tham gia Mongo transaction
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

    const confirmed = await this.repo.findGoodsReceiptNoteById(id);
    if (!confirmed) throw new AppException('GRN_NOT_FOUND');
    return confirmed;
  }

  async approveGoodsReceiptNote(
    id: string,
    actorId: string,
  ): Promise<GoodsReceiptNoteDocument> {
    const grn = await this.repo.findGoodsReceiptNoteById(id);
    if (!grn) throw new AppException('GRN_NOT_FOUND');
    if (grn.status !== GoodsReceiptNoteStatus.CONFIRMED) {
      throw new AppException('GRN_INVALID_STATUS_TRANSITION');
    }
    const approved = await this.repo.updateStatusApproved(id, actorId);
    if (!approved) throw new AppException('GRN_NOT_FOUND');
    return approved;
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
    if (grn.status === GoodsReceiptNoteStatus.APPROVED) {
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
      return {
        ...plain,
        purchaseOrderNumber: po?.poNumber,
        supplierName: po
          ? supplierNameById.get(po.supplierId.toString())
          : undefined,
        items: doc.items.map((item) => {
          const warehouseItem = itemById.get(item.itemId.toString());
          // receivedQty/remainingQty lấy TẠI THỜI ĐIỂM trả response (không phải
          // lúc tạo GRN) — phản ánh tổng đã nhận từ MỌI GRN đã CONFIRMED của PO
          // này, để FE đối chiếu còn thiếu bao nhiêu so với PO.
          const poItem = po?.items.find(
            (i) => i.itemId.toString() === item.itemId.toString(),
          );
          return {
            ...(item as unknown as Record<string, unknown>),
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
          };
        }),
      };
    });
  }

  /**
   * PO chỉ chặn tạo mới nếu NCC không ACTIVE (assertSupplierActive lúc createPurchaseOrder);
   * PO đã đặt/đang giao dở vẫn cho nhận hàng tiếp để tránh tồn kho treo hoặc tranh chấp hợp
   * đồng đã ký (issue #34 — quyết định nghiệp vụ: cảnh báo, không chặn confirm GRN).
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
