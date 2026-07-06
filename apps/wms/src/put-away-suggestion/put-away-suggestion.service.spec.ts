import { Types } from 'mongoose';
import { PutAwaySuggestionService } from './put-away-suggestion.service';

const makeStockRepo = () => ({
  findItemBySku: jest.fn(),
  findOccupiedVolumeByWarehouse: jest.fn(),
});

const makeWarehouseRepo = () => ({
  findShelvesByWarehouse: jest.fn(),
});

const makeConfigService = (fillFactor = 0.75) => ({
  get: jest.fn().mockReturnValue(fillFactor),
});

describe('PutAwaySuggestionService', () => {
  let svc: PutAwaySuggestionService;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let warehouseRepo: ReturnType<typeof makeWarehouseRepo>;
  let configService: ReturnType<typeof makeConfigService>;

  const warehouseId = new Types.ObjectId().toString();

  beforeEach(() => {
    stockRepo = makeStockRepo();
    warehouseRepo = makeWarehouseRepo();
    configService = makeConfigService();
    svc = new PutAwaySuggestionService(
      stockRepo as never,
      warehouseRepo as never,
      configService as never,
    );
  });

  it('throw PUTAWAY_ITEM_NOT_FOUND khi sku không tồn tại', async () => {
    stockRepo.findItemBySku.mockResolvedValue(null);
    await expect(svc.suggest('SKU-X', 10, warehouseId)).rejects.toMatchObject({
      code: 'PUTAWAY_ITEM_NOT_FOUND',
    });
  });

  it('trả warning ITEM_NO_DIMENSIONS khi item thiếu depth/width/height', async () => {
    stockRepo.findItemBySku.mockResolvedValue({
      _id: new Types.ObjectId(),
      depth: undefined,
      width: 10,
      height: 10,
    });
    const result = await svc.suggest('SKU-X', 10, warehouseId);
    expect(result).toEqual({ suggestions: [], warning: 'ITEM_NO_DIMENSIONS' });
  });

  it('trả warning NO_SHELF_FITS khi hàng vượt mọi shelf', async () => {
    const itemId = new Types.ObjectId();
    stockRepo.findItemBySku.mockResolvedValue({
      _id: itemId,
      depth: 200,
      width: 200,
      height: 200,
    });
    warehouseRepo.findShelvesByWarehouse.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        code: 'A1-1',
        innerDepth: 50,
        innerWidth: 50,
        innerHeight: 50,
        fillFactor: null,
      },
    ]);

    const result = await svc.suggest('SKU-BIG', 5, warehouseId);
    expect(result).toEqual({ suggestions: [], warning: 'NO_SHELF_FITS' });
  });

  it('ưu tiên shelf đã chứa cùng SKU dù shelf khác trống hơn', async () => {
    const itemId = new Types.ObjectId();
    stockRepo.findItemBySku.mockResolvedValue({
      _id: itemId,
      depth: 10,
      width: 10,
      height: 10,
    });
    const shelfSameSku = {
      _id: new Types.ObjectId(),
      code: 'A1-1',
      innerDepth: 100,
      innerWidth: 100,
      innerHeight: 100,
      fillFactor: null,
    };
    const shelfEmpty = {
      _id: new Types.ObjectId(),
      code: 'A1-2',
      innerDepth: 100,
      innerWidth: 100,
      innerHeight: 100,
      fillFactor: null,
    };
    warehouseRepo.findShelvesByWarehouse.mockResolvedValue([
      shelfSameSku,
      shelfEmpty,
    ]);
    // shelfSameSku đã chiếm 1 chút thể tích (bởi chính SKU này) — vẫn còn đủ chỗ.
    stockRepo.findOccupiedVolumeByWarehouse.mockResolvedValue(
      new Map([[shelfSameSku._id.toString(), 1000]]),
    );

    const result = await svc.suggest('SKU-A', 10, warehouseId);

    expect(result.warning).toBeNull();
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].shelfCode).toBe('A1-1');
  });
});
