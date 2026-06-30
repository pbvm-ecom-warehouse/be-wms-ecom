// apps/wms/src/supplier/supplier.service.spec.ts
import { AppException } from '@app/common/errors/app.exception';
import { SupplierService } from './supplier.service';
import { SupplierStatus } from './schemas/supplier.schema';

const makeRepo = () => ({
  createSupplier: jest.fn(),
  findSupplierById: jest.fn(),
  findSupplierByCode: jest.fn(),
  findSuppliers: jest.fn(),
  updateSupplier: jest.fn(),
  changeSupplierStatus: jest.fn(),
  softDeleteSupplier: jest.fn(),
  createSupplierItem: jest.fn(),
  findSupplierItemById: jest.fn(),
  findSupplierItemByItemId: jest.fn(),
  findSupplierItemsBySupplierId: jest.fn(),
  updateSupplierItem: jest.fn(),
});

describe('SupplierService', () => {
  let svc: SupplierService;
  let repo: ReturnType<typeof makeRepo>;
  const actorId = 'actor123';
  const supplierId = 'sup001';
  const itemId = 'item001';

  beforeEach(() => {
    repo = makeRepo();
    svc = new SupplierService(repo as never);
  });

  // ─── createSupplier ───────────────────────────────────────────────────────

  describe('createSupplier', () => {
    it('throw SUPPLIER_CODE_EXISTS khi code đã tồn tại', async () => {
      repo.findSupplierByCode.mockResolvedValue({ code: 'NCC-001' });
      await expect(
        svc.createSupplier({ code: 'NCC-001', name: 'Test' }, actorId),
      ).rejects.toMatchObject({ code: 'SUPPLIER_CODE_EXISTS' });
    });

    it('tạo NCC mới khi code chưa tồn tại', async () => {
      repo.findSupplierByCode.mockResolvedValue(null);
      repo.createSupplier.mockResolvedValue({ code: 'NCC-001' });
      await svc.createSupplier({ code: 'NCC-001', name: 'Test' }, actorId);
      expect(repo.createSupplier).toHaveBeenCalledWith(
        { code: 'NCC-001', name: 'Test' },
        actorId,
      );
    });
  });

  // ─── changeStatus ─────────────────────────────────────────────────────────

  describe('changeStatus — BLACKLIST → ACTIVE chỉ ADMIN', () => {
    const blacklistedDoc = { status: SupplierStatus.BLACKLIST };

    it('MANAGER không thể gỡ BLACKLIST', async () => {
      repo.findSupplierById.mockResolvedValue(blacklistedDoc);
      await expect(
        svc.changeStatus(
          supplierId,
          { status: SupplierStatus.ACTIVE },
          actorId,
          ['MANAGER'],
        ),
      ).rejects.toMatchObject({ code: 'SUPPLIER_BLACKLISTED' });
    });

    it('ADMIN có thể gỡ BLACKLIST', async () => {
      repo.findSupplierById.mockResolvedValue(blacklistedDoc);
      repo.changeSupplierStatus.mockResolvedValue({ status: SupplierStatus.ACTIVE });
      await expect(
        svc.changeStatus(
          supplierId,
          { status: SupplierStatus.ACTIVE },
          actorId,
          ['ADMIN'],
        ),
      ).resolves.toBeDefined();
    });
  });

  // ─── assertSupplierActive (guard PO) ─────────────────────────────────────

  describe('assertSupplierActive', () => {
    it('throw SUPPLIER_NOT_FOUND khi không tìm thấy NCC', async () => {
      repo.findSupplierById.mockResolvedValue(null);
      await expect(svc.assertSupplierActive(supplierId)).rejects.toMatchObject({
        code: 'SUPPLIER_NOT_FOUND',
      });
    });

    it('throw SUPPLIER_NOT_ACTIVE khi status INACTIVE', async () => {
      repo.findSupplierById.mockResolvedValue({ status: SupplierStatus.INACTIVE });
      await expect(svc.assertSupplierActive(supplierId)).rejects.toMatchObject({
        code: 'SUPPLIER_NOT_ACTIVE',
      });
    });

    it('throw SUPPLIER_NOT_ACTIVE khi status BLACKLIST', async () => {
      repo.findSupplierById.mockResolvedValue({ status: SupplierStatus.BLACKLIST });
      await expect(svc.assertSupplierActive(supplierId)).rejects.toMatchObject({
        code: 'SUPPLIER_NOT_ACTIVE',
      });
    });

    it('không throw khi status ACTIVE', async () => {
      repo.findSupplierById.mockResolvedValue({ status: SupplierStatus.ACTIVE });
      await expect(svc.assertSupplierActive(supplierId)).resolves.toBeUndefined();
    });
  });

  // ─── upsertSupplierItem ───────────────────────────────────────────────────

  describe('upsertSupplierItem', () => {
    const dto = {
      itemId,
      supplierId,
      purchasePrice: 10000,
    };

    it('tạo mới khi SKU chưa có NCC chính', async () => {
      repo.findSupplierItemByItemId.mockResolvedValue(null);
      repo.createSupplierItem.mockResolvedValue({ itemId });
      await svc.upsertSupplierItem(dto);
      expect(repo.createSupplierItem).toHaveBeenCalledWith(dto);
    });

    it('update khi SKU đã có NCC chính', async () => {
      const existing = { _id: { toString: () => 'existingId' }, itemId };
      repo.findSupplierItemByItemId.mockResolvedValue(existing);
      repo.updateSupplierItem.mockResolvedValue({ itemId });
      await svc.upsertSupplierItem(dto);
      expect(repo.updateSupplierItem).toHaveBeenCalledWith('existingId', dto);
    });
  });
});
