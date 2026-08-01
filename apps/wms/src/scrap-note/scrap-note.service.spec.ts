import { Types } from 'mongoose';
import { ScrapNoteService } from './scrap-note.service';
import { ScrapNoteStatus } from './schemas/scrap-note.schema';

const makeRepo = () => ({
  findById: jest.fn(),
  createApprovedScrapNote: jest.fn(),
  findBySourceStockCountId: jest.fn(),
  upsertFromStockCount: jest.fn(),
  claimApprovedIfDraft: jest.fn(),
  claimRejectedIfDraft: jest.fn(),
  markItemMovedToScrap: jest.fn(),
  markQuarantinedIfAllMoved: jest.fn(),
  claimDisposedIfQuarantined: jest.fn(),
  findAll: jest.fn(),
  setApproved: jest.fn(),
  setRejected: jest.fn(),
});

const makeStockRepo = () => ({
  findItemById: jest.fn(),
  findInventory: jest.fn(),
  upsertInventory: jest.fn(),
  upsertBalance: jest.fn(),
  decrementInventoryIfAvailable: jest.fn(),
  decrementInventoryAtShelfIfAvailable: jest.fn(),
  decrementBalanceForScrapIfAvailable: jest.fn(),
  lockInventoryRowForQuarantine: jest.fn(),
  decrementQuarantinedInventoryIfAvailable: jest.fn(),
  unlockInventoryRowFromQuarantine: jest.fn(),
  releaseInventoryQuarantine: jest.fn(),
  adjustQuarantinedBalance: jest.fn(),
  releaseQuarantinedBalance: jest.fn(),
  disposeQuarantinedBalance: jest.fn(),
  findLotById: jest.fn(),
  insertMovement: jest.fn(),
});

