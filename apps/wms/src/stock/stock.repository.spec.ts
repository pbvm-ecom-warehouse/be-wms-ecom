import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { StockRepository } from './stock.repository';
import { InventoryStock } from './schemas/inventory-stock.schema';
import { Lot } from './schemas/lot.schema';
import { StockBalance } from './schemas/stock-balance.schema';
import { MovementType, StockMovement } from './schemas/stock-movement.schema';
import { ItemType, WarehouseItem } from './schemas/warehouse-item.schema';

const itemId = new Types.ObjectId();
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

  describe('findSkuAndMinQuantityById', () => {
    it('trả về sku + minQuantity khi tìm thấy item', async () => {
      warehouseItemModel.exec.mockResolvedValueOnce({
        sku: 'SKU-1',
        minQuantity: 5,
      });

      const result = await repo.findSkuAndMinQuantityById(itemId);

      expect(warehouseItemModel.findById).toHaveBeenCalledWith(itemId);
      expect(result).toEqual({ sku: 'SKU-1', minQuantity: 5 });
    });

    it('trả về null khi không tìm thấy', async () => {
      warehouseItemModel.exec.mockResolvedValueOnce(null);

      const result = await repo.findSkuAndMinQuantityById(itemId);

      expect(result).toBeNull();
    });
  });

  describe('findItemsByIds', () => {
    it('gọi find với $in trên danh sách itemId, select sku, lean', async () => {
      const itemIds = [itemId, new Types.ObjectId()];
      warehouseItemModel.find = jest.fn().mockReturnThis();
      warehouseItemModel.exec.mockResolvedValueOnce([
        { _id: itemIds[0], sku: 'SKU-1' },
        { _id: itemIds[1], sku: 'SKU-2' },
      ]);

      const result = await repo.findItemsByIds(itemIds);

      expect(warehouseItemModel.find).toHaveBeenCalledWith({
        _id: { $in: itemIds },
      });
      expect(warehouseItemModel.select).toHaveBeenCalledWith('sku');
      expect(warehouseItemModel.lean).toHaveBeenCalled();
      expect(result).toEqual([
        { _id: itemIds[0], sku: 'SKU-1' },
        { _id: itemIds[1], sku: 'SKU-2' },
      ]);
    });

    it('trả về mảng rỗng khi không có item nào khớp', async () => {
      warehouseItemModel.find = jest.fn().mockReturnThis();
      warehouseItemModel.exec.mockResolvedValueOnce([]);

      const result = await repo.findItemsByIds([new Types.ObjectId()]);

      expect(result).toEqual([]);
    });
  });

  describe('findBalance', () => {
    it('gọi findOne với đúng filter', async () => {
      balanceModel.exec.mockResolvedValueOnce({
        onHand: 10,
        reserved: 2,
        expired: 0,
      });
      const result = await repo.findBalance(itemId);
      expect(result).toEqual({ onHand: 10, reserved: 2, expired: 0 });
      expect(balanceModel.findOne).toHaveBeenCalledWith({ itemId }, null, {
        session: undefined,
      });
    });
  });

  describe('upsertBalance', () => {
    it('gọi findOneAndUpdate với $inc đúng delta', async () => {
      const mockDoc = { onHand: 15, reserved: 0, expired: 0 };
      balanceModel.exec.mockResolvedValueOnce(mockDoc);
      const result = await repo.upsertBalance(itemId, 5, 0, 0);
      expect(result).toBe(mockDoc);
      expect(balanceModel.findOneAndUpdate).toHaveBeenCalledWith(
        { itemId },
        { $inc: { onHand: 5, reserved: 0, expired: 0 } },
        { upsert: true, new: true, session: undefined },
      );
    });
  });

  describe('insertMovement', () => {
    it('gọi create với data và session', async () => {
      const data = {
        itemId,
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

  describe('reserveIfAvailable', () => {
    it('gọi findOneAndUpdate với $expr đúng và trả về true khi có kết quả', async () => {
      balanceModel.exec.mockResolvedValueOnce({ reserved: 4 });
      const mockSession = {} as never;

      const result = await repo.reserveIfAvailable(itemId, 4, mockSession);

      expect(result).toBe(true);
      expect(balanceModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          itemId,
          $expr: {
            $gte: [{ $subtract: ['$onHand', '$reserved', '$expired'] }, 4],
          },
        },
        { $inc: { reserved: 4 } },
        { new: true, session: mockSession },
      );
    });

    it('trả về false khi findOneAndUpdate không tìm thấy document khớp (available không đủ)', async () => {
      balanceModel.exec.mockResolvedValueOnce(null);
      const result = await repo.reserveIfAvailable(itemId, 100, {} as never);
      expect(result).toBe(false);
    });
  });

  describe('hasMovementForRef', () => {
    it('trả về true khi countDocuments > 0', async () => {
      movementModel.countDocuments = jest.fn().mockReturnThis();
      movementModel.exec.mockResolvedValueOnce(1);
      const refId = new Types.ObjectId();

      const result = await repo.hasMovementForRef('reservation', refId);

      expect(result).toBe(true);
      expect(movementModel.countDocuments).toHaveBeenCalledWith({
        refType: 'reservation',
        refId,
      });
    });

    it('trả về false khi countDocuments = 0', async () => {
      movementModel.countDocuments = jest.fn().mockReturnThis();
      movementModel.exec.mockResolvedValueOnce(0);
      const result = await repo.hasMovementForRef(
        'reservation',
        new Types.ObjectId(),
      );
      expect(result).toBe(false);
    });
  });

  describe('findMovementsByRef', () => {
    it('gọi find với refType+refId và trả về danh sách movement', async () => {
      movementModel.find = jest.fn().mockReturnThis();
      const refId = new Types.ObjectId();
      const rows = [
        {
          itemId,
          quantity: 3,
          type: MovementType.RESERVE,
        },
      ];
      movementModel.exec.mockResolvedValueOnce(rows);

      const result = await repo.findMovementsByRef('reservation', refId);

      expect(result).toBe(rows);
      expect(movementModel.find).toHaveBeenCalledWith({
        refType: 'reservation',
        refId,
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

    it('gọi .session() khi có truyền session — để thấy được write chưa commit trong cùng transaction', async () => {
      const session = {} as never;
      const sessionMock = jest.fn().mockReturnThis();
      (warehouseItemModel as unknown as { session: jest.Mock }).session =
        sessionMock;
      warehouseItemModel.exec.mockResolvedValueOnce({ sku: 'SKU-1' });

      await repo.findItemBySku('SKU-1', session);

      expect(sessionMock).toHaveBeenCalledWith(session);
    });
  });

  describe('createItem', () => {
    it('gọi create với data + createdBy, isActive mặc định true (không session)', async () => {
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
      expect(warehouseItemModel.create).toHaveBeenCalledWith(
        [{ ...data, createdBy, isActive: true }],
        { session: undefined },
      );
      expect(result).toBe(mockDoc);
    });

    it('truyền session vào Model.create khi có session — issue #25: item + registry entry trong cùng transaction', async () => {
      const createdBy = new Types.ObjectId();
      const session = {} as never;
      const data = {
        sku: 'SKU-1',
        name: 'Test',
        type: 'CUP_BLANK' as const,
        unit: 'cái',
      };
      const mockDoc = { _id: new Types.ObjectId(), ...data };
      warehouseItemModel.create.mockResolvedValueOnce([mockDoc]);

      await repo.createItem(data, createdBy, session);

      expect(warehouseItemModel.create).toHaveBeenCalledWith(
        [expect.objectContaining({ sku: 'SKU-1' })],
        { session },
      );
    });
  });

  describe('findOccupiedVolume', () => {
    it('gọi aggregate với pipeline lookup warehouse_items và group theo shelfId', async () => {
      inventoryModel.aggregate = jest.fn().mockResolvedValue([
        { shelfId: 'shelf-a', occupied: 240 },
        { shelfId: 'shelf-b', occupied: 0 },
      ]);

      const result = await repo.findOccupiedVolume();

      expect(inventoryModel.aggregate).toHaveBeenCalledTimes(1);
      expect(result.get('shelf-a')).toBe(240);
      expect(result.get('shelf-b')).toBe(0);
      expect(result.has('shelf-c')).toBe(false);
    });
  });

  describe('findShelfIdsWithItem', () => {
    it('trả về Set các shelfId có InventoryStock của itemId', async () => {
      const itemId = new Types.ObjectId();
      const shelfA = new Types.ObjectId();
      inventoryModel.distinct = jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue([shelfA]) });

      const result = await repo.findShelfIdsWithItem(itemId);

      expect(inventoryModel.distinct).toHaveBeenCalledWith('shelfId', {
        itemId,
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

  describe('findInventoryByScope', () => {
    it('không kèm filter shelfId khi không truyền shelfIds', async () => {
      inventoryModel.find = jest.fn().mockReturnThis();
      inventoryModel.exec = jest.fn().mockResolvedValue([]);

      await repo.findInventoryByScope();

      expect(inventoryModel.find).toHaveBeenCalledWith({});
    });

    it('lọc thêm theo shelfId $in khi truyền shelfIds', async () => {
      const shelfIds = [new Types.ObjectId(), new Types.ObjectId()];
      inventoryModel.find = jest.fn().mockReturnThis();
      inventoryModel.exec = jest.fn().mockResolvedValue([]);

      await repo.findInventoryByScope(shelfIds);

      expect(inventoryModel.find).toHaveBeenCalledWith({
        shelfId: { $in: shelfIds },
      });
    });

    it('trả về danh sách InventoryStock từ query', async () => {
      const mockDocs = [{ _id: new Types.ObjectId(), quantity: 10 }];
      inventoryModel.find = jest.fn().mockReturnThis();
      inventoryModel.exec = jest.fn().mockResolvedValue(mockDocs);

      const result = await repo.findInventoryByScope();

      expect(result).toEqual(mockDocs);
    });
  });

  describe('sumInventoryByLot', () => {
    it('gộp quantity theo itemId, join sku từ warehouse_items', async () => {
      const lotId = new Types.ObjectId();
      const aggregateResult = [{ itemId, sku: 'SKU-1', qty: 5 }];
      inventoryModel.aggregate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(aggregateResult),
      });

      const rows = await repo.sumInventoryByLot(lotId);

      expect(rows).toEqual(aggregateResult);
      const pipeline = (inventoryModel.aggregate as jest.Mock).mock
        .calls[0][0] as Record<string, unknown>[];
      expect(pipeline[0]).toEqual({
        $match: { lotId, quantity: { $gt: 0 } },
      });
    });
  });

  describe('findAvailableStockForPick', () => {
    it('hàng perishable: dùng aggregate join Lot + Shelf, sắp expiryDate tăng dần (FEFO), loại EXPIRED trong pipeline, trả kèm shelfCode', async () => {
      const pickItemId = new Types.ObjectId();
      const lotAShelf = new Types.ObjectId();
      const lotA = new Types.ObjectId();

      inventoryModel.aggregate = jest.fn().mockResolvedValue([
        {
          shelfId: lotAShelf,
          shelfCode: 'A1-1',
          lotId: lotA,
          lotNumber: 'LOT-A',
          expiryDate: new Date('2026-07-01'),
          quantity: 5,
        },
      ]);

      const result = await repo.findAvailableStockForPick(pickItemId, true);

      expect(inventoryModel.aggregate).toHaveBeenCalledTimes(1);
      const pipeline = (inventoryModel.aggregate as jest.Mock).mock
        .calls[0][0] as Record<string, unknown>[];
      expect(pipeline[0]).toMatchObject({
        $match: {
          itemId: pickItemId,
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
      // Phải join sang collection shelves để lấy code (barcode PICKER đọc/quét) —
      // không chỉ trả shelfId (ObjectId nội bộ, người dùng không đọc được).
      expect(
        pipeline.some(
          (stage) =>
            '$lookup' in stage &&
            (stage['$lookup'] as Record<string, unknown>)['from'] === 'shelves',
        ),
      ).toBe(true);
      expect(result).toEqual([
        {
          shelfId: lotAShelf,
          shelfCode: 'A1-1',
          lotId: lotA,
          lotNumber: 'LOT-A',
          expiryDate: new Date('2026-07-01'),
          quantity: 5,
        },
      ]);
    });

    it('hàng không perishable: dùng aggregate join Shelf, lotId=null, sắp quantity giảm dần, trả kèm shelfCode', async () => {
      const pickItemId = new Types.ObjectId();
      const shelfA = new Types.ObjectId();

      inventoryModel.aggregate = jest
        .fn()
        .mockResolvedValue([
          { shelfId: shelfA, shelfCode: 'B2-3', quantity: 20 },
        ]);

      const result = await repo.findAvailableStockForPick(pickItemId, false);

      expect(inventoryModel.aggregate).toHaveBeenCalledTimes(1);
      const pipeline = (inventoryModel.aggregate as jest.Mock).mock
        .calls[0][0] as Record<string, unknown>[];
      expect(pipeline[0]).toMatchObject({
        $match: {
          itemId: pickItemId,
          lotId: null,
          quantity: { $gt: 0 },
        },
      });
      expect(
        pipeline.some(
          (stage) =>
            '$lookup' in stage &&
            (stage['$lookup'] as Record<string, unknown>)['from'] === 'shelves',
        ),
      ).toBe(true);
      expect(pipeline.some((stage) => '$sort' in stage)).toBe(true);
      expect(result).toEqual([
        {
          shelfId: shelfA,
          shelfCode: 'B2-3',
          lotId: null,
          lotNumber: null,
          expiryDate: null,
          quantity: 20,
        },
      ]);
    });
  });
});
