// apps/wms/src/supplier/supplier.service.spec.ts
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
  findSupplierItemsByItemId: jest.fn(),
  findSupplierItemByItemAndSupplier: jest.fn(),
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
      repo.changeSupplierStatus.mockResolvedValue({
        status: SupplierStatus.ACTIVE,
      });
      await expect(
        svc.changeStatus(
          supplierId,
          {
            status: SupplierStatus.ACTIVE,
          },
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

    it('SUPPLIER_NOT_FOUND trả về HTTP 404', async () => {
      repo.findSupplierById.mockResolvedValue(null);
      try {
        await svc.assertSupplierActive(supplierId);
        fail('should have thrown');
      } catch (err) {
        const ex = err as { getStatus?: () => number };
        expect(typeof ex.getStatus).toBe('function');
        expect(ex.getStatus!()).toBe(404);
      }
    });

    it('throw SUPPLIER_NOT_ACTIVE khi status INACTIVE', async () => {
      repo.findSupplierById.mockResolvedValue({
        status: SupplierStatus.INACTIVE,
      });
      await expect(svc.assertSupplierActive(supplierId)).rejects.toMatchObject({
        code: 'SUPPLIER_NOT_ACTIVE',
      });
    });

    it('throw SUPPLIER_NOT_ACTIVE khi status BLACKLIST', async () => {
      repo.findSupplierById.mockResolvedValue({
        status: SupplierStatus.BLACKLIST,
      });
      await expect(svc.assertSupplierActive(supplierId)).rejects.toMatchObject({
        code: 'SUPPLIER_NOT_ACTIVE',
      });
    });

    it('không throw khi status ACTIVE', async () => {
      repo.findSupplierById.mockResolvedValue({
        status: SupplierStatus.ACTIVE,
      });
      await expect(
        svc.assertSupplierActive(supplierId),
      ).resolves.toBeUndefined();
    });
  });

  // ─── upsertSupplierItem ───────────────────────────────────────────────────

  describe('upsertSupplierItem', () => {
    const dto = {
      itemId,
      supplierId,
      purchasePrice: 10000,
    };

    it('tạo mới khi cặp (itemId, supplierId) chưa có báo giá', async () => {
      repo.findSupplierItemByItemAndSupplier.mockResolvedValue(null);
      repo.createSupplierItem.mockResolvedValue({ itemId, supplierId });
      await svc.upsertSupplierItem(dto);
      expect(repo.findSupplierItemByItemAndSupplier).toHaveBeenCalledWith(
        itemId,
        supplierId,
      );
      expect(repo.createSupplierItem).toHaveBeenCalledWith(dto);
    });

    it('update khi cặp (itemId, supplierId) đã có báo giá (không truyền itemId vào update)', async () => {
      const existing = { _id: { toString: () => 'existingId' }, itemId, supplierId };
      repo.findSupplierItemByItemAndSupplier.mockResolvedValue(existing);
      repo.updateSupplierItem.mockResolvedValue({ itemId, supplierId });
      await svc.upsertSupplierItem(dto);
      // itemId bị loại khỏi payload update — field bất biến sau khi tạo
      const { supplierId: s, purchasePrice: p } = dto;
      expect(repo.updateSupplierItem).toHaveBeenCalledWith('existingId', {
        supplierId: s,
        purchasePrice: p,
      });
    });

    it('cùng itemId nhưng khác supplierId → tạo báo giá mới, không ghi đè báo giá NCC khác', async () => {
      repo.findSupplierItemByItemAndSupplier.mockResolvedValue(null);
      repo.createSupplierItem.mockResolvedValue({ itemId, supplierId: 'sup999' });
      const dtoOtherSupplier = { ...dto, supplierId: 'sup999' };
      await svc.upsertSupplierItem(dtoOtherSupplier);
      expect(repo.findSupplierItemByItemAndSupplier).toHaveBeenCalledWith(
        itemId,
        'sup999',
      );
      expect(repo.createSupplierItem).toHaveBeenCalledWith(dtoOtherSupplier);
    });
  });

  describe('listSupplierItemsByItemId', () => {
    it('trả về mảng rỗng khi SKU chưa có báo giá nào (không throw)', async () => {
      repo.findSupplierItemsByItemId.mockResolvedValue([]);
      await expect(svc.listSupplierItemsByItemId(itemId)).resolves.toEqual([]);
    });

    it('trả về mọi báo giá của SKU', async () => {
      const docs = [{ itemId, supplierId: 'sup1' }, { itemId, supplierId: 'sup2' }];
      repo.findSupplierItemsByItemId.mockResolvedValue(docs);
      await expect(svc.listSupplierItemsByItemId(itemId)).resolves.toEqual(docs);
    });
  });

  describe('getSupplierItemByItemAndSupplier', () => {
    it('throw SUPPLIER_ITEM_NOT_FOUND khi không có báo giá cho cặp này', async () => {
      repo.findSupplierItemByItemAndSupplier.mockResolvedValue(null);
      await expect(
        svc.getSupplierItemByItemAndSupplier(itemId, supplierId),
      ).rejects.toMatchObject({ code: 'SUPPLIER_ITEM_NOT_FOUND' });
    });

    it('trả về báo giá khi tìm thấy', async () => {
      const doc = { itemId, supplierId, purchasePrice: 5000 };
      repo.findSupplierItemByItemAndSupplier.mockResolvedValue(doc);
      await expect(
        svc.getSupplierItemByItemAndSupplier(itemId, supplierId),
      ).resolves.toEqual(doc);
    });
  });
});
