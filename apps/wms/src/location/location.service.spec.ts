// apps/wms/src/location/location.service.spec.ts
import { Types } from 'mongoose';
import { LocationService } from './location.service';
import type { StockRepository } from '../stock/stock.repository';

const transactionSession = {} as never;

const makeStockRepo = () => ({
  findInventoryByShelfId: jest.fn(),
  hasPositiveInventoryOnShelf: jest.fn(),
});

const makeRepo = () => ({
  runInTransaction: jest.fn((work: (session: never) => unknown) =>
    Promise.resolve(work(transactionSession)),
  ),
  incrementLayoutRevision: jest.fn(),
  findStagingShelf: jest.fn(),
  findShelfById: jest.fn(),
  findRackById: jest.fn(),
  findZoneById: jest.fn(),
  findZoneByCode: jest.fn(),
  findRackByCode: jest.fn(),
  findShelfByCode: jest.fn(),
  findAisleByCode: jest.fn(),
  hasRacksInZone: jest.fn(),
  hasShelvesInRack: jest.fn(),
  softDeleteZone: jest.fn(),
  softDeleteRack: jest.fn(),
  softDeleteShelf: jest.fn(),
  createZone: jest.fn(),
  createRack: jest.fn(),
  createShelf: jest.fn(),
  createAisle: jest.fn(),
  findAllZones: jest.fn(),
  findAllRacks: jest.fn(),
  findAllShelves: jest.fn(),
  findAllAisles: jest.fn(),
  findAllGates: jest.fn(),
  getRackTemplate: jest.fn(),
  getLayoutConfig: jest.fn(),
  updateRackTemplate: jest.fn(),
  updateRack: jest.fn(),
});

