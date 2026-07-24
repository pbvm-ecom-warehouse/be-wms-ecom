// apps/wms/src/goods-receipt-note/goods-receipt-note.repository.spec.ts
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { GoodsReceiptNoteRepository } from './goods-receipt-note.repository';
import {
  GoodsReceiptNote,
  GoodsReceiptNoteStatus,
} from './schemas/goods-receipt-note.schema';

const makeModel = (overrides: Record<string, jest.Mock> = {}) => ({
  findOne: jest.fn().mockReturnThis(),
  find: jest.fn().mockReturnThis(),
  countDocuments: jest.fn().mockReturnThis(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  exec: jest.fn(),
  ...overrides,
});

describe('GoodsReceiptNoteRepository', () => {
  let repo: GoodsReceiptNoteRepository;
  let model: ReturnType<typeof makeModel>;
  const actorId = new Types.ObjectId().toString();
  const purchaseOrderId = new Types.ObjectId().toString();
  const itemId = new Types.ObjectId().toString();

  beforeEach(async () => {
    model = makeModel();
    const module = await Test.createTestingModule({
      providers: [
        GoodsReceiptNoteRepository,
        { provide: getModelToken(GoodsReceiptNote.name), useValue: model },
      ],
    }).compile();
    repo = module.get(GoodsReceiptNoteRepository);
    jest.clearAllMocks();
  });

  describe('createGoodsReceiptNote', () => {
    it('tạo GRN với grnNumber, status DRAFT, items đã resolve', async () => {
      model.create.mockResolvedValue({ grnNumber: 'GRN-20260703-0001' });
      const resolvedItems = [
        {
          itemId,
          sku: 'SKU-1',
          expectedQty: 100,
          actualQty: 20,
          unit: 'cái',
        },
      ];
      await repo.createGoodsReceiptNote(
        purchaseOrderId,
        'GRN-20260703-0001',
        resolvedItems,
        actorId,
      );
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({
          grnNumber: 'GRN-20260703-0001',
          status: GoodsReceiptNoteStatus.DRAFT,
          items: resolvedItems,
        }),
      );
    });
  });

  describe('findGoodsReceiptNoteById', () => {
    it('gọi findOne với _id', async () => {
      model.exec.mockResolvedValue(null);
      await repo.findGoodsReceiptNoteById('grn1');
      expect(model.findOne).toHaveBeenCalledWith({ _id: 'grn1' });
    });
  });

  describe('findGoodsReceiptNotes', () => {
    it('lọc theo status và purchaseOrderId, phân trang mặc định page=1 limit=20', async () => {
      model.exec.mockResolvedValueOnce([]).mockResolvedValueOnce(0);
      await repo.findGoodsReceiptNotes({
        status: GoodsReceiptNoteStatus.CONFIRMED,
        purchaseOrderId,
      });
      expect(model.find).toHaveBeenCalledWith({
        status: GoodsReceiptNoteStatus.CONFIRMED,
        purchaseOrderId: new Types.ObjectId(purchaseOrderId),
      });
      expect(model.skip).toHaveBeenCalledWith(0);
      expect(model.limit).toHaveBeenCalledWith(20);
    });
  });

  describe('countByGrnNumberPrefix', () => {
    it('đếm GRN theo prefix ngày', async () => {
      model.exec.mockResolvedValue(2);
      const count = await repo.countByGrnNumberPrefix('GRN-20260703');
      expect(model.countDocuments).toHaveBeenCalledWith({
        grnNumber: { $regex: '^GRN-20260703' },
      });
      expect(count).toBe(2);
    });
  });

  describe('updateStatusConfirmed', () => {
    it('set status CONFIRMED + confirmedBy trong session', async () => {
      const session = {} as never;
      await repo.updateStatusConfirmed('grn1', actorId, session);
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'grn1' },
        {
          status: GoodsReceiptNoteStatus.CONFIRMED,
          confirmedBy: new Types.ObjectId(actorId),
        },
        { session },
      );
    });
  });

  describe('updateStatusApproved', () => {
    it('set status APPROVED + approvedBy, trả về doc mới', async () => {
      model.exec.mockResolvedValue({ status: GoodsReceiptNoteStatus.APPROVED });
      const result = await repo.updateStatusApproved('grn1', actorId);
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'grn1' },
        {
          status: GoodsReceiptNoteStatus.APPROVED,
          approvedBy: new Types.ObjectId(actorId),
        },
        { new: true },
      );
      expect(result).toEqual({ status: GoodsReceiptNoteStatus.APPROVED });
    });
  });
});
