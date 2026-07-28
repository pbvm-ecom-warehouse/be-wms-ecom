// apps/wms/src/purchase-order/purchase-order.service.spec.ts
import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PurchaseOrderService } from './purchase-order.service';

const makeRepo = () => ({
  createPurchaseOrder: jest.fn(),
  findPurchaseOrderById: jest.fn(),
  findPurchaseOrders: jest.fn(),
  findReceivablePurchaseOrders: jest.fn(),
  countByPoNumberPrefix: jest.fn(),
  findPurchaseOrderByIdWithSession: jest.fn(),
  applyReceivedQtyAndStatus: jest.fn(),
  existsByItemId: jest.fn(),
});

const makeSupplierService = () => ({
  assertSupplierActive: jest.fn(),
  getSupplierItemByItemAndSupplier: jest.fn(),
  listSuppliersByIds: jest.fn().mockResolvedValue([]),
});

const makeStockRepo = () => ({
  findItemById: jest.fn(),
  findItemsByIds: jest.fn().mockResolvedValue([]),
});

describe('PurchaseOrderService', () => {
  let svc: PurchaseOrderService;
  let repo: ReturnType<typeof makeRepo>;
  let supplierSvc: ReturnType<typeof makeSupplierService>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  const actorId = 'actor123';
  const supplierId = 'sup001';
  const itemId = 'item001';

  beforeEach(() => {
    repo = makeRepo();
    supplierSvc = makeSupplierService();
    stockRepo = makeStockRepo();
    svc = new PurchaseOrderService(
      repo as never,
      supplierSvc as never,
      stockRepo as never,
    );
    repo.countByPoNumberPrefix.mockResolvedValue(0);
    supplierSvc.assertSupplierActive.mockResolvedValue(undefined);
    stockRepo.findItemById.mockResolvedValue({
      _id: itemId,
      sku: 'SKU-1',
      unit: 'thùng',
      deletedAt: null,
    });
  });

  describe('createPurchaseOrder', () => {
    const baseDto = {
      supplierId,
      items: [{ itemId, expectedQty: 10, unit: 'thùng' }],
    };

    it('throw PO_UNIT_MUST_MATCH_ITEM khi unit đặt hàng khác WarehouseItem.unit', async () => {
      const dtoWrongUnit = {
        ...baseDto,
        items: [{ itemId, expectedQty: 10, unit: 'cái' }],
      };
      await expect(
        svc.createPurchaseOrder(dtoWrongUnit as never, actorId),
      ).rejects.toMatchObject({ code: 'PO_UNIT_MUST_MATCH_ITEM' });
      expect(repo.createPurchaseOrder).not.toHaveBeenCalled();
    });

    it('throw SUPPLIER_NOT_ACTIVE khi NCC blacklist/inactive', async () => {
      supplierSvc.assertSupplierActive.mockRejectedValue({
        code: 'SUPPLIER_NOT_ACTIVE',
      });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({
        code: 'SUPPLIER_NOT_ACTIVE',
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

    it('tự điền unitPrice từ SupplierItem đúng cặp (itemId, supplierId)', async () => {
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
        supplierId,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      await svc.createPurchaseOrder(baseDto, actorId);
      expect(supplierSvc.getSupplierItemByItemAndSupplier).toHaveBeenCalledWith(
        itemId,
        supplierId,
      );
      expect(repo.createPurchaseOrder).toHaveBeenCalledWith(
        baseDto,
        expect.any(String),
        [
          {
            itemId,
            sku: 'SKU-1',
            expectedQty: 10,
            unit: 'thùng',
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
            expectedQty: 10,
            unit: 'thùng',
            unitPrice: 9999,
          },
        ],
      };
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 9999,
        isActive: true,
        supplierId,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      await svc.createPurchaseOrder(dtoWithPrice, actorId);
      expect(repo.createPurchaseOrder).toHaveBeenCalledWith(
        dtoWithPrice,
        expect.any(String),
        [
          {
            itemId,
            sku: 'SKU-1',
            expectedQty: 10,
            unit: 'thùng',
            unitPrice: 9999,
          },
        ],
        actorId,
      );
    });

    it('không chặn PO và không log cảnh báo khi unitPrice nhập tay khớp SupplierItem.purchasePrice', async () => {
      const dtoWithPrice = {
        ...baseDto,
        items: [
          {
            itemId,
            expectedQty: 10,
            unit: 'thùng',
            unitPrice: 7000,
          },
        ],
      };
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
        supplierId,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      await svc.createPurchaseOrder(dtoWithPrice, actorId);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('ghi log cảnh báo (không chặn PO) khi unitPrice nhập tay lệch so với SupplierItem.purchasePrice', async () => {
      const dtoWithPrice = {
        ...baseDto,
        items: [
          {
            itemId,
            expectedQty: 10,
            unit: 'thùng',
            unitPrice: 9999,
          },
        ],
      };
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
        supplierId,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      await svc.createPurchaseOrder(dtoWithPrice, actorId);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SKU-1'));
      expect(repo.createPurchaseOrder).toHaveBeenCalledWith(
        dtoWithPrice,
        expect.any(String),
        [
          {
            itemId,
            sku: 'SKU-1',
            expectedQty: 10,
            unit: 'thùng',
            unitPrice: 9999,
          },
        ],
        actorId,
      );
      warnSpy.mockRestore();
    });

    it('không throw, không log khi unitPrice nhập tay nhưng SKU chưa có báo giá NCC (SUPPLIER_ITEM_NOT_FOUND)', async () => {
      const dtoWithPrice = {
        ...baseDto,
        items: [
          {
            itemId,
            expectedQty: 10,
            unit: 'thùng',
            unitPrice: 9999,
          },
        ],
      };
      supplierSvc.getSupplierItemByItemAndSupplier.mockRejectedValue({
        code: 'SUPPLIER_ITEM_NOT_FOUND',
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      await svc.createPurchaseOrder(dtoWithPrice, actorId);
      expect(repo.createPurchaseOrder).toHaveBeenCalledWith(
        dtoWithPrice,
        expect.any(String),
        [
          {
            itemId,
            sku: 'SKU-1',
            expectedQty: 10,
            unit: 'thùng',
            unitPrice: 9999,
          },
        ],
        actorId,
      );
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('không so sánh khi SupplierItem tồn tại nhưng isActive=false (coi như chưa có giá chính thống)', async () => {
      const dtoWithPrice = {
        ...baseDto,
        items: [
          {
            itemId,
            expectedQty: 10,
            unit: 'thùng',
            unitPrice: 9999,
          },
        ],
      };
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: false,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      await svc.createPurchaseOrder(dtoWithPrice, actorId);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('throw PO_PRICE_MISSING khi thiếu giá và SKU chưa có SupplierItem', async () => {
      supplierSvc.getSupplierItemByItemAndSupplier.mockRejectedValue({
        code: 'SUPPLIER_ITEM_NOT_FOUND',
      });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({
        code: 'PO_PRICE_MISSING',
      });
    });

    it('không đổi mã lỗi khi getSupplierItemByItemAndSupplier throw lỗi khác SUPPLIER_ITEM_NOT_FOUND', async () => {
      supplierSvc.getSupplierItemByItemAndSupplier.mockRejectedValue({
        code: 'INTERNAL',
      });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({
        code: 'INTERNAL',
      });
    });

    it('throw PO_PRICE_MISSING khi SupplierItem tìm được nhưng isActive=false', async () => {
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
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

    it('throw PO_QTY_BELOW_MOQ khi expectedQty < SupplierItem.minOrderQty', async () => {
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
        minOrderQty: 50,
      });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).rejects.toMatchObject({ code: 'PO_QTY_BELOW_MOQ' });
      expect(repo.createPurchaseOrder).not.toHaveBeenCalled();
    });

    it('không chặn PO khi expectedQty >= SupplierItem.minOrderQty', async () => {
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
        minOrderQty: 10,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).resolves.toBeDefined();
    });

    it('không chặn PO khi SupplierItem không khai báo minOrderQty', async () => {
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      await expect(
        svc.createPurchaseOrder(baseDto as never, actorId),
      ).resolves.toBeDefined();
    });

    it('không check MOQ khi unitPrice nhập tay nhưng SKU chưa có báo giá NCC', async () => {
      const dtoWithPrice = {
        ...baseDto,
        items: [{ itemId, expectedQty: 1, unit: 'thùng', unitPrice: 500 }],
      };
      supplierSvc.getSupplierItemByItemAndSupplier.mockRejectedValue({
        code: 'SUPPLIER_ITEM_NOT_FOUND',
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      await expect(
        svc.createPurchaseOrder(dtoWithPrice, actorId),
      ).resolves.toBeDefined();
      warnSpy.mockRestore();
    });

    it('throw PO_QTY_BELOW_MOQ ngay cả khi unitPrice đã nhập tay', async () => {
      const dtoWithPrice = {
        ...baseDto,
        items: [
          {
            itemId,
            expectedQty: 1,
            unit: 'thùng',
            unitPrice: 7000,
          },
        ],
      };
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
        minOrderQty: 50,
      });
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      await expect(
        svc.createPurchaseOrder(dtoWithPrice, actorId),
      ).rejects.toMatchObject({ code: 'PO_QTY_BELOW_MOQ' });
      warnSpy.mockRestore();
    });

    it('tự tính expectedDate = orderDate + leadTimeDays khi client không truyền expectedDate', async () => {
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
        leadTimeDays: 5,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      const before = Date.now();
      await svc.createPurchaseOrder(baseDto, actorId);
      const dtoArg = repo.createPurchaseOrder.mock.calls[0][0] as {
        expectedDate?: string;
      };
      expect(dtoArg.expectedDate).toBeDefined();
      const expectedMs = new Date(dtoArg.expectedDate!).getTime();
      const diffDays = (expectedMs - before) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(4.9);
      expect(diffDays).toBeLessThan(5.1);
    });

    it('giữ nguyên expectedDate do client truyền, không ghi đè bằng leadTimeDays', async () => {
      const dtoWithDate = { ...baseDto, expectedDate: '2026-01-01' };
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
        leadTimeDays: 5,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      await svc.createPurchaseOrder(dtoWithDate, actorId);
      const dtoArg = repo.createPurchaseOrder.mock.calls[0][0] as {
        expectedDate?: string;
      };
      expect(dtoArg.expectedDate).toBe('2026-01-01');
    });

    it('không set expectedDate khi client không truyền và SupplierItem không có leadTimeDays', async () => {
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 7000,
        isActive: true,
      });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      await svc.createPurchaseOrder(baseDto, actorId);
      const dtoArg = repo.createPurchaseOrder.mock.calls[0][0] as {
        expectedDate?: string;
      };
      expect(dtoArg.expectedDate).toBeUndefined();
    });

    it('lấy leadTimeDays lớn nhất trong nhiều dòng hàng để tính expectedDate', async () => {
      const multiItemDto = {
        supplierId,
        items: [
          { itemId, expectedQty: 10, unit: 'thùng' },
          { itemId: 'item002', expectedQty: 10, unit: 'thùng' },
        ],
      };
      stockRepo.findItemById.mockImplementation((id: string) =>
        Promise.resolve({
          _id: id,
          sku: id === itemId ? 'SKU-1' : 'SKU-2',
          unit: 'thùng',
          deletedAt: null,
        }),
      );
      supplierSvc.getSupplierItemByItemAndSupplier
        .mockResolvedValueOnce({
          purchasePrice: 7000,
          isActive: true,
          leadTimeDays: 3,
        })
        .mockResolvedValueOnce({
          purchasePrice: 5000,
          isActive: true,
          leadTimeDays: 7,
        });
      repo.createPurchaseOrder.mockResolvedValue({ poNumber: 'PO-X' });
      const before = Date.now();
      await svc.createPurchaseOrder(multiItemDto, actorId);
      const dtoArg = repo.createPurchaseOrder.mock.calls[0][0] as {
        expectedDate?: string;
      };
      const diffDays =
        (new Date(dtoArg.expectedDate!).getTime() - before) /
        (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(6.9);
      expect(diffDays).toBeLessThan(7.1);
    });

    it('sinh poNumber theo format PO-YYYYMMDD-xxxx', async () => {
      repo.countByPoNumberPrefix.mockResolvedValue(4);
      supplierSvc.getSupplierItemByItemAndSupplier.mockResolvedValue({
        purchasePrice: 1000,
        isActive: true,
        supplierId,
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

  describe('hasAnyPurchaseOrderForItem', () => {
    it('trả về true khi repo tìm thấy PO tham chiếu item', async () => {
      repo.existsByItemId.mockResolvedValue(true);
      await expect(svc.hasAnyPurchaseOrderForItem(itemId)).resolves.toBe(true);
      expect(repo.existsByItemId).toHaveBeenCalledWith(itemId);
    });

    it('trả về false khi item chưa có PO nào', async () => {
      repo.existsByItemId.mockResolvedValue(false);
      await expect(svc.hasAnyPurchaseOrderForItem(itemId)).resolves.toBe(false);
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

  describe('listReceivingPurchaseOrders', () => {
    const poObjectId = new Types.ObjectId();
    const supplierObjectId = new Types.ObjectId();
    const itemObjectId1 = new Types.ObjectId();
    const itemObjectId2 = new Types.ObjectId();

    it('chỉ trả các dòng còn remainingQty > 0, gắn itemName + supplierName', async () => {
      repo.findReceivablePurchaseOrders.mockResolvedValue({
        data: [
          {
            _id: poObjectId,
            poNumber: 'PO-X',
            supplierId: supplierObjectId,
            expectedDate: undefined,
            items: [
              {
                itemId: itemObjectId1,
                sku: 'SKU-1',
                unit: 'cái',
                expectedQty: 100,
                receivedQty: 30,
              },
              {
                itemId: itemObjectId2,
                sku: 'SKU-2',
                unit: 'thùng',
                expectedQty: 20,
                receivedQty: 20,
              },
            ],
          },
        ],
        total: 1,
      });
      supplierSvc.listSuppliersByIds.mockResolvedValue([
        { _id: supplierObjectId, name: 'NCC A' },
      ]);
      stockRepo.findItemsByIds.mockResolvedValue([
        { _id: itemObjectId1, name: 'Ly nhựa' },
        { _id: itemObjectId2, name: 'Ống hút' },
      ]);

      const result = await svc.listReceivingPurchaseOrders({});

      expect(result.total).toBe(1);
      expect(result.data).toEqual([
        {
          id: poObjectId.toString(),
          poNumber: 'PO-X',
          supplierName: 'NCC A',
          expectedDate: undefined,
          items: [
            {
              itemId: itemObjectId1.toString(),
              itemName: 'Ly nhựa',
              sku: 'SKU-1',
              unit: 'cái',
              expectedQty: 100,
              receivedQty: 30,
              remainingQty: 70,
            },
          ],
        },
      ]);
    });

    it('fallback supplierName khi không tra được NCC', async () => {
      repo.findReceivablePurchaseOrders.mockResolvedValue({
        data: [
          {
            _id: poObjectId,
            poNumber: 'PO-X',
            supplierId: supplierObjectId,
            expectedDate: undefined,
            items: [],
          },
        ],
        total: 1,
      });
      supplierSvc.listSuppliersByIds.mockResolvedValue([]);

      const result = await svc.listReceivingPurchaseOrders({});

      expect(result.data[0].supplierName).toBe('Không xác định');
    });
  });
});
