import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { StockRepository } from './stock.repository';
import { InventoryStock } from './schemas/inventory-stock.schema';
import { Lot } from './schemas/lot.schema';
import { StockBalance } from './schemas/stock-balance.schema';
import { StockMovement } from './schemas/stock-movement.schema';
import { WarehouseItem } from './schemas/warehouse-item.schema';

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
      } as never;

      const result = await repo.findItemByBarcode('CUP-001');

      expect(findOneMock).toHaveBeenCalledWith({
        $or: [{ barcode: 'CUP-001' }, { altBarcodes: 'CUP-001' }],
      });
      expect(result).toEqual({ sku: 'SKU-1' });
    });
  });
});