describe('LocationService', () => {
  let svc: LocationService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;

  beforeEach(() => {
    repo = makeRepo();
    repo.findAllZones.mockResolvedValue([]);
    repo.findAllRacks.mockResolvedValue([]);
    repo.findAllAisles.mockResolvedValue([]);
    repo.findAllGates.mockResolvedValue([]);
    repo.getRackTemplate.mockResolvedValue({
      widthM: 10,
      depthM: 1.5,
      levelCount: 1,
      bayCount: 1,
    });
    repo.getLayoutConfig.mockResolvedValue({
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
      revision: 1,
      updatedAt: new Date(),
    });
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
        transactionSession,
      );
      expect(repo.incrementLayoutRevision).toHaveBeenCalledWith(
        'actor1',
        transactionSession,
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

      expect(repo.createRack).toHaveBeenCalledWith(
        baseDto,
        'actor1',
        transactionSession,
      );
      expect(result).toEqual(created);
    });
  });

  describe('updateRack', () => {
    it('chặn trùng code khi chỉ đổi zoneId và giữ nguyên code', async () => {
      const rackId = new Types.ObjectId();
      const currentZoneId = new Types.ObjectId();
      const destinationZoneId = new Types.ObjectId();
      repo.findRackById.mockResolvedValue({
        _id: rackId,
        zoneId: currentZoneId,
        code: 'A1',
      });
      repo.findZoneById.mockResolvedValue({ _id: destinationZoneId });
      repo.findRackByCode.mockResolvedValue({
        _id: new Types.ObjectId(),
        zoneId: destinationZoneId,
        code: 'A1',
      });

      await expect(
        svc.updateRack(
          rackId.toString(),
          { zoneId: destinationZoneId.toString() },
          'actor1',
        ),
      ).rejects.toMatchObject({ code: 'RACK_CODE_EXISTS' });

      expect(repo.findRackByCode).toHaveBeenCalledWith(
        destinationZoneId.toString(),
        'A1',
        transactionSession,
      );
      expect(repo.updateRack).not.toHaveBeenCalled();
    });

    it('map duplicate-key race thành RACK_CODE_EXISTS', async () => {
      const rackId = new Types.ObjectId();
      const destinationZoneId = new Types.ObjectId();
      repo.findRackById.mockResolvedValue({
        _id: rackId,
        zoneId: new Types.ObjectId(),
        code: 'A1',
      });
      repo.findZoneById.mockResolvedValue({ _id: destinationZoneId });
      repo.findRackByCode.mockResolvedValue(null);
      repo.updateRack.mockRejectedValue({ code: 11000 });

      await expect(
        svc.updateRack(
          rackId.toString(),
          { zoneId: destinationZoneId.toString() },
          'actor1',
        ),
      ).rejects.toMatchObject({ code: 'RACK_CODE_EXISTS' });
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

      expect(repo.createShelf).toHaveBeenCalledWith(
        baseDto,
        'actor1',
        transactionSession,
      );
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

      expect(repo.createAisle).toHaveBeenCalledWith(
        baseDto,
        'actor1',
        transactionSession,
      );
      expect(result).toEqual(created);
    });
  });

  describe('delete guards', () => {
    it('chặn xoá zone khi còn rack', async () => {
      repo.hasRacksInZone.mockResolvedValue(true);

      await expect(svc.deleteZone('zone-1', 'actor1')).rejects.toMatchObject({
        code: 'ZONE_HAS_RACKS',
      });
      expect(repo.softDeleteZone).not.toHaveBeenCalled();
    });

    it('chặn xoá rack khi còn shelf', async () => {
      repo.hasShelvesInRack.mockResolvedValue(true);

      await expect(svc.deleteRack('rack-1', 'actor1')).rejects.toMatchObject({
        code: 'RACK_HAS_SHELVES',
      });
      expect(repo.softDeleteRack).not.toHaveBeenCalled();
    });

    it('chặn xoá staging shelf', async () => {
      repo.findShelfById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        isStaging: true,
      });

      await expect(
        svc.deleteShelf('507f1f77bcf86cd799439011', 'actor1'),
      ).rejects.toMatchObject({ code: 'STAGING_SHELF_CANNOT_DELETE' });
      expect(stockRepo.hasPositiveInventoryOnShelf).not.toHaveBeenCalled();
      expect(repo.softDeleteShelf).not.toHaveBeenCalled();
    });

    it('chặn xoá shelf khi còn tồn kho dương', async () => {
      repo.findShelfById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        isStaging: false,
      });
      stockRepo.hasPositiveInventoryOnShelf.mockResolvedValue(true);

      await expect(
        svc.deleteShelf('507f1f77bcf86cd799439011', 'actor1'),
      ).rejects.toMatchObject({ code: 'SHELF_HAS_STOCK' });
      expect(repo.softDeleteShelf).not.toHaveBeenCalled();
    });
  });
  describe('getLayout', () => {
    it('trả snapshot singleton đầy đủ gồm revision, canvas và shelves', async () => {
      const mockZones = [{ id: 'z1' }];
      const mockRacks = [{ id: 'r1' }];
      const mockShelves = [{ id: 's1' }];
      const mockAisles = [{ id: 'a1' }];
      const mockGates = [{ id: 'g1' }];
      const mockRackTemplate = {
        widthM: 10,
        depthM: 1.5,
        levelCount: 3,
        bayCount: 3,
      };
      const updatedAt = new Date('2026-07-27T10:00:00.000Z');
      repo.findAllZones.mockResolvedValue(mockZones);
      repo.findAllRacks.mockResolvedValue(mockRacks);
      repo.findAllShelves.mockResolvedValue(mockShelves);
      repo.findAllAisles.mockResolvedValue(mockAisles);
      repo.findAllGates.mockResolvedValue(mockGates);
      repo.getRackTemplate.mockResolvedValue(mockRackTemplate);
      repo.getLayoutConfig.mockResolvedValue({
        widthM: 60,
        heightM: 36,
        gridM: 0.5,
        revision: 7,
        updatedAt,
      });

      const result = await svc.getLayout();

      expect(result).toEqual({
        id: 'single-warehouse-layout',
        revision: 7,
        updatedAt,
        canvas: { widthM: 60, heightM: 36, gridM: 0.5 },
        zones: mockZones,
        racks: mockRacks,
        shelves: mockShelves,
        aisles: mockAisles,
        gates: mockGates,
        rackTemplate: mockRackTemplate,
      });
    });

    it('đọc snapshot coherent tuần tự trong một transaction', async () => {
      const config = {
        widthM: 60,
        heightM: 36,
        gridM: 0.5,
        revision: 7,
        updatedAt: new Date(),
      };
      const rackTemplate = {
        widthM: 10,
        depthM: 1.5,
        levelCount: 3,
        bayCount: 3,
      };
      let activeReads = 0;
      let maxActiveReads = 0;
      const observedSessions: unknown[] = [];
      const guardedRead =
        <T>(value: T) =>
        async (activeSession: unknown): Promise<T> => {
          observedSessions.push(activeSession);
          activeReads += 1;
          maxActiveReads = Math.max(maxActiveReads, activeReads);
          await Promise.resolve();
          activeReads -= 1;
          return value;
        };

      repo.findAllZones.mockImplementation(guardedRead([]));
      repo.findAllRacks.mockImplementation(guardedRead([]));
      repo.findAllShelves.mockImplementation(guardedRead([]));
      repo.findAllAisles.mockImplementation(guardedRead([]));
      repo.findAllGates.mockImplementation(guardedRead([]));
      repo.getRackTemplate.mockImplementation(guardedRead(rackTemplate));
      repo.getLayoutConfig.mockImplementation(guardedRead(config));

      await svc.getLayout();

      expect(repo.runInTransaction).toHaveBeenCalledTimes(1);
      expect(maxActiveReads).toBe(1);
      expect(observedSessions).toEqual(Array(7).fill(transactionSession));
    });
  });
  describe('individual mutation geometry', () => {
    it('đọc geometry tuần tự khi dùng chung transaction session', async () => {
      const created = { _id: new Types.ObjectId(), code: 'A' };
      let activeReads = 0;
      let maxActiveReads = 0;
      const guardedRead =
        <T>(value: T) =>
        async (): Promise<T> => {
          activeReads += 1;
          maxActiveReads = Math.max(maxActiveReads, activeReads);
          await Promise.resolve();
          activeReads -= 1;
          return value;
        };

      repo.findZoneByCode.mockResolvedValue(null);
      repo.createZone.mockResolvedValue(created);
      repo.getLayoutConfig.mockImplementation(
        guardedRead({
          widthM: 40,
          heightM: 24,
          gridM: 0.5,
          revision: 1,
          updatedAt: new Date(),
        }),
      );
      repo.getRackTemplate.mockImplementation(
        guardedRead({
          widthM: 10,
          depthM: 1.5,
          levelCount: 1,
          bayCount: 1,
        }),
      );
      repo.findAllZones.mockImplementation(guardedRead([]));
      repo.findAllRacks.mockImplementation(guardedRead([]));
      repo.findAllAisles.mockImplementation(guardedRead([]));
      repo.findAllGates.mockImplementation(guardedRead([]));

      await svc.createZone({ name: 'Khu A', code: 'A' }, 'actor1');

      expect(maxActiveReads).toBe(1);
    });

    it('rollback CRUD rack khi rack nằm ngoài zone và không tăng revision', async () => {
      const zoneId = new Types.ObjectId();
      const rackId = new Types.ObjectId();
      const zone = {
        _id: zoneId,
        code: 'A',
        xM: 1,
        yM: 1,
        widthM: 5,
        heightM: 5,
        rotation: 0,
      };
      const rack = {
        _id: rackId,
        zoneId,
        code: 'A1',
        xM: 5,
        yM: 4,
        rotation: 0,
      };
      repo.findZoneById.mockResolvedValue(zone);
      repo.findRackByCode.mockResolvedValue(null);
      repo.createRack.mockResolvedValue(rack);
      repo.findAllZones.mockResolvedValue([zone]);
      repo.findAllRacks.mockResolvedValue([rack]);

      await expect(
        svc.createRack(
          { zoneId: zoneId.toString(), name: 'Kệ A1', code: 'A1' },
          'actor1',
        ),
      ).rejects.toMatchObject({
        code: 'LAYOUT_VALIDATION_FAILED',
        details: {
          issues: expect.arrayContaining([
            expect.objectContaining({ code: 'RACK_OUTSIDE_ZONE' }),
          ]),
        },
      });

      expect(repo.incrementLayoutRevision).not.toHaveBeenCalled();
    });
  });
  describe('individual mutation revision', () => {
    it('cập nhật rack template và tăng revision trong cùng transaction', async () => {
      const dto = {
        widthM: 8,
        depthM: 1.2,
        levelCount: 3,
        bayCount: 4,
      };
      const updated = { ...dto, key: 'SINGLETON' };
      repo.updateRackTemplate.mockResolvedValue(updated);
      repo.getRackTemplate.mockResolvedValue(updated);

      await expect(svc.updateRackTemplate(dto, 'actor1')).resolves.toEqual(
        updated,
      );

      expect(repo.updateRackTemplate).toHaveBeenCalledWith(
        dto,
        'actor1',
        transactionSession,
      );
      expect(repo.incrementLayoutRevision).toHaveBeenCalledWith(
        'actor1',
        transactionSession,
      );
    });
  });
  describe('getShelfContents', () => {
    it('throw SHELF_NOT_FOUND khi shelf không tồn tại — không gọi stockRepo', async () => {
      repo.findShelfById.mockResolvedValue(null);

      await expect(
        svc.getShelfContents('507f1f77bcf86cd799439011'),
      ).rejects.toMatchObject({
        code: 'SHELF_NOT_FOUND',
      });
      expect(stockRepo.findInventoryByShelfId).not.toHaveBeenCalled();
    });

    it('shelf tồn tại → trả về danh sách tồn kho thật từ stockRepo', async () => {
      repo.findShelfById.mockResolvedValue({ id: '507f1f77bcf86cd799439011' });
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

      const result = await svc.getShelfContents('507f1f77bcf86cd799439011');

      expect(repo.findShelfById).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
      );
      expect(stockRepo.findInventoryByShelfId).toHaveBeenCalledTimes(1);
      expect(result).toEqual(rows);
    });
  });
});
