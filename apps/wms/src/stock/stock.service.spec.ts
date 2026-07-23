import { Types } from 'mongoose';
import { EVENTS } from '@app/events';
import { StockService } from './stock.service';
import { ItemType } from './schemas/warehouse-item.schema';

const makeRepo = () => ({
  findSkuById: jest.fn(),
  findItemBySku: jest.fn(),
  createItem: jest.fn(),
  findItems: jest.fn(),
  findItemByIdDocument: jest.fn(),
  updateItem: jest.fn(),
  softDeleteItem: jest.fn(),
  findSkuAndMinQuantityById: jest.fn(),
  findBalanceByItemAndWarehouse: jest.fn(),
});

const makeQueue = () => ({
  add: jest.fn(),
});

const makeSkuTemplateService = () => ({
  resolveAndBuildSku: jest.fn(),
});

const makeBarcodeService = () => ({
  generateAndReservePrimaryBarcode: jest.fn(),
});

const makeTransactionHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeCloudinaryService = () => ({
  uploadImage: jest.fn(),
});

describe('StockService', () => {
  let svc: StockService;
  let repo: ReturnType<typeof makeRepo>;
  let queue: ReturnType<typeof makeQueue>;
  let notificationQueue: ReturnType<typeof makeQueue>;
  let skuTemplateSvc: ReturnType<typeof makeSkuTemplateService>;
  let barcodeSvc: ReturnType<typeof makeBarcodeService>;
  let txHelper: ReturnType<typeof makeTransactionHelper>;
  let cloudinary: ReturnType<typeof makeCloudinaryService>;

  beforeEach(() => {
    repo = makeRepo();
    queue = makeQueue();
    notificationQueue = makeQueue();
    skuTemplateSvc = makeSkuTemplateService();
    barcodeSvc = makeBarcodeService();
    txHelper = makeTransactionHelper();
    cloudinary = makeCloudinaryService();
    svc = new StockService(
      repo as never,
      queue as never,
      notificationQueue as never,
      skuTemplateSvc as never,
      barcodeSvc as never,
      txHelper as never,
      cloudinary as never,
    );
  });

  describe('createWarehouseItem', () => {
    const actorId = new Types.ObjectId().toString();
    const dto = {
      type: ItemType.MATERIAL,
      templateId: 'MATERIAL_SYRUP',
      attributeOptionIds: ['opt-flavor', 'opt-spec'],
      name: 'Syrup đào',
      unit: 'chai',
    };

    it('reject CUP_PRINTED — không cho tạo thủ công qua API public', async () => {
      await expect(
        svc.createWarehouseItem(
          { ...dto, type: ItemType.CUP_PRINTED } as never,
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'STOCK_SKU_TEMPLATE_MISMATCH' });
      expect(skuTemplateSvc.resolveAndBuildSku).not.toHaveBeenCalled();
    });

    it('resolve SKU qua SkuTemplateService, sinh barcode, tạo item trong transaction', async () => {
      skuTemplateSvc.resolveAndBuildSku.mockResolvedValue({
        sku: 'MAT-SYR-PEACH-750ML',
        attributeSnapshot: [
          {
            key: 'FLAVOR',
            optionId: 'opt-flavor',
            name: 'Đào',
            value: 'Đào',
            code: 'PEACH',
          },
        ],
      });
      barcodeSvc.generateAndReservePrimaryBarcode.mockResolvedValue(
        '2000000000015',
      );
      const createdDoc = {
        _id: new Types.ObjectId(),
        sku: 'MAT-SYR-PEACH-750ML',
      };
      repo.createItem.mockResolvedValue(createdDoc);

      const result = await svc.createWarehouseItem(dto as never, actorId);

      expect(skuTemplateSvc.resolveAndBuildSku).toHaveBeenCalledWith(
        'MATERIAL_SYRUP',
        ItemType.MATERIAL,
        ['opt-flavor', 'opt-spec'],
      );
      expect(repo.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: 'MAT-SYR-PEACH-750ML',
          barcode: '2000000000015',
        }),
        new Types.ObjectId(actorId),
        expect.anything(),
      );
      expect(result).toBe(createdDoc);
    });

    it('map lỗi 11000 trên sku (race hiếm) thành STOCK_ITEM_SKU_CONFLICT, không throw 500 thô', async () => {
      skuTemplateSvc.resolveAndBuildSku.mockResolvedValue({
        sku: 'MAT-SYR-PEACH-750ML',
        attributeSnapshot: [],
      });
      barcodeSvc.generateAndReservePrimaryBarcode.mockResolvedValue(
        '2000000000015',
      );
      repo.createItem.mockRejectedValue({
        code: 11000,
        keyPattern: { sku: 1 },
      });

      await expect(
        svc.createWarehouseItem(dto as never, actorId),
      ).rejects.toMatchObject({ code: 'STOCK_ITEM_SKU_CONFLICT' });
    });

    it('lỗi 11000 khác field sku (fallback) vẫn map về STOCK_ITEM_SKU_CONFLICT nếu không nhận diện được keyPattern', async () => {
      skuTemplateSvc.resolveAndBuildSku.mockResolvedValue({
        sku: 'MAT-SYR-PEACH-750ML',
        attributeSnapshot: [],
      });
      barcodeSvc.generateAndReservePrimaryBarcode.mockResolvedValue(
        '2000000000015',
      );
      repo.createItem.mockRejectedValue({ code: 11000, keyPattern: {} });

      await expect(
        svc.createWarehouseItem(dto as never, actorId),
      ).rejects.toMatchObject({ code: 'STOCK_ITEM_SKU_CONFLICT' });
    });
  });

  describe('emitStockChanged', () => {
    it('gọi queue.add với jobId deterministic refType:refId:sku', async () => {
      await svc.emitStockChanged('SKU-1', 20, 'grn', 'grn1');

      expect(queue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: 'SKU-1', delta: 20 },
        { jobId: 'grn:grn1:SKU-1' },
      );
    });

    it('chấp nhận refId dạng ObjectId, chuyển sang string trong jobId', async () => {
      const refId = new Types.ObjectId();

      await svc.emitStockChanged('SKU-2', -5, 'stock-count', refId);

      expect(queue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: 'SKU-2', delta: -5 },
        { jobId: `stock-count:${refId.toString()}:SKU-2` },
      );
    });
  });

  describe('publishAvailableForItem', () => {
    it('tra sku qua findSkuById rồi forward refType/refId xuống emitStockChanged', async () => {
      repo.findSkuById.mockResolvedValue({ sku: 'SKU-3' });

      await svc.publishAvailableForItem('item1', 35, 'grn', 'grn1');

      expect(repo.findSkuById).toHaveBeenCalledWith('item1');
      expect(queue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: 'SKU-3', delta: 35 },
        { jobId: 'grn:grn1:SKU-3' },
      );
    });

    it('không gọi emitStockChanged khi findSkuById trả null', async () => {
      repo.findSkuById.mockResolvedValue(null);

      await svc.publishAvailableForItem('item-not-found', 10, 'grn', 'grn1');

      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('listWarehouseItems', () => {
    it('forward query xuống repo.findItems, trả nguyên kết quả', async () => {
      const mockResult = { data: [{ sku: 'A' }], total: 1 };
      repo.findItems.mockResolvedValue(mockResult);

      const result = await svc.listWarehouseItems({ search: 'a' });

      expect(repo.findItems).toHaveBeenCalledWith({ search: 'a' });
      expect(result).toBe(mockResult);
    });
  });

  describe('getWarehouseItem', () => {
    it('trả document khi tìm thấy', async () => {
      const mockDoc = { _id: new Types.ObjectId(), sku: 'SKU-1' };
      repo.findItemByIdDocument.mockResolvedValue(mockDoc);

      const result = await svc.getWarehouseItem('item1');

      expect(repo.findItemByIdDocument).toHaveBeenCalledWith('item1');
      expect(result).toBe(mockDoc);
    });

    it('throw STOCK_ITEM_NOT_FOUND khi không tìm thấy', async () => {
      repo.findItemByIdDocument.mockResolvedValue(null);

      await expect(svc.getWarehouseItem('missing')).rejects.toMatchObject({
        code: 'STOCK_ITEM_NOT_FOUND',
      });
    });
  });

  describe('updateWarehouseItem', () => {
    const actorId = new Types.ObjectId().toString();

    it('trả document đã cập nhật khi thành công', async () => {
      const mockDoc = { _id: new Types.ObjectId(), name: 'Tên mới' };
      repo.updateItem.mockResolvedValue(mockDoc);

      const result = await svc.updateWarehouseItem(
        'item1',
        { name: 'Tên mới' },
        actorId,
      );

      expect(repo.updateItem).toHaveBeenCalledWith(
        'item1',
        { name: 'Tên mới' },
        actorId,
      );
      expect(result).toBe(mockDoc);
    });

    it('throw STOCK_ITEM_NOT_FOUND khi không tìm thấy/đã xoá', async () => {
      repo.updateItem.mockResolvedValue(null);

      await expect(
        svc.updateWarehouseItem('missing', { name: 'X' }, actorId),
      ).rejects.toMatchObject({ code: 'STOCK_ITEM_NOT_FOUND' });
    });
  });

  describe('checkAndEmitStockLow', () => {
    const itemId = new Types.ObjectId();
    const warehouseId = new Types.ObjectId();

    it('minQuantity không set → không emit', async () => {
      repo.findSkuAndMinQuantityById.mockResolvedValue({
        sku: 'SKU-1',
        minQuantity: undefined,
      });

      await svc.checkAndEmitStockLow(itemId, warehouseId);

      expect(repo.findBalanceByItemAndWarehouse).not.toHaveBeenCalled();
      expect(notificationQueue.add).not.toHaveBeenCalled();
    });

    it('không tìm thấy item → không emit', async () => {
      repo.findSkuAndMinQuantityById.mockResolvedValue(null);

      await svc.checkAndEmitStockLow(itemId, warehouseId);

      expect(notificationQueue.add).not.toHaveBeenCalled();
    });

    it('available ≥ minQuantity → không emit', async () => {
      repo.findSkuAndMinQuantityById.mockResolvedValue({
        sku: 'SKU-1',
        minQuantity: 5,
      });
      repo.findBalanceByItemAndWarehouse.mockResolvedValue({
        onHand: 10,
        reserved: 0,
        expired: 0,
      });

      await svc.checkAndEmitStockLow(itemId, warehouseId);

      expect(notificationQueue.add).not.toHaveBeenCalled();
    });

    it('available < minQuantity → emit stock.low KHÔNG kèm jobId (không dedup)', async () => {
      repo.findSkuAndMinQuantityById.mockResolvedValue({
        sku: 'SKU-1',
        minQuantity: 5,
      });
      repo.findBalanceByItemAndWarehouse.mockResolvedValue({
        onHand: 3,
        reserved: 1,
        expired: 0,
      });

      await svc.checkAndEmitStockLow(itemId, warehouseId);

      expect(notificationQueue.add).toHaveBeenCalledWith(EVENTS.STOCK_LOW, {
        sku: 'SKU-1',
        warehouseId: warehouseId.toString(),
        available: 2,
        minQuantity: 5,
      });
      // không truyền option thứ 3 ({ jobId }) — khớp quyết định "không dedup"
      expect(notificationQueue.add.mock.calls[0]).toHaveLength(2);
    });

    it('không tìm thấy StockBalance cho (item,warehouse) → không emit', async () => {
      repo.findSkuAndMinQuantityById.mockResolvedValue({
        sku: 'SKU-1',
        minQuantity: 5,
      });
      repo.findBalanceByItemAndWarehouse.mockResolvedValue(null);

      await svc.checkAndEmitStockLow(itemId, warehouseId);

      expect(notificationQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('deleteWarehouseItem', () => {
    const actorId = new Types.ObjectId().toString();

    it('gọi softDeleteItem, không throw khi thành công', async () => {
      repo.softDeleteItem.mockResolvedValue(true);

      await expect(
        svc.deleteWarehouseItem('item1', actorId),
      ).resolves.toBeUndefined();
      expect(repo.softDeleteItem).toHaveBeenCalledWith('item1', actorId);
    });

    it('throw STOCK_ITEM_NOT_FOUND khi không tìm thấy/đã xoá', async () => {
      repo.softDeleteItem.mockResolvedValue(false);

      await expect(
        svc.deleteWarehouseItem('missing', actorId),
      ).rejects.toMatchObject({ code: 'STOCK_ITEM_NOT_FOUND' });
    });
  });
});
