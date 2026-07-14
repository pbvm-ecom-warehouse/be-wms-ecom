import { Types } from 'mongoose';
import { ScrapNoteService } from './scrap-note.service';
import { ScrapNoteStatus } from './schemas/scrap-note.schema';

const makeRepo = () => ({
  findById: jest.fn(),
  createScrapNote: jest.fn(),
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

const makeWarehouseRepo = () => ({
  findWarehouseById: jest.fn(),
  findShelfById: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeStockQueue = () => ({ add: jest.fn() });

describe('ScrapNoteService', () => {
  let svc: ScrapNoteService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let warehouseRepo: ReturnType<typeof makeWarehouseRepo>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let stockQueue: ReturnType<typeof makeStockQueue>;

  const actorId = new Types.ObjectId().toString();
  const warehouseId = new Types.ObjectId();
  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();
  const lotId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    warehouseRepo = makeWarehouseRepo();
    txHelper = makeTxHelper();
    stockQueue = makeStockQueue();
    svc = new ScrapNoteService(
      repo as never,
      stockRepo as never,
      warehouseRepo as never,
      txHelper as never,
      stockQueue as never,
    );
  });

  describe('createScrapNote', () => {
    it('tạo phiếu hợp lệ với dòng có lotId (hết hạn) và dòng không có lotId (hỏng)', async () => {
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue({ _id: shelfId });
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
          warehouseId: warehouseId.toString(),
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
        warehouseId,
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
          },
        ],
      );
    });

    it('item isPerishable thiếu lotId → throw SCRAP_NOTE_ITEM_ISPERISHABLE_NO_LOT', async () => {
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: true,
      });

      await expect(
        svc.createScrapNote(
          {
            warehouseId: warehouseId.toString(),
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
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 3 });

      await expect(
        svc.createScrapNote(
          {
            warehouseId: warehouseId.toString(),
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
        warehouseId,
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
        warehouseId,
        shelfId,
        lotId,
        -5,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemId,
        warehouseId,
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
        warehouseId,
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
        warehouseId,
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
        warehouseId,
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
  });

  describe('rejectScrapNote', () => {
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
