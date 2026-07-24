import { Types } from 'mongoose';
import { PutAwaySuggestionService } from './put-away-suggestion.service';

const makeStockRepo = () => ({
  findItemBySku: jest.fn(),
  findOccupiedVolume: jest.fn(),
  findShelfIdsWithItem: jest.fn(),
});

const makeLocationRepo = () => ({
  findShelves: jest.fn(),
});

const makeConfigService = (fillFactor = 0.75) => ({
  get: jest.fn().mockReturnValue(fillFactor),
});

describe('PutAwaySuggestionService', () => {
  let svc: PutAwaySuggestionService;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let locationRepo: ReturnType<typeof makeLocationRepo>;
  let configService: ReturnType<typeof makeConfigService>;

  beforeEach(() => {
    stockRepo = makeStockRepo();
    locationRepo = makeLocationRepo();
    configService = makeConfigService();
    svc = new PutAwaySuggestionService(
      stockRepo as never,
      locationRepo as never,
      configService as never,
    );
  });

  it('throw PUTAWAY_ITEM_NOT_FOUND khi sku không tồn tại', async () => {
    stockRepo.findItemBySku.mockResolvedValue(null);
    await expect(svc.suggest('SKU-X', 10)).rejects.toMatchObject({
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
    const result = await svc.suggest('SKU-X', 10);
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
    locationRepo.findShelves.mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        code: 'A1-1',
        innerDepth: 50,
        innerWidth: 50,
        innerHeight: 50,
        fillFactor: null,
      },
    ]);

    const result = await svc.suggest('SKU-BIG', 5);
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
    locationRepo.findShelves.mockResolvedValue([shelfSameSku, shelfEmpty]);
    // shelfSameSku đã chiếm 1 chút thể tích (bởi chính SKU này) — vẫn còn đủ chỗ.
    stockRepo.findOccupiedVolume.mockResolvedValue(
      new Map([[shelfSameSku._id.toString(), 1000]]),
    );
    // findShelfIdsWithItem xác định chính xác shelf nào có ĐÚNG itemId này
    // (không suy diễn từ occupied>0, vốn gộp mọi SKU trên shelf).
    stockRepo.findShelfIdsWithItem.mockResolvedValue(
      new Set([shelfSameSku._id.toString()]),
    );

    const result = await svc.suggest('SKU-A', 10);

    expect(result.warning).toBeNull();
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].shelfCode).toBe('A1-1');
  });

  it('best-fit: chọn shelf free nhỏ nhất trong các shelf đủ chứa', async () => {
    const itemId = new Types.ObjectId();
    stockRepo.findItemBySku.mockResolvedValue({
      _id: itemId,
      depth: 10,
      width: 10,
      height: 10, // unitVolume = 1000
    });
    const shelfLoose = {
      _id: new Types.ObjectId(),
      code: 'A1-1',
      innerDepth: 100,
      innerWidth: 100,
      innerHeight: 100, // usableVolume = 1_000_000
      fillFactor: 1,
    };
    const shelfTight = {
      _id: new Types.ObjectId(),
      code: 'A1-2',
      innerDepth: 50,
      innerWidth: 50,
      innerHeight: 50, // usableVolume = 125_000
      fillFactor: 1,
    };
    locationRepo.findShelves.mockResolvedValue([shelfLoose, shelfTight]);
    stockRepo.findOccupiedVolume.mockResolvedValue(new Map());
    stockRepo.findShelfIdsWithItem.mockResolvedValue(new Set());

    // qty=10 → cần capacity >= 10 (10 * 1000 = 10_000 cm³).
    // shelfLoose free=1_000_000 → capacity 1000. shelfTight free=125_000 → capacity 125.
    // Cả 2 đủ chứa qty=10 → chọn free nhỏ nhất = shelfTight.
    const result = await svc.suggest('SKU-A', 10);

    expect(result.warning).toBeNull();
    expect(result.suggestions[0].shelfCode).toBe('A1-2');
  });

  it('trả tổ hợp nhiều shelf khi không shelf đơn nào đủ qty', async () => {
    const itemId = new Types.ObjectId();
    stockRepo.findItemBySku.mockResolvedValue({
      _id: itemId,
      depth: 10,
      width: 10,
      height: 10, // unitVolume = 1000
    });
    // innerHeight tối thiểu 10 (bằng chiều nhỏ nhất của item 10x10x10) để lọt
    // qua kiểm tra fit 3 chiều — brief gốc dùng innerHeight 3/2 (nhỏ hơn item,
    // không thể lọt fit 3 chiều), ở đây giữ nguyên usableVolume/capacity dự
    // kiến (30/20) nhưng đổi bố trí kích thước để vẫn fit được về mặt 3 chiều.
    const shelfA = {
      _id: new Types.ObjectId(),
      code: 'A1-1',
      innerDepth: 100,
      innerWidth: 30,
      innerHeight: 10, // usableVolume = 30_000 → capacity 30
      fillFactor: 1,
    };
    const shelfB = {
      _id: new Types.ObjectId(),
      code: 'A1-2',
      innerDepth: 100,
      innerWidth: 20,
      innerHeight: 10, // usableVolume = 20_000 → capacity 20
      fillFactor: 1,
    };
    locationRepo.findShelves.mockResolvedValue([shelfA, shelfB]);
    stockRepo.findOccupiedVolume.mockResolvedValue(new Map());
    stockRepo.findShelfIdsWithItem.mockResolvedValue(new Set());

    // qty=45: không shelf đơn nào đủ (30 và 20 đều < 45), tổng 50 >= 45.
    const result = await svc.suggest('SKU-A', 45);

    expect(result.warning).toBeNull();
    expect(result.suggestions).toEqual([
      { shelfCode: 'A1-1', capacity: 30 },
      { shelfCode: 'A1-2', capacity: 20 },
    ]);
  });

  it('trả warning INSUFFICIENT_CAPACITY khi tổng capacity vẫn không đủ qty', async () => {
    const itemId = new Types.ObjectId();
    stockRepo.findItemBySku.mockResolvedValue({
      _id: itemId,
      depth: 10,
      width: 10,
      height: 10,
    });
    // Cùng lý do đổi bố trí kích thước như test tổ hợp ở trên — giữ capacity 30
    // nhưng vẫn lọt fit 3 chiều với item 10x10x10.
    const shelfA = {
      _id: new Types.ObjectId(),
      code: 'A1-1',
      innerDepth: 100,
      innerWidth: 30,
      innerHeight: 10,
      fillFactor: 1,
    };
    locationRepo.findShelves.mockResolvedValue([shelfA]);
    stockRepo.findOccupiedVolume.mockResolvedValue(new Map());
    stockRepo.findShelfIdsWithItem.mockResolvedValue(new Set());

    const result = await svc.suggest('SKU-A', 999);

    expect(result.warning).toBe('INSUFFICIENT_CAPACITY');
    expect(result.suggestions).toEqual([{ shelfCode: 'A1-1', capacity: 30 }]);
  });
});
