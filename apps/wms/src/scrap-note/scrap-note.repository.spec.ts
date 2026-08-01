import { Types } from 'mongoose';
import { ScrapNoteRepository } from './scrap-note.repository';
import { ScrapNoteStatus } from './schemas/scrap-note.schema';

describe('ScrapNoteRepository', () => {
  let repo: ScrapNoteRepository;
  let model: {
    create: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };

  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();
  const createdBy = new Types.ObjectId();

  beforeEach(() => {
    model = {
      create: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    repo = new ScrapNoteRepository(model as never);
  });

  describe('findById', () => {
    it('gọi findOne với đúng id', async () => {
      model.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      const result = await repo.findById('sn1');
      expect(model.findOne).toHaveBeenCalledWith({ _id: 'sn1' });
      expect(result).toBeNull();
    });
  });

  describe('upsertFromStockCount', () => {
    it('tạo một phiếu DRAFT gắn sourceStockCountId khi chưa có phiếu nguồn', async () => {
      const sourceStockCountId = new Types.ObjectId();
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      model.create.mockResolvedValue([{ _id: 'sn1' }]);

      const result = await repo.upsertFromStockCount({
        sourceStockCountId,
        scrapNoteNumber: 'SCR-20260730-0004',
        createdBy,
        line: {
          itemId,
          sku: 'SKU-1',
          shelfId,
          lotId: null,
          quantity: 2,
          reason: 'Vỡ',
        },
      });

      expect(result).toEqual({ _id: 'sn1' });
      expect(model.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            sourceStockCountId,
            scrapNoteNumber: 'SCR-20260730-0004',
            status: ScrapNoteStatus.DRAFT,
            items: [expect.objectContaining({ quantity: 2, reason: 'Vỡ' })],
          }),
        ],
        undefined,
      );
    });
  });

  describe('createApprovedScrapNote', () => {
    it('tạo document với status APPROVED và approvedBy=createdBy', async () => {
      const session = {} as never;
      model.create.mockResolvedValue([{ _id: 'sn1' }]);
      await repo.createApprovedScrapNote(
        createdBy,
        [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            quantity: 5,
            reason: 'Hàng hoàn trả bị hỏng (RMA)',
          },
        ],
        session,
        'SCR-20260730-0003',
      );
      expect(model.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            scrapNoteNumber: 'SCR-20260730-0003',
            status: ScrapNoteStatus.APPROVED,
            createdBy,
            approvedBy: createdBy,
            items: [
              expect.objectContaining({
                itemId,
                sku: 'SKU-1',
                shelfId,
                lotId: null,
                quantity: 5,
                reason: 'Hàng hoàn trả bị hỏng (RMA)',
              }),
            ],
          }),
        ],
        { session },
      );
    });
  });

  describe('findAll', () => {
    it('lọc theo status, phân trang mặc định', async () => {
      model.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      });
      model.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });
      await repo.findAll({ status: ScrapNoteStatus.DRAFT });
      expect(model.find).toHaveBeenCalledWith({
        status: ScrapNoteStatus.DRAFT,
      });
    });
  });

  describe('setApproved', () => {
    it('set status=APPROVED, approvedBy, trong session', async () => {
      const session = {} as never;
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await repo.setApproved('sn1', createdBy, session);
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'sn1' },
        { $set: { status: ScrapNoteStatus.APPROVED, approvedBy: createdBy } },
        { session },
      );
    });
  });

  describe('claimApprovedIfDraft', () => {
    it('claim bằng filter DRAFT để không duyệt/trừ tồn hai lần', async () => {
      const session = {} as never;
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'sn1' }),
      });
      const claimed = await repo.claimApprovedIfDraft(
        'sn1',
        createdBy,
        session,
      );
      expect(claimed).toBe(true);
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'sn1', status: ScrapNoteStatus.DRAFT },
        { $set: { status: ScrapNoteStatus.APPROVED, approvedBy: createdBy } },
        { new: true, session },
      );
    });
  });

  describe('setRejected', () => {
    it('set status=REJECTED, approvedBy, rejectReason', async () => {
      model.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      await repo.setRejected('sn1', createdBy, 'Không hợp lệ');
      expect(model.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'sn1' },
        {
          $set: {
            status: ScrapNoteStatus.REJECTED,
            approvedBy: createdBy,
            rejectReason: 'Không hợp lệ',
          },
        },
      );
    });
  });
});
