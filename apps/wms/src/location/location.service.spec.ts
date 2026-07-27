// apps/wms/src/location/location.service.spec.ts
import { LocationService } from './location.service';
import type { StockRepository } from '../stock/stock.repository';

const makeStockRepo = () => ({
  findInventoryByShelfId: jest.fn(),
});

const makeRepo = () => ({
  findStagingShelf: jest.fn(),
  findShelfById: jest.fn(),
  findRackById: jest.fn(),
  findZoneById: jest.fn(),
  findZoneByCode: jest.fn(),
  findRackByCode: jest.fn(),
  findShelfByCode: jest.fn(),
  findAisleByCode: jest.fn(),
  createZone: jest.fn(),
  createRack: jest.fn(),
  createShelf: jest.fn(),
  createAisle: jest.fn(),
  findAllZones: jest.fn(),
  findAllRacks: jest.fn(),
  findAllAisles: jest.fn(),
  findAllGates: jest.fn(),
  getRackTemplate: jest.fn(),
});

describe('LocationService', () => {
  let svc: LocationService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    svc = new LocationService(
      repo as never,
      stockRepo as unknown as StockRepository,
    );
  });

  describe('findStagingShelf', () => {
    it('throw GRN_STAGING_SHELF_NOT_FOUND khi hệ thống chưa cấu hình staging shelf — gọi không tham số', async () => {
      repo.findStagingShelf.mockResolvedValue(null);
      await expect(svc.findStagingShelf()).rejects.toMatchObject({
        code: 'GRN_STAGING_SHELF_NOT_FOUND',
      });
      expect(repo.findStagingShelf).toHaveBeenCalledWith();
    });

    it('trả về shelf khi tìm thấy', async () => {
      const shelf = { _id: 'shelf1', isStaging: true };
      repo.findStagingShelf.mockResolvedValue(shelf);
      await expect(svc.findStagingShelf()).resolves.toEqual(shelf);
    });
  });

  describe('createZone', () => {
    it('throw ZONE_CODE_EXISTS khi code đã tồn tại — không còn scope theo warehouse', async () => {
      repo.findZoneByCode.mockResolvedValue({ _id: 'zone-existing' });
      await expect(
        svc.createZone({ name: 'Khu A', code: 'A' }, 'actor1'),
      ).rejects.toMatchObject({ code: 'ZONE_CODE_EXISTS' });
      expect(repo.createZone).not.toHaveBeenCalled();
    });

    it('tạo zone thành công khi code chưa tồn tại', async () => {
      repo.findZoneByCode.mockResolvedValue(null);
      const created = { _id: 'zone1', code: 'A' };
      repo.createZone.mockResolvedValue(created);

      const result = await svc.createZone(
        { name: 'Khu A', code: 'A' },
        'actor1',
      );

      expect(repo.createZone).toHaveBeenCalledWith(
        { name: 'Khu A', code: 'A' },
        'actor1',
      );
      expect(result).toEqual(created);
    });
  });

  describe('createRack', () => {
    const zoneId = 'zone1';
    const baseDto = { zoneId, name: 'Kệ A1', code: 'A1' };

    it('throw ZONE_NOT_FOUND khi zone cha không tồn tại', async () => {
      repo.findZoneById.mockResolvedValue(null);
      await expect(svc.createRack(baseDto, 'actor1')).rejects.toMatchObject({
        code: 'ZONE_NOT_FOUND',
      });
      expect(repo.createRack).not.toHaveBeenCalled();
    });

    it('throw RACK_CODE_EXISTS khi code đã tồn tại trong zone', async () => {
      repo.findZoneById.mockResolvedValue({ _id: zoneId });
      repo.findRackByCode.mockResolvedValue({ _id: 'rack-existing' });
      await expect(svc.createRack(baseDto, 'actor1')).rejects.toMatchObject({
        code: 'RACK_CODE_EXISTS',
      });
      expect(repo.createRack).not.toHaveBeenCalled();
    });

    it('tạo rack thành công', async () => {
      repo.findZoneById.mockResolvedValue({ _id: zoneId });
      repo.findRackByCode.mockResolvedValue(null);
      const created = { _id: 'rack1', code: 'A1' };
      repo.createRack.mockResolvedValue(created);

      const result = await svc.createRack(baseDto, 'actor1');

      expect(repo.createRack).toHaveBeenCalledWith(baseDto, 'actor1');
      expect(result).toEqual(created);
    });
  });

  describe('createShelf', () => {
    const rackId = 'rack1';
    const baseDto = { rackId, level: 1, code: 'A1-T1' };

    it('throw RACK_NOT_FOUND khi rack cha không tồn tại', async () => {
      repo.findRackById.mockResolvedValue(null);
      await expect(svc.createShelf(baseDto, 'actor1')).rejects.toMatchObject({
        code: 'RACK_NOT_FOUND',
      });
      expect(repo.createShelf).not.toHaveBeenCalled();
    });

    it('throw SHELF_CODE_EXISTS khi code đã tồn tại', async () => {
      repo.findRackById.mockResolvedValue({ _id: rackId });
      repo.findShelfByCode.mockResolvedValue({ _id: 'shelf-existing' });
      await expect(svc.createShelf(baseDto, 'actor1')).rejects.toMatchObject({
        code: 'SHELF_CODE_EXISTS',
      });
      expect(repo.createShelf).not.toHaveBeenCalled();
    });

    it('tạo shelf thành công — repository gọi không còn warehouseId (chỉ dto + actorId)', async () => {
      repo.findRackById.mockResolvedValue({ _id: rackId });
      repo.findShelfByCode.mockResolvedValue(null);
      const created = { _id: 'shelf1', code: 'A1-T1' };
      repo.createShelf.mockResolvedValue(created);

      const result = await svc.createShelf(baseDto, 'actor1');

      expect(repo.createShelf).toHaveBeenCalledWith(baseDto, 'actor1');
      expect(result).toEqual(created);
    });
  });

  describe('createAisle', () => {
    const baseDto = { code: 'MAIN-01', type: 'MAIN' as const };

    it('throw AISLE_CODE_EXISTS khi code đã tồn tại', async () => {
      repo.findAisleByCode.mockResolvedValue({ _id: 'aisle-existing' });
      await expect(svc.createAisle(baseDto, 'actor1')).rejects.toMatchObject({
        code: 'AISLE_CODE_EXISTS',
      });
      expect(repo.createAisle).not.toHaveBeenCalled();
    });

    it('tạo aisle thành công khi code chưa tồn tại', async () => {
      repo.findAisleByCode.mockResolvedValue(null);
      const created = { _id: 'aisle1', code: 'MAIN-01' };
      repo.createAisle.mockResolvedValue(created);

      const result = await svc.createAisle(baseDto, 'actor1');

      expect(repo.createAisle).toHaveBeenCalledWith(baseDto, 'actor1');
      expect(result).toEqual(created);
    });
  });

  describe('getLayout', () => {
    it('ráp zones, racks, aisles, gates, rackTemplate thành 1 object layout', async () => {
      const mockZones = [{ id: 'z1' }];
      const mockRacks = [{ id: 'r1' }];
      const mockAisles = [{ id: 'a1' }];
      const mockGates = [{ id: 'g1' }];
      const mockRackTemplate = { widthM: 10, depthM: 1.5, levelCount: 3, bayCount: 3 };
      repo.findAllZones.mockResolvedValue(mockZones);
      repo.findAllRacks.mockResolvedValue(mockRacks);
      repo.findAllAisles.mockResolvedValue(mockAisles);
      repo.findAllGates.mockResolvedValue(mockGates);
      repo.getRackTemplate.mockResolvedValue(mockRackTemplate);

      const result = await svc.getLayout();

      expect(result).toEqual({
        zones: mockZones,
        racks: mockRacks,
        aisles: mockAisles,
        gates: mockGates,
        rackTemplate: mockRackTemplate,
      });
    });
  });

  describe('getShelfContents', () => {
    it('throw SHELF_NOT_FOUND khi shelf không tồn tại — không gọi stockRepo', async () => {
      repo.findShelfById.mockResolvedValue(null);

      await expect(svc.getShelfContents('shelf-1')).rejects.toMatchObject({
        code: 'SHELF_NOT_FOUND',
      });
      expect(stockRepo.findInventoryByShelfId).not.toHaveBeenCalled();
    });

    it('shelf tồn tại → trả về danh sách tồn kho thật từ stockRepo', async () => {
      repo.findShelfById.mockResolvedValue({ id: 'shelf-1' });
      const rows = [
        {
          id: 'row-1',
          sku: 'SKU-001',
          itemName: 'Áo thun',
          unit: 'cái',
          quantity: 10,
          lotNumber: null,
          expiryDate: null,
        },
      ];
      stockRepo.findInventoryByShelfId.mockResolvedValue(rows);

      const result = await svc.getShelfContents('shelf-1');

      expect(repo.findShelfById).toHaveBeenCalledWith('shelf-1');
      expect(stockRepo.findInventoryByShelfId).toHaveBeenCalledTimes(1);
      expect(result).toEqual(rows);
    });
  });
});
