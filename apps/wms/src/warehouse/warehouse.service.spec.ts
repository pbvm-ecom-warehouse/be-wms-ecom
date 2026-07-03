// apps/wms/src/warehouse/warehouse.service.spec.ts
import { WarehouseService } from './warehouse.service';

const makeRepo = () => ({
  findStagingShelfByWarehouse: jest.fn(),
  findRackById: jest.fn(),
  findZoneById: jest.fn(),
  findShelfByCode: jest.fn(),
  createShelf: jest.fn(),
});

describe('WarehouseService', () => {
  let svc: WarehouseService;
  let repo: ReturnType<typeof makeRepo>;
  const warehouseId = 'wh001';

  beforeEach(() => {
    repo = makeRepo();
    svc = new WarehouseService(repo as never);
  });

  describe('findStagingShelf', () => {
    it('throw GRN_STAGING_SHELF_NOT_FOUND khi kho chưa cấu hình staging shelf', async () => {
      repo.findStagingShelfByWarehouse.mockResolvedValue(null);
      await expect(svc.findStagingShelf(warehouseId)).rejects.toMatchObject({
        code: 'GRN_STAGING_SHELF_NOT_FOUND',
      });
    });

    it('trả về shelf khi tìm thấy', async () => {
      const shelf = { _id: 'shelf1', isStaging: true };
      repo.findStagingShelfByWarehouse.mockResolvedValue(shelf);
      await expect(svc.findStagingShelf(warehouseId)).resolves.toEqual(shelf);
    });
  });

  describe('createShelf', () => {
    const rackId = 'rack1';
    const zoneId = 'zone1';
    const baseDto = { rackId, level: 1, code: 'A1-T1' };

    it('throw RACK_NOT_FOUND khi rack cha không tồn tại', async () => {
      repo.findRackById.mockResolvedValue(null);
      await expect(
        svc.createShelf(baseDto as never, 'actor1'),
      ).rejects.toMatchObject({ code: 'RACK_NOT_FOUND' });
      expect(repo.findZoneById).not.toHaveBeenCalled();
    });

    it('throw ZONE_NOT_FOUND khi rack tồn tại nhưng zone cha đã bị soft-delete', async () => {
      repo.findRackById.mockResolvedValue({ _id: rackId, zoneId });
      repo.findZoneById.mockResolvedValue(null);
      await expect(
        svc.createShelf(baseDto as never, 'actor1'),
      ).rejects.toMatchObject({ code: 'ZONE_NOT_FOUND' });
      expect(repo.createShelf).not.toHaveBeenCalled();
    });

    it('throw SHELF_CODE_EXISTS khi code đã tồn tại', async () => {
      repo.findRackById.mockResolvedValue({ _id: rackId, zoneId });
      repo.findZoneById.mockResolvedValue({
        _id: zoneId,
        warehouseId: 'wh1',
      });
      repo.findShelfByCode.mockResolvedValue({ _id: 'shelf-existing' });
      await expect(
        svc.createShelf(baseDto as never, 'actor1'),
      ).rejects.toMatchObject({ code: 'SHELF_CODE_EXISTS' });
      expect(repo.createShelf).not.toHaveBeenCalled();
    });

    it('tạo shelf thành công, truyền warehouseId đã resolve từ zone xuống repository', async () => {
      repo.findRackById.mockResolvedValue({ _id: rackId, zoneId });
      repo.findZoneById.mockResolvedValue({
        _id: zoneId,
        warehouseId: 'wh1',
      });
      repo.findShelfByCode.mockResolvedValue(null);
      const created = { _id: 'shelf1', code: 'A1-T1' };
      repo.createShelf.mockResolvedValue(created);

      const result = await svc.createShelf(baseDto, 'actor1');

      expect(repo.createShelf).toHaveBeenCalledWith(baseDto, 'actor1', 'wh1');
      expect(result).toEqual(created);
    });
  });
});
