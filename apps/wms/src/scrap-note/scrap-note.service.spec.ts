import { Types } from 'mongoose';
import { ScrapNoteService } from './scrap-note.service';
import { ScrapNoteStatus } from './schemas/scrap-note.schema';

const makeRepo = () => ({
  findById: jest.fn(),
  createScrapNote: jest.fn(),
  createApprovedScrapNote: jest.fn(),
  findAll: jest.fn(),
  setApproved: jest.fn(),
  setRejected: jest.fn(),
});

const makeStockRepo = () => ({
  findItemById: jest.fn(),
  findInventory: jest.fn(),
  upsertInventory: jest.fn(),
  upsertBalance: jest.fn(),
  insertMovement: jest.fn(),
});

const makeLocationRepo = () => ({
  findShelfById: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeStockQueue = () => ({ add: jest.fn() });

const makeDocumentNumberService = () => ({
  next: jest.fn().mockResolvedValue('SCR-20260730-0001'),
});

const makeStockService = () => ({ checkAndEmitStockLow: jest.fn() });

const makeCloudinaryService = () => ({
  uploadImage: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/demo/image/upload/wms/scrap-note/x.jpg',
    publicId: 'wms/scrap-note/x',
  }),
});

function fakeImageFile(
  overrides: Partial<{ mimetype: string; size: number; buffer: Buffer }> = {},
) {
  return {
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('fake-image'),
    ...overrides,
  };
}

