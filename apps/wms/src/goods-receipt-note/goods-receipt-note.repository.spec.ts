import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { GoodsReceiptNoteRepository } from './goods-receipt-note.repository';
import {
  GoodsReceiptNote,
  GoodsReceiptNoteStatus,
} from './schemas/goods-receipt-note.schema';

const makeModel = () => ({
  findOne: jest.fn().mockReturnThis(),
  find: jest.fn().mockReturnThis(),
  countDocuments: jest.fn().mockReturnThis(),
  exists: jest.fn().mockReturnThis(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn().mockReturnThis(),
  deleteOne: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  exec: jest.fn(),
});

describe('GoodsReceiptNoteRepository - vòng đời duyệt', () => {
  let repo: GoodsReceiptNoteRepository;
  let model: ReturnType<typeof makeModel>;
  const actorId = new Types.ObjectId().toString();

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

  it('DRAFT/REJECTED có thể submit sang PENDING_APPROVAL và xóa lý do cũ', async () => {
    model.exec.mockResolvedValue({
      status: GoodsReceiptNoteStatus.PENDING_APPROVAL,
    });

    await repo.updateStatusSubmitted('grn1', actorId);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'grn1',
        status: {
          $in: [GoodsReceiptNoteStatus.DRAFT, GoodsReceiptNoteStatus.REJECTED],
        },
      },
      expect.objectContaining({
        status: GoodsReceiptNoteStatus.PENDING_APPROVAL,
        submittedBy: new Types.ObjectId(actorId),
        rejectionReason: undefined,
      }),
      { new: true },
    );
  });

  it('approve dùng compare-and-set PENDING_APPROVAL trong cùng transaction', async () => {
    const session = {} as never;
    model.exec.mockResolvedValue({ status: GoodsReceiptNoteStatus.APPROVED });

    const result = await repo.updateStatusApproved('grn1', actorId, session);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'grn1', status: GoodsReceiptNoteStatus.PENDING_APPROVAL },
      expect.objectContaining({
        status: GoodsReceiptNoteStatus.APPROVED,
        approvedBy: new Types.ObjectId(actorId),
        approvedAt: expect.any(Date),
      }),
      { new: true, session },
    );
    expect(result).toEqual({ status: GoodsReceiptNoteStatus.APPROVED });
  });

  it('reject chỉ cập nhật phiếu PENDING_APPROVAL và lưu audit', async () => {
    model.exec.mockResolvedValue({ status: GoodsReceiptNoteStatus.REJECTED });

    await repo.updateStatusRejected('grn1', actorId, 'Ảnh chưa rõ');

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'grn1', status: GoodsReceiptNoteStatus.PENDING_APPROVAL },
      expect.objectContaining({
        status: GoodsReceiptNoteStatus.REJECTED,
        rejectedBy: new Types.ObjectId(actorId),
        rejectedAt: expect.any(Date),
        rejectionReason: 'Ảnh chưa rõ',
      }),
      { new: true },
    );
  });

  it('cho phép thay dòng hàng khi DRAFT hoặc REJECTED', async () => {
    model.exec.mockResolvedValue({ status: GoodsReceiptNoteStatus.REJECTED });
    const items = [
      {
        itemId: new Types.ObjectId().toString(),
        sku: 'SKU-1',
        expectedQty: 20,
        actualQty: 2,
        wholePackageOnly: true,
      },
    ];

    await repo.replaceItems('grn1', items);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'grn1',
        status: {
          $in: [GoodsReceiptNoteStatus.DRAFT, GoodsReceiptNoteStatus.REJECTED],
        },
      },
      { items },
      { new: true },
    );
  });

  it('existsOpenGrnForPurchaseOrder: trả về true khi PO có GRN đang DRAFT hoặc PENDING_APPROVAL', async () => {
    const purchaseOrderId = new Types.ObjectId().toString();
    model.exec.mockResolvedValue({ _id: new Types.ObjectId() });

    const result = await repo.existsOpenGrnForPurchaseOrder(purchaseOrderId);

    expect(model.exists).toHaveBeenCalledWith({
      purchaseOrderId: new Types.ObjectId(purchaseOrderId),
      status: {
        $in: [
          GoodsReceiptNoteStatus.DRAFT,
          GoodsReceiptNoteStatus.PENDING_APPROVAL,
          GoodsReceiptNoteStatus.REJECTED,
        ],
      },
    });
    expect(result).toBe(true);
  });

  it('existsOpenGrnForPurchaseOrder: trả về true khi PO chỉ có GRN đang REJECTED (vẫn có thể resubmit lại)', async () => {
    const purchaseOrderId = new Types.ObjectId().toString();
    model.exec.mockResolvedValue({ _id: new Types.ObjectId() });

    const result = await repo.existsOpenGrnForPurchaseOrder(purchaseOrderId);

    expect(model.exists).toHaveBeenCalledWith({
      purchaseOrderId: new Types.ObjectId(purchaseOrderId),
      status: {
        $in: [
          GoodsReceiptNoteStatus.DRAFT,
          GoodsReceiptNoteStatus.PENDING_APPROVAL,
          GoodsReceiptNoteStatus.REJECTED,
        ],
      },
    });
    expect(result).toBe(true);
  });

  it('existsOpenGrnForPurchaseOrder: trả về false khi PO không có GRN nào đang mở', async () => {
    const purchaseOrderId = new Types.ObjectId().toString();
    model.exec.mockResolvedValue(null);

    const result = await repo.existsOpenGrnForPurchaseOrder(purchaseOrderId);

    expect(result).toBe(false);
  });
});
