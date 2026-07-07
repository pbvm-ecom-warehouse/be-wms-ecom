import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { StockRepository } from './stock.repository';
import { InventoryStock } from './schemas/inventory-stock.schema';
import { Lot } from './schemas/lot.schema';
import { StockBalance } from './schemas/stock-balance.schema';
import { StockMovement } from './schemas/stock-movement.schema';
import { ItemType, WarehouseItem } from './schemas/warehouse-item.schema';

const itemId = new Types.ObjectId();
const warehouseId = new Types.ObjectId();
const shelfId = new Types.ObjectId();

const makeModel = (overrides: Record<string, jest.Mock> = {}) => ({
  findById: jest.fn().mockReturnThis(),
  findOne: jest.fn().mockReturnThis(),
  findOneAndUpdate: jest.fn().mockReturnThis(),
  create: jest.fn(),
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  ...overrides,
});

describe('StockRepository', () => {
  let repo: StockRepository;
  let warehouseItemModel: ReturnType<typeof makeModel>;
  let balanceModel: ReturnType<typeof makeModel>;
  let inventoryModel: ReturnType<typeof makeModel>;
  let lotModel: ReturnType<typeof makeModel>;
  let movementModel: ReturnType<typeof makeModel>;

  beforeEach(async () => {
    warehouseItemModel = makeModel();
    balanceModel = makeModel();
    inventoryModel = makeModel();
    lotModel = makeModel();
    movementModel = makeModel();

    const module = await Test.createTestingModule({
      providers: [
        StockRepository,
        {
          provide: getModelToken(WarehouseItem.name),
          useValue: warehouseItemModel,
        },
        { provide: getModelToken(StockBalance.name), useValue: balanceModel },
        {
          provide: getModelToken(InventoryStock.name),
          useValue: inventoryModel,
        },
        { provide: getModelToken(Lot.name), useValue: lotModel },
        { provide: getModelToken(StockMovement.name), useValue: movementModel },
      ],
    }).compile();

    repo = module.get(StockRepository);
    jest.clearAllMocks();
  });

  describe('findSkuById', () => {
    it('trả về sku khi tìm thấy', async () => {
      warehouseItemModel.exec.mockResolvedValueOnce({ sku: 'LY-500ML' });
      const result = await repo.findSkuById(itemId.toString());
      expect(result).toEqual({ sku: 'LY-500ML' });
      expect(warehouseItemModel.findById).toHaveBeenCalledWith(
        itemId.toString(),
      );
    });

    it('trả về null khi không tìm thấy', async () => {
      warehouseItemModel.exec.mockResolvedValueOnce(null);
      const result = await repo.findSkuById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findBalanceByItemAndWarehouse', () => {
    it('gọi findOne với đúng filter', async () => {
      balanceModel.exec.mockResolvedValueOnce({
        onHand: 10,
        reserved: 2,
        expired: 0,
      });
      const result = await repo.findBalanceByItemAndWarehouse(
        itemId,
        warehouseId,
      );
      expect(result).toEqual({ onHand: 10, reserved: 2, expired: 0 });
      expect(balanceModel.findOne).toHaveBeenCalledWith(
        { itemId, warehouseId },
        null,
        { session: undefined },
      );
    });
  });

  describe('upsertBalance', () => {
    it('gọi findOneAndUpdate với $inc đúng delta', async () => {
      const mockDoc = { onHand: 15, reserved: 0, expired: 0 };
      balanceModel.exec.mockResolvedValueOnce(mockDoc);
      const result = await repo.upsertBalance(itemId, warehouseId, 5, 0, 0);
      expect(result).toBe(mockDoc);
      expect(balanceModel.findOneAndUpdate).toHaveBeenCalledWith(
        { itemId, warehouseId },
        { $inc: { onHand: 5, reserved: 0, expired: 0 } },
        { upsert: true, new: true, session: undefined },
      );
    });
  });

  describe('insertMovement', () => {
    it('gọi create với data và session', async () => {
      const data = {
        itemId,
        warehouseId,
        shelfId,
        lotId: null,
        type: 'RECEIVE' as const,
        quantity: 10,
        refType: 'grn',
        refId: new Types.ObjectId(),
        createdBy: new Types.ObjectId(),
      };
      const mockSession = {} as never;
      movementModel.create.mockResolvedValueOnce([
        { _id: new Types.ObjectId() },
      ]);
      await repo.insertMovement(data, mockSession);
      expect(movementModel.create).toHaveBeenCalledWith([data], {
        session: mockSession,
      });
    });
  });

  describe('findItemById', () => {
    it('trả về item với isPerishable/altUnits/unit', async () => {
      warehouseItemModel.exec.mockResolvedValue({
        sku: 'SKU-1',
        unit: 'cái',
        isPerishable: true,
        altUnits: [{ unit: 'thùng', factor: 50 }],
      });
      const result = await repo.findItemById(itemId.toString());
      expect(warehouseItemModel.findById).toHaveBeenCalledWith(
        itemId.toString(),
      );
      expect(result?.isPerishable).toBe(true);
    });
  });

  describe('findItemByBarcode', () => {
    it('query $or trên barcode và altBarcodes', async () => {
      const execMock = jest.fn().mockResolvedValue({ sku: 'SKU-1' });
      const leanMock = jest.fn().mockReturnValue({ exec: execMock });
      const findOneMock = jest.fn().mockReturnValue({ lean: leanMock });
      (repo as unknown as { itemModel: { findOne: jest.Mock } }).itemModel = {
        findOne: findOneMock,
      };

      const result = await repo.findItemByBarcode('CUP-001');

      expect(findOneMock).toHaveBeenCalledWith({
        $or: [{ barcode: 'CUP-001' }, { altBarcodes: 'CUP-001' }],
      });
      expect(result).toEqual({ sku: 'SKU-1' });
    });
  });

  describe('findItemBySku', () => {
    it('gọi findOne với sku và trả về item', async () => {
      warehouseItemModel.exec.mockResolvedValueOnce({ sku: 'SKU-1' });
      const result = await repo.findItemBySku('SKU-1');
      expect(warehouseItemModel.findOne).toHaveBeenCalledWith({
        sku: 'SKU-1',
      });
      expect(result).toEqual({ sku: 'SKU-1' });
    });

    it('trả về null khi không tìm thấy', async () => {
      warehouseItemModel.exec.mockResolvedValueOnce(null);
      const result = await repo.findItemBySku('SKU-X');
      expect(result).toBeNull();
    });
  });

  describe('createItem', () => {
    it('gọi create với data + createdBy, isActive mặc định true', async () => {
      const createdBy = new Types.ObjectId();
      const data = {
        sku: 'SKU-1',
        name: 'Ly nhựa 500ml',
        type: 'CUP_BLANK' as const,
        unit: 'cái',
      };
      const mockDoc = { _id: new Types.ObjectId(), ...data };
      warehouseItemModel.create.mockResolvedValueOnce([mockDoc]);
      const result = await repo.createItem(data, createdBy);
      expect(warehouseItemModel.create).toHaveBeenCalledWith([
        { ...data, createdBy, isActive: true },
      ]);
      expect(result).toBe(mockDoc);
    });
  });

  describe('findOccupiedVolumeByWarehouse', () => {
    it('gọi aggregate với pipeline lookup warehouse_items và group theo shelfId', async () => {
      const warehouseId = new Types.ObjectId();
      inventoryModel.aggregate = jest.fn().mockResolvedValue([
        { shelfId: 'shelf-a', occupied: 240 },
        { shelfId: 'shelf-b', occupied: 0 },
      ]);

      const result = await repo.findOccupiedVolumeByWarehouse(warehouseId);

      expect(inventoryModel.aggregate).toHaveBeenCalledTimes(1);
      expect(result.get('shelf-a')).toBe(240);
      expect(result.get('shelf-b')).toBe(0);
      expect(result.has('shelf-c')).toBe(false);
    });
  });

  describe('findShelfIdsWithItem', () => {
    it('trả về Set các shelfId có InventoryStock của itemId trong kho', async () => {
      const itemId = new Types.ObjectId();
      const warehouseId = new Types.ObjectId();
      const shelfA = new Types.ObjectId();
      inventoryModel.distinct = jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue([shelfA]) });

      const result = await repo.findShelfIdsWithItem(itemId, warehouseId);

      expect(inventoryModel.distinct).toHaveBeenCalledWith('shelfId', {
        itemId,
        warehouseId,
        quantity: { $gt: 0 },
      });
      expect(result.has(shelfA.toString())).toBe(true);
    });
  });

  describe('findItems', () => {
    it('lọc theo search (sku/name/barcode), type, isActive; luôn kèm deletedAt:null', async () => {
      warehouseItemModel.find = jest.fn().mockReturnThis();
      warehouseItemModel.sort = jest.fn().mockReturnThis();
      warehouseItemModel.skip = jest.fn().mockReturnThis();
      warehouseItemModel.limit = jest.fn().mockReturnThis();
      warehouseItemModel.exec = jest.fn().mockResolvedValue([]);
      warehouseItemModel.countDocuments = jest.fn().mockReturnThis();

      await repo.findItems({
        search: 'cup',
        type: ItemType.CUP_BLANK,
        isActive: true,
        page: 2,
        limit: 10,
      });

      expect(warehouseItemModel.find).toHaveBeenCalledWith({
        deletedAt: null,
        type: ItemType.CUP_BLANK,
        isActive: true,
        $or: [
          { sku: { $regex: 'cup', $options: 'i' } },
          { name: { $regex: 'cup', $options: 'i' } },
          { barcode: { $regex: 'cup', $options: 'i' } },
        ],
      });
      expect(warehouseItemModel.sort).toHaveBeenCalledWith({ sku: 1 });
      expect(warehouseItemModel.skip).toHaveBeenCalledWith(10); // (page-1)*limit = (2-1)*10
      expect(warehouseItemModel.limit).toHaveBeenCalledWith(10);
    });

    it('mặc định page=1, limit=20, không filter gì khi query rỗng', async () => {
      warehouseItemModel.find = jest.fn().mockReturnThis();
      warehouseItemModel.sort = jest.fn().mockReturnThis();
      warehouseItemModel.skip = jest.fn().mockReturnThis();
      warehouseItemModel.limit = jest.fn().mockReturnThis();
      warehouseItemModel.exec = jest.fn().mockResolvedValue([]);
      warehouseItemModel.countDocuments = jest.fn().mockReturnThis();

      await repo.findItems({});

      expect(warehouseItemModel.find).toHaveBeenCalledWith({ deletedAt: null });
      expect(warehouseItemModel.skip).toHaveBeenCalledWith(0);
      expect(warehouseItemModel.limit).toHaveBeenCalledWith(20);
    });

    it('trả về data + total từ countDocuments', async () => {
      const mockDocs = [{ sku: 'A' }, { sku: 'B' }];
      warehouseItemModel.find = jest.fn().mockReturnThis();
      warehouseItemModel.sort = jest.fn().mockReturnThis();
      warehouseItemModel.skip = jest.fn().mockReturnThis();
      warehouseItemModel.limit = jest.fn().mockReturnThis();
      warehouseItemModel.exec = jest
        .fn()
        .mockResolvedValueOnce(mockDocs)
        .mockResolvedValueOnce(2);
      warehouseItemModel.countDocuments = jest.fn().mockReturnThis();

      const result = await repo.findItems({});

      expect(result).toEqual({ data: mockDocs, total: 2 });
    });
  });

  describe('updateItem', () => {
    it('gọi findOneAndUpdate với filter deletedAt:null, set updatedBy', async () => {
      const id = itemId.toString();
      const actorId = new Types.ObjectId().toString();
      warehouseItemModel.findOneAndUpdate = jest.fn().mockReturnThis();
      warehouseItemModel.exec = jest.fn().mockResolvedValue({ _id: itemId });

      await repo.updateItem(id, { name: 'Tên mới' }, actorId);

      expect(warehouseItemModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: id, deletedAt: null },
        { name: 'Tên mới', updatedBy: new Types.ObjectId(actorId) },
        { new: true },
      );
    });

    it('trả null khi item không tồn tại hoặc đã xoá', async () => {
      warehouseItemModel.findOneAndUpdate = jest.fn().mockReturnThis();
      warehouseItemModel.exec = jest.fn().mockResolvedValue(null);

      const result = await repo.updateItem(
        itemId.toString(),
        { name: 'X' },
        new Types.ObjectId().toString(),
      );

      expect(result).toBeNull();
    });
  });

  describe('softDeleteItem', () => {
    it('set deletedAt + updatedBy khi tìm thấy item chưa xoá', async () => {
      const id = itemId.toString();
      const actorId = new Types.ObjectId().toString();
      warehouseItemModel.updateOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      });

      const result = await repo.softDeleteItem(id, actorId);

      expect(warehouseItemModel.updateOne).toHaveBeenCalledWith(
        { _id: id, deletedAt: null },
        { deletedAt: expect.any(Date), updatedBy: new Types.ObjectId(actorId) },
      );
      expect(result).toBe(true);
    });

    it('trả false khi không tìm thấy item (đã xoá hoặc không tồn tại)', async () => {
      warehouseItemModel.updateOne = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      });

      const result = await repo.softDeleteItem(
        itemId.toString(),
        new Types.ObjectId().toString(),
      );

      expect(result).toBe(false);
    });
  });

  describe('findItemByIdDocument', () => {
    it('gọi findById không lean, trả document đầy đủ', async () => {
      const id = itemId.toString();
      const mockDoc = { _id: itemId, sku: 'SKU-1' };
      warehouseItemModel.findById = jest.fn().mockReturnThis();
      warehouseItemModel.exec = jest.fn().mockResolvedValue(mockDoc);

      const result = await repo.findItemByIdDocument(id);

      expect(warehouseItemModel.findById).toHaveBeenCalledWith(id);
      expect(warehouseItemModel.lean).not.toHaveBeenCalled();
      expect(result).toBe(mockDoc);
    });
  });

  describe('findAvailableStockForPick', () => {
    it('hàng perishable: dùng aggregate join Lot, sắp expiryDate tăng dần (FEFO), loại EXPIRED trong pipeline', async () => {
      const pickItemId = new Types.ObjectId();
      const pickWarehouseId = new Types.ObjectId();
      const lotAShelf = new Types.ObjectId();
      const lotA = new Types.ObjectId();

      inventoryModel.aggregate = jest.fn().mockResolvedValue([
        {
          shelfId: lotAShelf,
          lotId: lotA,
          lotNumber: 'LOT-A',
          expiryDate: new Date('2026-07-01'),
          quantity: 5,
        },
      ]);

      const result = await repo.findAvailableStockForPick(
        pickItemId,
        pickWarehouseId,
        true,
      );

      expect(inventoryModel.aggregate).toHaveBeenCalledTimes(1);
      const pipeline = (inventoryModel.aggregate as jest.Mock).mock
        .calls[0][0] as Record<string, unknown>[];
      expect(pipeline[0]).toMatchObject({
        $match: {
          itemId: pickItemId,
          warehouseId: pickWarehouseId,
          quantity: { $gt: 0 },
          lotId: { $ne: null },
        },
      });
      expect(pipeline.some((stage) => '$sort' in stage)).toBe(true);
      expect(
        pipeline.some(
          (stage) =>
            '$match' in stage &&
            (stage['$match'] as Record<string, unknown>)['lot.status'] ===
              'ACTIVE',
        ),
      ).toBe(true);
      expect(result).toEqual([
        {
          shelfId: lotAShelf,
          lotId: lotA,
          lotNumber: 'LOT-A',
          expiryDate: new Date('2026-07-01'),
          quantity: 5,
        },
      ]);
    });

    it('hàng không perishable: query lotId=null, sắp quantity giảm dần', async () => {
      const pickItemId = new Types.ObjectId();
      const pickWarehouseId = new Types.ObjectId();
      const shelfA = new Types.ObjectId();

      inventoryModel.find = jest.fn().mockReturnThis();
      inventoryModel.sort = jest.fn().mockReturnThis();
      inventoryModel.exec = jest
        .fn()
        .mockResolvedValue([
          { shelfId: shelfA, lotId: null, quantity: 20 },
        ]);

      const result = await repo.findAvailableStockForPick(
        pickItemId,
        pickWarehouseId,
        false,
      );

      expect(inventoryModel.find).toHaveBeenCalledWith({
        itemId: pickItemId,
        warehouseId: pickWarehouseId,
        lotId: null,
        quantity: { $gt: 0 },
      });
      expect(inventoryModel.sort).toHaveBeenCalledWith({ quantity: -1 });
      expect(result).toEqual([
        {
          shelfId: shelfA,
          lotId: null,
          lotNumber: null,
          expiryDate: null,
          quantity: 20,
        },
      ]);
    });
  });
});