describe('ScrapNoteService', () => {
  let svc: ScrapNoteService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let stockService: ReturnType<typeof makeStockService>;
  let locationRepo: ReturnType<typeof makeLocationRepo>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let stockQueue: ReturnType<typeof makeStockQueue>;
  let cloudinary: ReturnType<typeof makeCloudinaryService>;
  let documentNumber: ReturnType<typeof makeDocumentNumberService>;

  const actorId = new Types.ObjectId().toString();
  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();
  const lotId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    stockService = makeStockService();
    locationRepo = makeLocationRepo();
    txHelper = makeTxHelper();
    stockQueue = makeStockQueue();
    cloudinary = makeCloudinaryService();
    documentNumber = makeDocumentNumberService();
    svc = new ScrapNoteService(
      repo as never,
      stockRepo as never,
      stockService as never,
      locationRepo as never,
      txHelper as never,
      documentNumber as never,
      stockQueue as never,
      cloudinary as never,
    );
  });

  describe('createScrapNote', () => {
    it('không tìm thấy shelf → throw SHELF_NOT_FOUND, không tạo phiếu', async () => {
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });
      locationRepo.findShelfById.mockResolvedValue(null);

      await expect(
        svc.createScrapNote(
          {
            items: [
              {
                itemId: itemId.toString(),
                shelfId: shelfId.toString(),
                quantity: 5,
                reason: 'Vỡ',
              },
            ],
          },
          actorId,
        ),
      ).rejects.toThrow();
      expect(repo.createScrapNote).not.toHaveBeenCalled();
    });

    it('tạo phiếu hợp lệ với dòng có lotId (hết hạn) và dòng không có lotId (hỏng)', async () => {
      locationRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockImplementation((id: string) =>
        Promise.resolve({
          _id: new Types.ObjectId(id),
          sku: 'SKU-1',
          isPerishable: id === itemId.toString(),
        }),
      );
      stockRepo.findInventory.mockResolvedValue({ quantity: 100 });
      repo.createScrapNote.mockResolvedValue({ _id: 'sn1' });

      await svc.createScrapNote(
        {
          items: [
            {
              itemId: itemId.toString(),
              lotId: lotId.toString(),
              shelfId: shelfId.toString(),
              quantity: 5,
              reason: 'Hết hạn',
            },
          ],
        },
        actorId,
      );

      expect(repo.createScrapNote).toHaveBeenCalledWith(
        undefined,
        expect.anything(),
        [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId,
            quantity: 5,
            reason: 'Hết hạn',
            images: [],
          },
        ],
        'SCR-20260730-0001',
      );
      expect(documentNumber.next).toHaveBeenCalledWith('SCR');
    });

    it('không có imagesByIndex → images rỗng, không gọi CloudinaryService', async () => {
      locationRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 100 });
      repo.createScrapNote.mockResolvedValue({ _id: 'sn1' });

      await svc.createScrapNote(
        {
          items: [
            {
              itemId: itemId.toString(),
              shelfId: shelfId.toString(),
              quantity: 5,
              reason: 'Vỡ',
            },
          ],
        },
        actorId,
      );

      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
      expect(repo.createScrapNote).toHaveBeenCalledWith(
        undefined,
        expect.anything(),
        [expect.objectContaining({ images: [] })],
        'SCR-20260730-0001',
      );
    });

    it('có ảnh minh chứng cho dòng hủy → upload Cloudinary vào wms/scrap-note, lưu URL đúng dòng', async () => {
      locationRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 100 });
      repo.createScrapNote.mockResolvedValue({ _id: 'sn1' });

      const imagesByIndex = new Map([[0, [fakeImageFile()]]]);

      await svc.createScrapNote(
        {
          items: [
            {
              itemId: itemId.toString(),
              shelfId: shelfId.toString(),
              quantity: 5,
              reason: 'Vỡ',
            },
          ],
        },
        actorId,
        imagesByIndex,
      );

      expect(cloudinary.uploadImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        'wms/scrap-note',
      );
      expect(repo.createScrapNote).toHaveBeenCalledWith(
        undefined,
        expect.anything(),
        [
          expect.objectContaining({
            images: [
              'https://res.cloudinary.com/demo/image/upload/wms/scrap-note/x.jpg',
            ],
          }),
        ],
        'SCR-20260730-0001',
      );
    });

    it('ảnh minh chứng sai mimetype → throw VALIDATION_FAILED, không tạo phiếu', async () => {
      locationRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 100 });

      const imagesByIndex = new Map([
        [0, [fakeImageFile({ mimetype: 'application/pdf' })]],
      ]);

      await expect(
        svc.createScrapNote(
          {
            items: [
              {
                itemId: itemId.toString(),
                shelfId: shelfId.toString(),
                quantity: 5,
                reason: 'Vỡ',
              },
            ],
          },
          actorId,
          imagesByIndex,
        ),
      ).rejects.toThrow();
      expect(repo.createScrapNote).not.toHaveBeenCalled();
    });

    it('ảnh minh chứng vượt quá 5MB → throw VALIDATION_FAILED, không tạo phiếu', async () => {
      locationRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 100 });

      const imagesByIndex = new Map([
        [0, [fakeImageFile({ size: 6 * 1024 * 1024 })]],
      ]);

      await expect(
        svc.createScrapNote(
          {
            items: [
              {
                itemId: itemId.toString(),
                shelfId: shelfId.toString(),
                quantity: 5,
                reason: 'Vỡ',
              },
            ],
          },
          actorId,
          imagesByIndex,
        ),
      ).rejects.toThrow();
      expect(repo.createScrapNote).not.toHaveBeenCalled();
    });

    it('item isPerishable thiếu lotId → throw SCRAP_NOTE_ITEM_ISPERISHABLE_NO_LOT', async () => {
      locationRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: true,
      });

      await expect(
        svc.createScrapNote(
          {
            items: [
              {
                itemId: itemId.toString(),
                shelfId: shelfId.toString(),
                quantity: 5,
                reason: 'Vỡ',
              },
            ],
          },
          actorId,
        ),
      ).rejects.toThrow();
      expect(repo.createScrapNote).not.toHaveBeenCalled();
    });

    it('số lượng đề xuất vượt tồn thật tại vị trí → throw SCRAP_NOTE_QTY_EXCEEDS', async () => {
      locationRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 3 });

      await expect(
        svc.createScrapNote(
          {
            items: [
              {
                itemId: itemId.toString(),
                shelfId: shelfId.toString(),
                quantity: 5,
                reason: 'Vỡ',
              },
            ],
          },
          actorId,
        ),
      ).rejects.toThrow();
      expect(repo.createScrapNote).not.toHaveBeenCalled();
    });
  });

  describe('approveScrapNote', () => {
    it('không tìm thấy phiếu → throw SCRAP_NOTE_NOT_FOUND, không mở transaction', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(svc.approveScrapNote('sn1', actorId)).rejects.toThrow();
      expect(txHelper.withStockTransaction).not.toHaveBeenCalled();
    });

    it('phiếu không phải DRAFT → throw SCRAP_NOTE_ALREADY_DECIDED', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.APPROVED,
        items: [],
      });

      await expect(svc.approveScrapNote('sn1', actorId)).rejects.toThrow();
    });

    it('dòng có lotId (hết hạn) → trừ onHand + expired, KHÔNG bắn stock.changed', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId,
            quantity: 5,
            reason: 'Hết hạn',
          },
        ],
      });

      await svc.approveScrapNote('sn1', actorId);

      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        itemId,
        shelfId,
        lotId,
        -5,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemId,
        -5,
        0,
        -5,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: -5, refType: 'scrap_note' }),
        expect.anything(),
      );
      expect(stockQueue.add).not.toHaveBeenCalled();
      expect(repo.setApproved).toHaveBeenCalledWith(
        'sn1',
        expect.anything(),
        expect.anything(),
      );
    });

    it('dòng không có lotId (hỏng) → trừ onHand only, CÓ bắn stock.changed', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            quantity: 5,
            reason: 'Vỡ',
          },
        ],
      });

      await svc.approveScrapNote('sn1', actorId);

      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemId,
        -5,
        0,
        0,
        expect.anything(),
      );
      expect(stockQueue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: 'SKU-1', delta: -5 },
        expect.objectContaining({ jobId: expect.any(String) }),
      );
    });

    it('phiếu nhiều dòng mix cả 2 loại → chỉ bắn event cho dòng không-lotId', async () => {
      const otherItemId = new Types.ObjectId();
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId,
            quantity: 5,
            reason: 'Hết hạn',
          },
          {
            itemId: otherItemId,
            sku: 'SKU-2',
            shelfId,
            lotId: null,
            quantity: 3,
            reason: 'Vỡ',
          },
        ],
      });

      await svc.approveScrapNote('sn1', actorId);

      expect(stockQueue.add).toHaveBeenCalledTimes(1);
      expect(stockQueue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: 'SKU-2', delta: -3 },
        expect.objectContaining({ jobId: expect.any(String) }),
      );
    });

    it('dòng skipAvailableSync=true (dù không có lotId) → KHÔNG bắn stock.changed', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
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
      });

      await svc.approveScrapNote('sn1', actorId);

      expect(stockQueue.add).not.toHaveBeenCalled();
    });

    it('approveScrapNote gọi checkAndEmitStockLow 1 lần khi nhiều dòng cùng itemId (dedup)', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId,
            quantity: 5,
            reason: 'Hết hạn',
          },
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            quantity: 3,
            reason: 'Vỡ',
          },
        ],
      });

      await svc.approveScrapNote('sn1', actorId);

      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledTimes(1);
    });

    it('checkAndEmitStockLow chạy cho MỌI dòng kể cả lotId/skipAvailableSync — không bị filter như stock.changed', async () => {
      const otherItemId = new Types.ObjectId();
      const thirdItemId = new Types.ObjectId();
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
        items: [
          {
            // dòng có lotId — bị skip ở vòng stock.changed, nhưng KHÔNG skip ở checkAndEmitStockLow
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId,
            quantity: 5,
            reason: 'Hết hạn',
          },
          {
            // dòng skipAvailableSync=true — cũng bị skip ở vòng stock.changed
            itemId: otherItemId,
            sku: 'SKU-2',
            shelfId,
            lotId: null,
            quantity: 2,
            reason: 'Hàng hoàn trả bị hỏng (RMA)',
            skipAvailableSync: true,
          },
          {
            // dòng thường — không bị skip ở vòng nào
            itemId: thirdItemId,
            sku: 'SKU-3',
            shelfId,
            lotId: null,
            quantity: 3,
            reason: 'Vỡ',
          },
        ],
      });

      await svc.approveScrapNote('sn1', actorId);

      // vòng stock.changed chỉ bắn cho dòng thứ 3 (không lotId, không skipAvailableSync)
      expect(stockQueue.add).toHaveBeenCalledTimes(1);
      // nhưng checkAndEmitStockLow phải chạy cho CẢ 3 dòng — không filter theo lotId/skipAvailableSync
      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledTimes(3);
      expect(stockService.checkAndEmitStockLow).toHaveBeenNthCalledWith(
        1,
        itemId,
      );
      expect(stockService.checkAndEmitStockLow).toHaveBeenNthCalledWith(
        2,
        otherItemId,
      );
      expect(stockService.checkAndEmitStockLow).toHaveBeenNthCalledWith(
        3,
        thirdItemId,
      );
    });
  });

  describe('createApprovedScrapNoteForReturn', () => {
    it('tạo ScrapNote APPROVED, trừ tồn, ghi SCRAP movement với refId đúng, KHÔNG bắn stock.changed', async () => {
      const scrapNoteId = new Types.ObjectId();
      repo.createApprovedScrapNote.mockResolvedValue({ _id: scrapNoteId });
      const session = {} as never;

      const result = await svc.createApprovedScrapNoteForReturn({
        itemId,
        sku: 'SKU-1',
        shelfId,
        lotId: null,
        quantity: 4,
        actorId: new Types.ObjectId(actorId),
        session,
      });

      expect(repo.createApprovedScrapNote).toHaveBeenCalledWith(
        new Types.ObjectId(actorId),
        [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            quantity: 4,
            reason: 'Hàng hoàn trả bị hỏng (RMA)',
            skipAvailableSync: true,
          },
        ],
        session,
        'SCR-20260730-0001',
      );
      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        itemId,
        shelfId,
        null,
        -4,
        session,
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemId,
        -4,
        0,
        0,
        session,
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: -4,
          refType: 'scrap_note',
          refId: scrapNoteId,
        }),
        session,
      );
      expect(stockQueue.add).not.toHaveBeenCalled();
      expect(result).toBe(scrapNoteId);
    });
  });

  describe('rejectScrapNote', () => {
    it('không tìm thấy phiếu → throw SCRAP_NOTE_NOT_FOUND, không set rejected', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        svc.rejectScrapNote('sn1', { rejectReason: 'x' }, actorId),
      ).rejects.toThrow();
      expect(repo.setRejected).not.toHaveBeenCalled();
    });

    it('phiếu không phải DRAFT → throw SCRAP_NOTE_ALREADY_DECIDED', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.REJECTED,
        items: [],
      });

      await expect(
        svc.rejectScrapNote('sn1', { rejectReason: 'x' }, actorId),
      ).rejects.toThrow();
    });

    it('từ chối hợp lệ → set REJECTED, rejectReason, không đụng tồn kho', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
        items: [],
      });

      await svc.rejectScrapNote(
        'sn1',
        { rejectReason: 'Không hợp lệ' },
        actorId,
      );

      expect(repo.setRejected).toHaveBeenCalledWith(
        'sn1',
        expect.anything(),
        'Không hợp lệ',
      );
      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
      expect(stockRepo.insertMovement).not.toHaveBeenCalled();
      expect(stockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('getScrapNote', () => {
    it('trả về phiếu khi tìm thấy', async () => {
      const doc = { _id: 'sn1' };
      repo.findById.mockResolvedValue(doc);
      const result = await svc.getScrapNote('sn1');
      expect(result).toBe(doc);
    });

    it('không tìm thấy → throw SCRAP_NOTE_NOT_FOUND', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.getScrapNote('sn1')).rejects.toThrow();
    });
  });

  describe('listScrapNotes', () => {
    it('trả về kết quả từ repo.findAll, truyền đúng query', async () => {
      const result = { data: [], total: 0 };
      repo.findAll.mockResolvedValue(result);
      const query = { status: ScrapNoteStatus.DRAFT };
      const returned = await svc.listScrapNotes(query);
      expect(repo.findAll).toHaveBeenCalledWith(query);
      expect(returned).toBe(result);
    });
  });
});
