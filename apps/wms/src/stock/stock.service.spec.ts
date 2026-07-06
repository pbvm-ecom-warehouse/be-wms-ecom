import { Types } from 'mongoose';
import { StockService } from './stock.service';

const makeRepo = () => ({
  findSkuById: jest.fn(),
  findItemBySku: jest.fn(),
  createItem: jest.fn(),
  findItems: jest.fn(),
  findItemByIdDocument: jest.fn(),
  updateItem: jest.fn(),
  softDeleteItem: jest.fn(),
});

const makeQueue = () => ({
  add: jest.fn(),
});

describe('StockService', () => {
  let svc: StockService;
  let repo: ReturnType<typeof makeRepo>;
  let queue: ReturnType<typeof makeQueue>;

  beforeEach(() => {
    repo = makeRepo();
    queue = makeQueue();
    svc = new StockService(repo as never, queue as never);
  });

  describe('createWarehouseItem', () => {
    const actorId = new Types.ObjectId().toString();
    const dto = {
      sku: 'SKU-1',
      name: 'Ly nhựa 500ml',
      type: 'CUP_BLANK' as const,
      unit: 'cái',
    };

    it('throw STOCK_ITEM_SKU_CONFLICT khi sku đã tồn tại', async () => {
      repo.findItemBySku.mockResolvedValue({ sku: 'SKU-1' });
      await expect(svc.createWarehouseItem(dto, actorId)).rejects.toMatchObject(
        { code: 'STOCK_ITEM_SKU_CONFLICT' },
      );
      expect(repo.createItem).not.toHaveBeenCalled();
    });

    it('throw STOCK_ITEM_SKU_CONFLICT khi sku trùng với bản ghi đã soft-delete', async () => {
      repo.findItemBySku.mockResolvedValue({
        sku: 'SKU-1',
        deletedAt: new Date(),
      });
      await expect(svc.createWarehouseItem(dto, actorId)).rejects.toMatchObject(
        { code: 'STOCK_ITEM_SKU_CONFLICT' },
      );
    });

    it('tạo item mới khi sku chưa tồn tại', async () => {
      repo.findItemBySku.mockResolvedValue(null);
      const mockDoc = { _id: new Types.ObjectId(), ...dto };
      repo.createItem.mockResolvedValue(mockDoc);

      const result = await svc.createWarehouseItem(dto, actorId);

      expect(repo.createItem).toHaveBeenCalledWith(
        dto,
        new Types.ObjectId(actorId),
      );
      expect(result).toBe(mockDoc);
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
