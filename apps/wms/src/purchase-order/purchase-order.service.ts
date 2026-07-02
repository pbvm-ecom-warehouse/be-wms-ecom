// apps/wms/src/purchase-order/purchase-order.service.ts
import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import {
  PurchaseOrderRepository,
  ResolvedPurchaseOrderItem,
} from './purchase-order.repository';
import { SupplierService } from '../supplier/supplier.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import type { PurchaseOrderDocument } from './schemas/purchase-order.schema';
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
        try {
          const supplierItem =
            await this.supplierService.getSupplierItemByItemId(item.itemId);
          unitPrice = supplierItem.purchasePrice;
        } catch {
          throw new AppException('PO_PRICE_MISSING');
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
