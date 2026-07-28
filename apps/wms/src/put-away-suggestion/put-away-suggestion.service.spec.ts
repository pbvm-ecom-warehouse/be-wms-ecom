import { Types } from 'mongoose';
import { AppException } from '@app/common/errors/app.exception';
import { PutAwaySuggestionService } from './put-away-suggestion.service';

const makeStockRepo = () => ({
  findItemBySku: jest.fn(),
  findOccupiedVolumeByCell: jest.fn().mockResolvedValue(new Map()),
  findCellIdsWithItem: jest.fn().mockResolvedValue(new Set<string>()),
  findCellIdsWithItemAndLot: jest.fn().mockResolvedValue(new Set<string>()),
});

const makeLocationRepo = () => ({ findCells: jest.fn() });
const makeConfig = () => ({ get: jest.fn().mockReturnValue(1) });
const makeNavigation = () => ({
  getPath: jest.fn((rackId: string) =>
    Promise.resolve({
      startGateCode: 'GATE-01',
      targetRackId: rackId,
      points: [
        { xM: 0, yM: 0 },
        { xM: Number(rackId.slice(-1)) || 1, yM: 0 },
      ],
      distanceM: Number(rackId.slice(-1)) || 1,
    }),
  ),
});

function cell(code: string, volumeCm3: number, rackId = 'rack-1') {
  const id = new Types.ObjectId();
  return {
    _id: id,
    shelfId: new Types.ObjectId(),
    rackId: { toString: () => rackId },
    code,
    level: 1,
    bay: Number(code.match(/B(\d+)$/)?.[1] ?? 1),
    innerDepth: volumeCm3 / 100,
    innerWidth: 10,
    innerHeight: 10,
    fillFactor: 1,
  };
}

describe('PutAwaySuggestionService theo khoang', () => {
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let locationRepo: ReturnType<typeof makeLocationRepo>;
  let navigation: ReturnType<typeof makeNavigation>;
  let service: PutAwaySuggestionService;

  beforeEach(() => {
    stockRepo = makeStockRepo();
    locationRepo = makeLocationRepo();
    navigation = makeNavigation();
    service = new PutAwaySuggestionService(
      stockRepo as never,
      locationRepo as never,
      makeConfig() as never,
      navigation as never,
    );
    stockRepo.findItemBySku.mockResolvedValue({
      _id: new Types.ObjectId(),
      sku: 'SKU-1',
      depth: 10,
      width: 10,
      height: 10,
    });
  });

  it('yêu cầu kích thước khi cả snapshot và master data đều thiếu', async () => {
    stockRepo.findItemBySku.mockResolvedValue({
      _id: new Types.ObjectId(),
      sku: 'SKU-1',
    });

    await expect(service.suggest('SKU-1', 2)).resolves.toEqual({
      suggestions: [],
      warning: 'ITEM_NO_DIMENSIONS',
    });
  });

  it('loại khoang không vừa kích thước thùng', async () => {
    locationRepo.findCells.mockResolvedValue([cell('R1-T1-B1', 500)]);

    await expect(service.suggest('SKU-1', 1)).resolves.toEqual({
      suggestions: [],
      warning: 'NO_SHELF_FITS',
    });
  });

  it('ưu tiên khoang cùng SKU và lô trước best-fit', async () => {
    const sameLot = cell('R1-T1-B1', 5000, 'rack-2');
    const empty = cell('R1-T1-B2', 2000, 'rack-1');
    locationRepo.findCells.mockResolvedValue([empty, sameLot]);
    stockRepo.findCellIdsWithItem.mockResolvedValue(
      new Set([sameLot._id.toString()]),
    );
    stockRepo.findCellIdsWithItemAndLot.mockResolvedValue(
      new Set([sameLot._id.toString()]),
    );

    const result = await service.suggest('SKU-1', 1, {
      lotId: new Types.ObjectId().toString(),
      packageVolumeCm3: 1000,
      packageDepthCm: 10,
      packageWidthCm: 10,
      packageHeightCm: 10,
    });

    expect(result.suggestions[0]).toMatchObject({
      cellId: sameLot._id.toString(),
      reason: 'SAME_SKU_LOT_CELL',
      capacity: 5,
    });
  });

  it('chia một dòng qua nhiều khoang và cảnh báo khi tổng sức chứa không đủ', async () => {
    const first = cell('R1-T1-B1', 2000, 'rack-1');
    const second = cell('R1-T1-B2', 3000, 'rack-2');
    locationRepo.findCells.mockResolvedValue([second, first]);

    const result = await service.suggest('SKU-1', 6, {
      packageVolumeCm3: 1000,
      packageDepthCm: 10,
      packageWidthCm: 10,
      packageHeightCm: 10,
    });

    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions.map((entry) => entry.capacity)).toEqual([2, 3]);
    expect(result.warning).toBe('INSUFFICIENT_CAPACITY');
  });

  it('bỏ rack không có đường đi và trả NO_NAVIGATION_PATH nếu không còn ứng viên', async () => {
    locationRepo.findCells.mockResolvedValue([cell('R1-T1-B1', 5000)]);
    navigation.getPath.mockRejectedValue(
      new AppException('NAVIGATION_RACK_NOT_CONNECTED'),
    );

    const result = await service.suggest('SKU-1', 1, {
      packageVolumeCm3: 1000,
      packageDepthCm: 10,
      packageWidthCm: 10,
      packageHeightCm: 10,
    });

    expect(result).toEqual({ suggestions: [], warning: 'NO_NAVIGATION_PATH' });
  });
});