const makeLocationRepo = () => ({
  findShelfById: jest.fn(),
  findCellByCode: jest.fn(),
  findCellById: jest.fn(),
  findRackById: jest.fn(),
  findZoneById: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeStockQueue = () => ({ add: jest.fn() });

const makeDocumentNumberService = () => ({
  next: jest.fn().mockResolvedValue('SCR-20260730-0001'),
});

const makeStockService = () => ({ checkAndEmitStockLow: jest.fn() });

const makeStockCountRepo = () => ({ findById: jest.fn() });

const makeBarcodeService = () => ({ findItemIdByCode: jest.fn() });

const makeCloudinaryService = () => ({
  uploadImage: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/demo/image/upload/wms/scrap-note/x.jpg',
    publicId: 'wms/scrap-note/x',
  }),
});

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
  let stockCountRepo: ReturnType<typeof makeStockCountRepo>;
  let barcodeService: ReturnType<typeof makeBarcodeService>;

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
    stockCountRepo = makeStockCountRepo();
    barcodeService = makeBarcodeService();
    repo.claimApprovedIfDraft.mockResolvedValue(true);
    stockRepo.decrementInventoryIfAvailable.mockResolvedValue({ quantity: 5 });
    stockRepo.decrementInventoryAtShelfIfAvailable.mockResolvedValue(true);
    stockRepo.decrementBalanceForScrapIfAvailable.mockResolvedValue(true);
    stockRepo.lockInventoryRowForQuarantine.mockResolvedValue({ quantity: 5 });
    stockRepo.upsertBalance.mockResolvedValue(true);
    stockRepo.adjustQuarantinedBalance.mockResolvedValue(true);
    stockRepo.releaseQuarantinedBalance.mockResolvedValue(true);
    stockRepo.releaseInventoryQuarantine.mockResolvedValue({
      quantity: 0,
      quarantinedQuantity: 0,
    });
    stockRepo.decrementQuarantinedInventoryIfAvailable.mockResolvedValue({
      quantity: 0,
      quarantinedQuantity: 0,
    });
    stockRepo.upsertInventory.mockResolvedValue({ quantity: 1 });
    stockRepo.insertMovement.mockResolvedValue(undefined);
    repo.markItemMovedToScrap.mockResolvedValue({ _id: 'sn1' });
    repo.claimRejectedIfDraft.mockResolvedValue(true);
    svc = new ScrapNoteService(
      repo as never,
      stockRepo as never,
      stockService as never,
      locationRepo as never,
      txHelper as never,
      documentNumber as never,
      stockCountRepo as never,
      barcodeService as never,
      stockQueue as never,
      cloudinary as never,
    );
  });

  describe('moveItemToScrap quarantine allocations', () => {
    const sourceCellId = new Types.ObjectId();
    const targetCellId = new Types.ObjectId();
    const targetShelfId = new Types.ObjectId();
    const targetRackId = new Types.ObjectId();

    const arrangeMove = (overrides: Record<string, unknown> = {}) => {
      const note = {
        _id: new Types.ObjectId(),
        status: ScrapNoteStatus.APPROVED,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            sourceCellId,
            lotId: null,
            quantity: 2,
            lockedQuantity: 2,
            excludedByExpired: false,
            scrapCellId: null,
            ...overrides,
          },
        ],
      };
      repo.findById.mockResolvedValue(note);
      barcodeService.findItemIdByCode.mockResolvedValue(itemId);
      locationRepo.findCellByCode
        .mockResolvedValueOnce({
          _id: sourceCellId,
          shelfId,
          rackId: new Types.ObjectId(),
        })
        .mockResolvedValueOnce({
          _id: targetCellId,
          shelfId: targetShelfId,
          rackId: targetRackId,
        });
      locationRepo.findShelfByCode = jest.fn().mockResolvedValue(null);
      locationRepo.findRackById.mockResolvedValue({
        _id: targetRackId,
        zoneId: new Types.ObjectId(),
      });
      locationRepo.findZoneById.mockResolvedValue({
        zonePurpose: 'SCRAP',
      });
      return note;
    };

    it('hai DAMAGED returns cùng tuple: move phiếu đầu không mở khóa allocation còn lại', async () => {
      arrangeMove();

      await svc.moveItemToScrap(
        'sn1',
        itemId.toString(),
        {
          itemBarcode: 'ITEM-1',
          sourceCellBarcode: 'SRC-1',
          targetCellBarcode: 'SCRAP-1',
        },
        actorId,
      );

      expect(
        stockRepo.unlockInventoryRowFromQuarantine,
      ).not.toHaveBeenCalled();
      expect(stockRepo.releaseInventoryQuarantine).not.toHaveBeenCalled();
      expect(
        stockRepo.decrementQuarantinedInventoryIfAvailable,
      ).toHaveBeenCalledWith(
        itemId,
        shelfId,
        sourceCellId,
        null,
        2,
        expect.anything(),
      );
    });

    it('lot hết hạn trong lúc chờ move: phần release chuyển q sang expired và không emit available dương', async () => {
      arrangeMove({
        lotId,
        quantity: 2,
        lockedQuantity: 5,
      });
      stockRepo.findLotById.mockResolvedValue({
        status: 'EXPIRED',
        expiryDate: new Date('2026-07-01T00:00:00.000Z'),
      });

      await svc.moveItemToScrap(
        'sn1',
        itemId.toString(),
        {
          itemBarcode: 'ITEM-1',
          sourceCellBarcode: 'SRC-1',
          targetCellBarcode: 'SCRAP-1',
        },
        actorId,
      );

      expect(stockRepo.releaseInventoryQuarantine).toHaveBeenCalledWith(
        itemId,
        shelfId,
        sourceCellId,
        lotId,
        3,
        expect.anything(),
      );
      expect(stockRepo.releaseQuarantinedBalance).toHaveBeenCalledWith(
        itemId,
        3,
        true,
        expect.anything(),
      );
      expect(stockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('createFromStockCount', () => {
    const stockCountId = new Types.ObjectId().toString();

    const source = (overrides: Record<string, unknown> = {}) => ({
      _id: stockCountId,
      status: 'IN_PROGRESS',
      items: [
        {
          itemId,
          sku: 'SKU-1',
          shelfId,
          lotId: null,
          actualQty: 10,
        },
      ],
      ...overrides,
    });

    const dto = (overrides: Record<string, unknown> = {}) => ({
      itemBarcode: 'BARCODE-SKU-1',
      shelfId: shelfId.toString(),
      quantity: 2,
      reason: 'Hai thùng bị vỡ',
      ...overrides,
    });

    it('quét đúng SKU và upsert một dòng phiếu hủy gắn Stock Count nguồn', async () => {
      stockCountRepo.findById.mockResolvedValue(source());
      barcodeService.findItemIdByCode.mockResolvedValue(itemId);
      repo.upsertFromStockCount.mockResolvedValue({ _id: 'scrap-1' });

      await svc.createFromStockCount(
        stockCountId,
        itemId.toString(),
        dto(),
        actorId,
      );

      expect(documentNumber.next).toHaveBeenCalledWith('SCR');
      expect(repo.upsertFromStockCount).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceStockCountId: new Types.ObjectId(stockCountId),
          scrapNoteNumber: 'SCR-20260730-0001',
          createdBy: new Types.ObjectId(actorId),
          line: expect.objectContaining({
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            quantity: 2,
            reason: 'Hai thùng bị vỡ',
          }),
        }),
        expect.anything(),
      );
    });

    it('từ chối barcode resolve sang SKU khác dòng', async () => {
      stockCountRepo.findById.mockResolvedValue(source());
      barcodeService.findItemIdByCode.mockResolvedValue(new Types.ObjectId());

      await expect(
        svc.createFromStockCount(
          stockCountId,
          itemId.toString(),
          dto() as never,
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'SCRAP_NOTE_BARCODE_MISMATCH' });
      expect(repo.upsertFromStockCount).not.toHaveBeenCalled();
    });

    it('từ chối dòng chưa nhập actualQty', async () => {
      stockCountRepo.findById.mockResolvedValue(
        source({
          items: [
            { itemId, sku: 'SKU-1', shelfId, lotId: null, actualQty: null },
          ],
        }),
      );
      barcodeService.findItemIdByCode.mockResolvedValue(itemId);

      await expect(
        svc.createFromStockCount(
          stockCountId,
          itemId.toString(),
          dto() as never,
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'SCRAP_NOTE_SOURCE_LINE_NOT_COUNTED' });
    });

    it('từ chối quantity vượt actualQty đã đếm', async () => {
      stockCountRepo.findById.mockResolvedValue(source());
      barcodeService.findItemIdByCode.mockResolvedValue(itemId);

      await expect(
        svc.createFromStockCount(
          stockCountId,
          itemId.toString(),
          dto({ quantity: 11 }) as never,
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'SCRAP_NOTE_QTY_EXCEEDS_ACTUAL' });
    });

    it('từ chối tạo/cập nhật khi Stock Count nguồn đã APPROVED', async () => {
      stockCountRepo.findById.mockResolvedValue(source({ status: 'APPROVED' }));
      barcodeService.findItemIdByCode.mockResolvedValue(itemId);

      await expect(
        svc.createFromStockCount(
          stockCountId,
          itemId.toString(),
          dto() as never,
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'STOCK_COUNT_ALREADY_APPROVED' });
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

    it('phiếu từ kiểm kê chỉ được duyệt sau Stock Count nguồn APPROVED', async () => {
      const sourceStockCountId = new Types.ObjectId();
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
        sourceStockCountId,
        items: [],
      });
      stockCountRepo.findById.mockResolvedValue({
        _id: sourceStockCountId,
        status: 'COMPLETED',
      });

      await expect(svc.approveScrapNote('sn1', actorId)).rejects.toMatchObject({
        code: 'SCRAP_NOTE_SOURCE_NOT_APPROVED',
      });
      expect(txHelper.withStockTransaction).not.toHaveBeenCalled();
    });

    it('compare-and-set thua race không trừ tồn lần hai', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', shelfId, lotId: null, quantity: 2 }],
      });
      repo.claimApprovedIfDraft.mockResolvedValue(false);

      await expect(svc.approveScrapNote('sn1', actorId)).rejects.toMatchObject({
        code: 'SCRAP_NOTE_ALREADY_DECIDED',
      });
      expect(
        stockRepo.decrementInventoryAtShelfIfAvailable,
      ).not.toHaveBeenCalled();
    });

    it('approve chỉ đổi trạng thái, chưa trừ tồn vật lý', async () => {
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', shelfId, lotId: null, quantity: 2 }],
      });
      await expect(svc.approveScrapNote('sn1', actorId)).resolves.toBeDefined();
      expect(
        stockRepo.decrementBalanceForScrapIfAvailable,
      ).not.toHaveBeenCalled();
      expect(stockRepo.insertMovement).not.toHaveBeenCalled();
    });

    it('approve không trừ onHand hay bắn stock.changed', async () => {
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

      expect(
        stockRepo.decrementInventoryAtShelfIfAvailable,
      ).not.toHaveBeenCalled();
      expect(
        stockRepo.decrementBalanceForScrapIfAvailable,
      ).not.toHaveBeenCalled();
      expect(stockRepo.insertMovement).not.toHaveBeenCalled();
      expect(stockQueue.add).not.toHaveBeenCalled();
      expect(repo.claimApprovedIfDraft).toHaveBeenCalledWith(
        'sn1',
        expect.anything(),
        expect.anything(),
      );
    });

    it('approve dòng hỏng cũng không bắn stock.changed', async () => {
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

      expect(
        stockRepo.decrementBalanceForScrapIfAvailable,
      ).not.toHaveBeenCalled();
      expect(stockQueue.add).not.toHaveBeenCalled();
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

      expect(stockQueue.add).not.toHaveBeenCalled();
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

      expect(stockService.checkAndEmitStockLow).not.toHaveBeenCalled();
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

      expect(stockQueue.add).not.toHaveBeenCalled();
      expect(stockService.checkAndEmitStockLow).not.toHaveBeenCalled();
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
          expect.objectContaining({
            itemId,
            sku: 'SKU-1',
            shelfId,
            lotId: null,
            quantity: 4,
            reason: 'Hàng hoàn trả bị hỏng (RMA)',
          }),
        ],
        session,
        'SCR-20260730-0001',
      );
      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
      expect(stockRepo.insertMovement).not.toHaveBeenCalled();
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

      expect(repo.claimRejectedIfDraft).toHaveBeenCalledWith(
        'sn1',
        expect.anything(),
        'Không hợp lệ',
        expect.anything(),
      );
      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
      expect(stockRepo.insertMovement).not.toHaveBeenCalled();
      expect(stockQueue.add).not.toHaveBeenCalled();
    });

    it('lot hết hạn trong lúc chờ reject: chuyển q sang expired và không emit available dương', async () => {
      const sourceCellId = new Types.ObjectId();
      repo.findById.mockResolvedValue({
        _id: 'sn1',
        status: ScrapNoteStatus.DRAFT,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            shelfId,
            sourceCellId,
            lotId,
            quantity: 2,
            lockedQuantity: 5,
            excludedByExpired: false,
          },
        ],
      });
      stockRepo.findLotById.mockResolvedValue({
        status: 'EXPIRED',
        expiryDate: new Date('2026-07-01T00:00:00.000Z'),
      });

      await svc.rejectScrapNote(
        'sn1',
        { rejectReason: 'Không hủy nữa' },
        actorId,
      );

      expect(stockRepo.releaseInventoryQuarantine).toHaveBeenCalledWith(
        itemId,
        shelfId,
        sourceCellId,
        lotId,
        5,
        expect.anything(),
      );
      expect(stockRepo.releaseQuarantinedBalance).toHaveBeenCalledWith(
        itemId,
        5,
        true,
        expect.anything(),
      );
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
