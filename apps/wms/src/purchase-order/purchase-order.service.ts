// apps/wms/src/purchase-order/purchase-order.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '@app/common';
import type { ClientSession } from 'mongoose';
import {
  PurchaseOrderRepository,
  ResolvedPurchaseOrderItem,
} from './purchase-order.repository';
import { SupplierService } from '../supplier/supplier.service';
import { StockRepository } from '../stock/stock.repository';
import {
  PurchaseOrderStatus,
  type PurchaseOrderDocument,
} from './schemas/purchase-order.schema';
import type {
  CreatePurchaseOrderDto,
  QueryPurchaseOrderDto,
} from './dto/purchase-order.dto';

/** Ngưỡng lệch giá (%) để cảnh báo — không chặn PO, chỉ log nghi vấn nhập nhầm/gian lận (issue #31). */
const PRICE_DEVIATION_WARN_THRESHOLD = 0.2;

function maxOf(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger(PurchaseOrderService.name);

  constructor(
    private readonly repo: PurchaseOrderRepository,
    private readonly supplierService: SupplierService,
    private readonly stockRepo: StockRepository,
  ) {}

  async createPurchaseOrder(
    dto: CreatePurchaseOrderDto,
    actorId: string,
  ): Promise<PurchaseOrderDocument> {
    // Chặn NCC blacklist/inactive trước khi làm gì khác
    await this.supplierService.assertSupplierActive(dto.supplierId);

    const resolvedItems: ResolvedPurchaseOrderItem[] = [];
    // leadTimeDays lớn nhất trong các dòng hàng — dùng gợi ý expectedDate nếu client không truyền tay (issue #32)
    let maxLeadTimeDays: number | undefined;
    for (const item of dto.items) {
      // Item phải tồn tại và chưa bị soft-delete — chặn PO tham chiếu SKU "ma"
      const warehouseItem = await this.stockRepo.findItemById(item.itemId);
      if (!warehouseItem || warehouseItem.deletedAt) {
        throw new AppException('STOCK_ITEM_NOT_FOUND');
      }

      let unitPrice = item.unitPrice;
      if (unitPrice === undefined) {
        // Giá để trống → tra bảng giá NCC; SKU chưa từng khai giá thì từ chối luôn PO
        const supplierItem = await this.getActiveSupplierItemOrThrow(
          item.itemId,
          dto.supplierId,
        );
        unitPrice = supplierItem.purchasePrice;
        this.assertMoqSatisfied(item, supplierItem);
        maxLeadTimeDays = maxOf(maxLeadTimeDays, supplierItem.leadTimeDays);
      } else {
        // Giá nhập tay: không chặn PO (giá thương lượng tự do theo từng đơn),
        // nhưng vẫn tra báo giá NCC để CẢNH BÁO qua log nếu lệch quá ngưỡng —
        // phát hiện nhập nhầm/gian lận mà không cản trở nghiệp vụ (issue #31).
        // MOQ vẫn phải áp dù giá nhập tay hay tự điền — chỉ bỏ qua khi SKU chưa có báo giá NCC.
        let supplierItem: {
          purchasePrice: number;
          isActive: boolean;
          minOrderQty?: number;
          leadTimeDays?: number;
        } | null;
        try {
          supplierItem = await this.getActiveSupplierItemOrThrow(
            item.itemId,
            dto.supplierId,
          );
        } catch (err) {
          if ((err as { code?: string })?.code === 'PO_PRICE_MISSING') {
            supplierItem = null;
          } else {
            throw err;
          }
        }
        if (supplierItem) {
          this.warnIfPriceDeviates(item, unitPrice, supplierItem.purchasePrice);
          this.assertMoqSatisfied(item, supplierItem);
          maxLeadTimeDays = maxOf(maxLeadTimeDays, supplierItem.leadTimeDays);
        }
      }
      resolvedItems.push({
        itemId: item.itemId,
        sku: item.sku,
        expectedQty: item.expectedQty,
        unit: item.unit,
        unitPrice,
      });
    }

    const poNumber = await this.generatePoNumber();
    // Client không truyền expectedDate → gợi ý = hôm nay + leadTimeDays (lớn nhất trong PO), sửa tay được (issue #32)
    const expectedDate =
      dto.expectedDate ??
      (maxLeadTimeDays !== undefined
        ? addDays(new Date(), maxLeadTimeDays).toISOString()
        : undefined);
    return this.repo.createPurchaseOrder(
      { ...dto, expectedDate },
      poNumber,
      resolvedItems,
      actorId,
    );
  }

  /**
   * Tra SupplierItem active cho cặp (itemId, supplierId); dịch lỗi "chưa có báo giá"
   * hoặc "báo giá hết hiệu lực" sang PO_PRICE_MISSING — dùng chung cho nhánh tự điền giá
   * và nhánh kiểm tra MOQ khi giá đã nhập tay.
   */
  private async getActiveSupplierItemOrThrow(
    itemId: string,
    supplierId: string,
  ): Promise<{
    purchasePrice: number;
    isActive: boolean;
    minOrderQty?: number;
    leadTimeDays?: number;
  }> {
    let supplierItem: {
      purchasePrice: number;
      isActive: boolean;
      minOrderQty?: number;
      leadTimeDays?: number;
    };
    try {
      supplierItem =
        await this.supplierService.getSupplierItemByItemAndSupplier(
          itemId,
          supplierId,
        );
    } catch (err) {
      if ((err as { code?: string })?.code === 'SUPPLIER_ITEM_NOT_FOUND') {
        throw new AppException('PO_PRICE_MISSING');
      }
      throw err;
    }
    // Báo giá hết hiệu lực (isActive=false) → coi như chưa có giá, không tự điền
    if (!supplierItem.isActive) {
      throw new AppException('PO_PRICE_MISSING');
    }
    return supplierItem;
  }

  /** expectedQty thấp hơn MOQ đã đăng ký cho SKU/NCC này → chặn tạo PO (issue #32). */
  private assertMoqSatisfied(
    item: { expectedQty: number },
    supplierItem: { minOrderQty?: number },
  ): void {
    if (
      supplierItem.minOrderQty !== undefined &&
      item.expectedQty < supplierItem.minOrderQty
    ) {
      throw new AppException('PO_QTY_BELOW_MOQ');
    }
  }

  async listPurchaseOrders(
    query: QueryPurchaseOrderDto,
  ): Promise<{ data: PurchaseOrderDocument[]; total: number }> {
    return this.repo.findPurchaseOrders(query);
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrderDocument> {
    const doc = await this.repo.findPurchaseOrderById(id);
    if (!doc) throw new AppException('PO_NOT_FOUND');
    return doc;
  }

  /**
   * GRN CONFIRMED gọi hàm này (trong cùng transaction Mongo) để cộng dồn receivedQty
   * và tính lại status PO. deltaBaseQty đã quy đổi đơn vị cơ sở từ trước (ở GRN service).
   */
  async applyReceivedQty(
    poId: string,
    itemId: string,
    deltaBaseQty: number,
    session: ClientSession,
  ): Promise<void> {
    const po = await this.repo.findPurchaseOrderByIdWithSession(poId, session);
    if (!po) throw new AppException('PO_NOT_FOUND');

    // Tính status dựa trên receivedQty SAU khi cộng deltaBaseQty của item đang xử lý
    const allComplete = po.items.every((item) => {
      const received =
        item.itemId.toString() === itemId
          ? item.receivedQty + deltaBaseQty
          : item.receivedQty;
      return received >= item.expectedQty;
    });
    const newStatus = allComplete
      ? PurchaseOrderStatus.COMPLETED
      : PurchaseOrderStatus.PARTIALLY_RECEIVED;

    await this.repo.applyReceivedQtyAndStatus(
      poId,
      itemId,
      deltaBaseQty,
      newStatus,
      session,
    );
  }

  /**
   * So sánh unitPrice nhập tay với SupplierItem.purchasePrice (đã tra sẵn ở call site).
   * Chỉ log cảnh báo, không throw — giá nhập tay vẫn được chấp nhận (issue #31).
   */
  private warnIfPriceDeviates(
    item: { sku: string },
    unitPrice: number,
    referencePrice: number,
  ): void {
    if (referencePrice === 0) return;

    const deviation = Math.abs(unitPrice - referencePrice) / referencePrice;
    if (deviation > PRICE_DEVIATION_WARN_THRESHOLD) {
      this.logger.warn(
        `SKU ${item.sku}: unitPrice nhập tay (${unitPrice}) lệch ${(deviation * 100).toFixed(1)}% so với SupplierItem.purchasePrice (${referencePrice}) — kiểm tra lại giá NCC hoặc nhập nhầm`,
      );
    }
  }

  /** Sinh mã PO dạng PO-YYYYMMDD-xxxx, số thứ tự reset theo ngày. */
  private async generatePoNumber(): Promise<string> {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const prefix = `PO-${y}${m}${d}`;
    const count = await this.repo.countByPoNumberPrefix(prefix);
    const seq = String(count + 1).padStart(4, '0');
    return `${prefix}-${seq}`;
  }
}
