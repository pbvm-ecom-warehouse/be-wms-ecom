// apps/wms/src/warehouse/warehouse.service.spec.ts
import { WarehouseService } from './warehouse.service';

const makeRepo = () => ({
  findStagingShelfByWarehouse: jest.fn(),
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
});
