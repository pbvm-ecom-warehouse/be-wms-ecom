// apps/wms/src/purchase-order/purchase-order.service.ts
import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import type { ClientSession } from 'mongoose';
import {
  PurchaseOrderRepository,
  ResolvedPurchaseOrderItem,
} from './purchase-order.repository';
import { SupplierService } from '../supplier/supplier.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import {
  PurchaseOrderStatus,
  type PurchaseOrderDocument,
} from './schemas/purchase-order.schema';
import type {
  CreatePurchaseOrderDto,
  QueryPurchaseOrderDto,
} from './dto/purchase-order.dto';

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly repo: PurchaseOrderRepository,
    private readonly supplierService: SupplierService,
    private readonly warehouseService: WarehouseService,
  ) {}

  async createPurchaseOrder(
    dto: CreatePurchaseOrderDto,
    actorId: string,
  ): Promise<PurchaseOrderDocument> {
    // Chặn NCC blacklist/inactive trước khi làm gì khác
    await this.supplierService.assertSupplierActive(dto.supplierId);
    // Kho nhận hàng phải tồn tại
    await this.warehouseService.getWarehouse(dto.warehouseId);

    const resolvedItems: ResolvedPurchaseOrderItem[] = [];
    for (const item of dto.items) {
      let unitPrice = item.unitPrice;
      if (unitPrice === undefined) {
        // Giá để trống → tra bảng giá NCC; SKU chưa từng khai giá thì từ chối luôn PO
        let supplierItem: { purchasePrice: number; isActive: boolean };
        try {
          supplierItem = await this.supplierService.getSupplierItemByItemId(
            item.itemId,
          );
        } catch (err) {
          // Chỉ dịch lỗi "chưa có báo giá" sang PO_PRICE_MISSING; lỗi khác (vd hạ tầng) giữ nguyên
          if ((err as { code?: string })?.code === 'SUPPLIER_ITEM_NOT_FOUND') {
            throw new AppException('PO_PRICE_MISSING');
          }
          throw err;
        }
        // Báo giá hết hiệu lực (isActive=false) → coi như chưa có giá, không tự điền
        if (!supplierItem.isActive) {
          throw new AppException('PO_PRICE_MISSING');
        }
        unitPrice = supplierItem.purchasePrice;
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
    return this.repo.createPurchaseOrder(dto, poNumber, resolvedItems, actorId);
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
