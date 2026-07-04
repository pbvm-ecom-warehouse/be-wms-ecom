// apps/wms/src/purchase-order/purchase-order.service.spec.ts
import { PurchaseOrderService } from './purchase-order.service';

const makeRepo = () => ({
  createPurchaseOrder: jest.fn(),
  findPurchaseOrderById: jest.fn(),
  findPurchaseOrders: jest.fn(),
  countByPoNumberPrefix: jest.fn(),
  findPurchaseOrderByIdWithSession: jest.fn(),
  applyReceivedQtyAndStatus: jest.fn(),
});

const makeSupplierService = () => ({
  assertSupplierActive: jest.fn(),
  getSupplierItemByItemId: jest.fn(),
});

const makeWarehouseService = () => ({
  getWarehouse: jest.fn(),
});

const makeStockRepo = () => ({
  findItemById: jest.fn(),
});

describe('PurchaseOrderService', () => {
  let svc: PurchaseOrderService;
  let repo: ReturnType<typeof makeRepo>;
  let supplierSvc: ReturnType<typeof makeSupplierService>;
  let warehouseSvc: ReturnType<typeof makeWarehouseService>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  const actorId = 'actor123';
  const supplierId = 'sup001';
  const warehouseId = 'wh001';
  const itemId = 'item001';

  beforeEach(() => {
    repo = makeRepo();
    supplierSvc = makeSupplierService();
    warehouseSvc = makeWarehouseService();
    stockRepo = makeStockRepo();
    svc = new PurchaseOrderService(
      repo as never,
      supplierSvc as never,
      warehouseSvc as never,
      stockRepo as never,
    );
    repo.countByPoNumberPrefix.mockResolvedValue(0);
    warehouseSvc.getWarehouse.mockResolvedValue({ _id: warehouseId });
    supplierSvc.assertSupplierActive.mockResolvedValue(undefined);
    stockRepo.findItemById.mockResolvedValue({ _id: itemId, deletedAt: null });
  });

  describe('createPurchaseOrder', () => {
    const baseDto = {
      supplierId,
      warehouseId,
      items: [{ itemId, sku: 'SKU-1', expectedQty: 10, unit: 'cái' }],
    };

    it('throw SUPPLIER_NOT_ACTIVE khi NCC blacklist/inactive', async () => {
      supplierSvc.assertSupplierActive.mockRejectedValue({
        code: 'SUPPLIER_NOT_ACTIVE',
      });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({
        code: 'SUPPLIER_NOT_ACTIVE',
      });
      expect(warehouseSvc.getWarehouse).not.toHaveBeenCalled();
    });

    it('throw WAREHOUSE_NOT_FOUND khi kho không tồn tại', async () => {
      warehouseSvc.getWarehouse.mockRejectedValue({
        code: 'WAREHOUSE_NOT_FOUND',
      });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({
        code: 'WAREHOUSE_NOT_FOUND',
      });
    });

    it('throw STOCK_ITEM_NOT_FOUND khi itemId không tồn tại', async () => {
      stockRepo.findItemById.mockResolvedValue(null);
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({ code: 'STOCK_ITEM_NOT_FOUND' });
      expect(repo.createPurchaseOrder).not.toHaveBeenCalled();
    });

    it('throw STOCK_ITEM_NOT_FOUND khi item đã bị soft-delete', async () => {
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        deletedAt: new Date(),
      });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({ code: 'STOCK_ITEM_NOT_FOUND' });
    });

    it('tự điền unitPrice từ SupplierItem khi item để trống giá', async () => {
      supplierSvc.getSupplierItemByItemId.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      await svc.createPurchaseOrder(baseDto, actorId);
      expect(repo.createPurchaseOrder).toHaveBeenCalledWith(
        baseDto,
        expect.any(String),
        [
          {
            itemId,
            sku: 'SKU-1',
            expectedQty: 10,
            unit: 'cái',
            unitPrice: 7000,
          },
        ],
        actorId,
      );
    });

    it('giữ nguyên unitPrice nếu user đã nhập tay', async () => {
      const dtoWithPrice = {
        ...baseDto,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            expectedQty: 10,
            unit: 'cái',
            unitPrice: 9999,
          },
        ],
      };
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      await svc.createPurchaseOrder(dtoWithPrice, actorId);
      expect(supplierSvc.getSupplierItemByItemId).not.toHaveBeenCalled();
      expect(repo.createPurchaseOrder).toHaveBeenCalledWith(
        dtoWithPrice,
        expect.any(String),
        [
          {
            itemId,
            sku: 'SKU-1',
            expectedQty: 10,
            unit: 'cái',
            unitPrice: 9999,
          },
        ],
        actorId,
      );
    });

    it('throw PO_PRICE_MISSING khi thiếu giá và SKU chưa có SupplierItem', async () => {
      supplierSvc.getSupplierItemByItemId.mockRejectedValue({
        code: 'SUPPLIER_ITEM_NOT_FOUND',
      });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({
        code: 'PO_PRICE_MISSING',
      });
    });

    it('không đổi mã lỗi khi getSupplierItemByItemId throw lỗi khác SUPPLIER_ITEM_NOT_FOUND', async () => {
      supplierSvc.getSupplierItemByItemId.mockRejectedValue({
        code: 'INTERNAL',
      });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });

    it('throw PO_PRICE_MISSING khi SupplierItem tìm được nhưng isActive=false', async () => {
      supplierSvc.getSupplierItemByItemId.mockResolvedValue({
        purchasePrice: 7000,
        isActive: false,
      });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({
        code: 'PO_PRICE_MISSING',
      });
      expect(repo.createPurchaseOrder).not.toHaveBeenCalled();
    });

    it('sinh poNumber theo format PO-YYYYMMDD-xxxx', async () => {
      repo.countByPoNumberPrefix.mockResolvedValue(4);
      supplierSvc.getSupplierItemByItemId.mockResolvedValue({
        purchasePrice: 1000,
        isActive: true,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      await svc.createPurchaseOrder(baseDto, actorId);
      const poNumberArg = repo.createPurchaseOrder.mock.calls[0][1] as string;
      expect(poNumberArg).toMatch(/^PO-\d{8}-0005$/);
    });
  });

  describe('getPurchaseOrder', () => {
    it('throw PO_NOT_FOUND khi không tìm thấy', async () => {
      repo.findPurchaseOrderById.mockResolvedValue(null);
      await expect(svc.getPurchaseOrder('po1')).rejects.toMatchObject({
        code: 'PO_NOT_FOUND',
      });
    });

    it('trả về PO khi tìm thấy', async () => {
      repo.findPurchaseOrderById.mockResolvedValue({ poNumber: 'PO-X' });
      await expect(svc.getPurchaseOrder('po1')).resolves.toEqual({
        poNumber: 'PO-X',
      });
    });
  });

  describe('listPurchaseOrders', () => {
    it('gọi repo.findPurchaseOrders với query nguyên vẹn', async () => {
      repo.findPurchaseOrders.mockResolvedValue({ data: [], total: 0 });
      await svc.listPurchaseOrders({ page: 2, limit: 10 });
      expect(repo.findPurchaseOrders).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
      });
    });
  });

  describe('applyReceivedQty', () => {
    const poId = 'po1';
    const session = {} as never;

    it('set PARTIALLY_RECEIVED khi còn item chưa nhận đủ', async () => {
      repo.findPurchaseOrderByIdWithSession.mockResolvedValue({
        items: [
          { itemId, expectedQty: 100, receivedQty: 50 },
          { itemId: 'item002', expectedQty: 30, receivedQty: 30 },
        ],
      });
      await svc.applyReceivedQty(poId, itemId, 20, session);
      expect(repo.applyReceivedQtyAndStatus).toHaveBeenCalledWith(
        poId,
        itemId,
        20,
        'PARTIALLY_RECEIVED',
        session,
      );
    });

    it('set COMPLETED khi mọi item đã nhận đủ expectedQty', async () => {
      repo.findPurchaseOrderByIdWithSession.mockResolvedValue({
        items: [
          { itemId, expectedQty: 100, receivedQty: 80 },
          { itemId: 'item002', expectedQty: 30, receivedQty: 30 },
        ],
      });
      await svc.applyReceivedQty(poId, itemId, 20, session);
      expect(repo.applyReceivedQtyAndStatus).toHaveBeenCalledWith(
        poId,
        itemId,
        20,
        'COMPLETED',
        session,
      );
    });

    it('throw PO_NOT_FOUND nếu PO không tồn tại trong transaction', async () => {
      repo.findPurchaseOrderByIdWithSession.mockResolvedValue(null);
      await expect(
        svc.applyReceivedQty(poId, itemId, 20, session),
      ).rejects.toMatchObject({ code: 'PO_NOT_FOUND' });
    });
  });
});
