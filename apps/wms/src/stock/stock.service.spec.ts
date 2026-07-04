import { Types } from 'mongoose';
import { StockService } from './stock.service';

const makeRepo = () => ({
  findSkuById: jest.fn(),
  findItemBySku: jest.fn(),
  createItem: jest.fn(),
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
});
