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

  describe('createScrapNote', () => {
    it('tạo document với status DRAFT, items đúng shape (images mặc định rỗng)', async () => {
      model.create.mockResolvedValue([{ _id: 'sn1' }]);
      await repo.createScrapNote(
        'Ghi chú',
        createdBy,
        [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            quantity: 5,
            reason: 'Vỡ',
          },
        ],
        'SCR-20260730-0001',
      );
      expect(model.create).toHaveBeenCalledWith([
        {
          scrapNoteNumber: 'SCR-20260730-0001',
          note: 'Ghi chú',
          status: ScrapNoteStatus.DRAFT,
          createdBy,
          items: [
            {
              itemId,
              sku: 'SKU-1',
              shelfId,
              lotId: null,
              quantity: 5,
              reason: 'Vỡ',
              images: [],
            },
          ],
        },
      ]);
    });

    it('lưu images vào đúng dòng khi có ảnh minh chứng', async () => {
      model.create.mockResolvedValue([{ _id: 'sn1' }]);
      await repo.createScrapNote(
        undefined,
        createdBy,
        [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            quantity: 5,
            reason: 'Vỡ',
            images: ['https://res.cloudinary.com/demo/image/upload/x.jpg'],
          },
        ],
        'SCR-20260730-0002',
      );
      expect(model.create).toHaveBeenCalledWith([
        expect.objectContaining({
          items: [
            expect.objectContaining({
              images: ['https://res.cloudinary.com/demo/image/upload/x.jpg'],
            }),
          ],
        }),
      ]);
    });
  });

  describe('createApprovedScrapNote', () => {
    it('tạo document với status APPROVED, approvedBy=createdBy, skipAvailableSync đúng', async () => {
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
            skipAvailableSync: true,
          },
        ],
        session,
        'SCR-20260730-0003',
      );
      expect(model.create).toHaveBeenCalledWith(
        [
          {
            scrapNoteNumber: 'SCR-20260730-0003',
            status: ScrapNoteStatus.APPROVED,
            createdBy,
            approvedBy: createdBy,
            items: [
              {
                itemId,
                sku: 'SKU-1',
                shelfId,
                lotId: null,
                quantity: 5,
                reason: 'Hàng hoàn trả bị hỏng (RMA)',
                skipAvailableSync: true,
              },
            ],
          },
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
