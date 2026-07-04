import { Types } from 'mongoose';
import { PutAwayService } from './put-away.service';

const makeRepo = () => ({
  createTask: jest.fn(),
  findTaskById: jest.fn(),
  findTasks: jest.fn(),
  decrementRemainingQty: jest.fn(),
  markCompletedIfAllDone: jest.fn(),
});

const makeStockRepo = () => ({
  findItemByBarcode: jest.fn(),
  upsertInventory: jest.fn(),
  insertMovement: jest.fn(),
});

const makeWarehouseService = () => ({
  findShelfByCode: jest.fn(),
  findStagingShelf: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

describe('PutAwayService', () => {
  let svc: PutAwayService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let warehouseService: ReturnType<typeof makeWarehouseService>;
  let txHelper: ReturnType<typeof makeTxHelper>;

  const actorId = new Types.ObjectId().toString();
  const grnId = new Types.ObjectId();
  const warehouseId = new Types.ObjectId();
  const itemId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    warehouseService = makeWarehouseService();
    txHelper = makeTxHelper();
    svc = new PutAwayService(
      repo as never,
      stockRepo as never,
      warehouseService as never,
      txHelper as never,
    );
  });

  describe('createTaskFromGrn', () => {
    it('gọi repo.createTask với đúng session truyền vào, map lines đúng field', async () => {
      const session = {} as never;
      repo.createTask.mockResolvedValue({ _id: 'task1' });

      await svc.createTaskFromGrn(
        grnId,
        warehouseId,
        [{ itemId: itemId.toString(), lotId: null, quantity: 20 }],
        actorId,
        session,
      );

      expect(repo.createTask).toHaveBeenCalledWith(
        grnId,
        warehouseId,
        [{ itemId, lotId: null, quantity: 20 }],
        actorId,
        session,
      );
    });
  });

  describe('confirmLine', () => {
    const taskId = 'task1';
    const shelfId = new Types.ObjectId();
    const stagingShelfId = new Types.ObjectId();

    const baseTask = () => ({
      _id: taskId,
      warehouseId,
      items: [{ itemId, lotId: null, quantity: 20, remainingQty: 20 }],
    });

    it('throw PUTAWAY_TASK_NOT_FOUND khi task không tồn tại', async () => {
      repo.findTaskById.mockResolvedValue(null);
      await expect(
        svc.confirmLine(
          taskId,
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_TASK_NOT_FOUND' });
    });

    it('throw PUTAWAY_ITEM_NOT_FOUND khi barcode không khớp item nào', async () => {
      repo.findTaskById.mockResolvedValue(baseTask());
      stockRepo.findItemByBarcode.mockResolvedValue(null);
      await expect(
        svc.confirmLine(
          taskId,
          { itemBarcode: 'UNKNOWN', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_ITEM_NOT_FOUND' });
    });

    it('throw PUTAWAY_SHELF_IS_STAGING khi quét đúng shelf staging', async () => {
      repo.findTaskById.mockResolvedValue(baseTask());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseService.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: true,
      });
      await expect(
        svc.confirmLine(
          taskId,
          { itemBarcode: 'X', shelfCode: 'STAGING', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_SHELF_IS_STAGING' });
    });

    it('throw PUTAWAY_ITEM_MISMATCH khi item không thuộc task (lotId khác)', async () => {
      repo.findTaskById.mockResolvedValue(baseTask());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseService.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
      });
      await expect(
        svc.confirmLine(
          taskId,
          {
            itemBarcode: 'X',
            shelfCode: 'A1',
            quantity: 5,
            lotId: new Types.ObjectId().toString(),
          },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_ITEM_MISMATCH' });
    });

    it('throw PUTAWAY_QTY_EXCEEDS khi quantity > remainingQty', async () => {
      repo.findTaskById.mockResolvedValue(baseTask());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseService.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
      });
      await expect(
        svc.confirmLine(
          taskId,
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 999 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_QTY_EXCEEDS' });
    });

    it('ghi 2 InventoryStock deltas + 2 movement PUTAWAY lệch dấu khi hợp lệ, không đụng StockBalance', async () => {
      repo.findTaskById
        .mockResolvedValueOnce(baseTask())
        .mockResolvedValueOnce({ ...baseTask(), status: 'COMPLETED' });
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: itemId });
      warehouseService.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
      });
      warehouseService.findStagingShelf.mockResolvedValue({
        _id: stagingShelfId,
      });

      await svc.confirmLine(
        taskId,
        { itemBarcode: 'X', shelfCode: 'A1', quantity: 12 },
        actorId,
      );

      expect(stockRepo.upsertInventory).toHaveBeenNthCalledWith(
        1,
        itemId,
        warehouseId,
        stagingShelfId,
        null,
        -12,
        expect.anything(),
      );
      expect(stockRepo.upsertInventory).toHaveBeenNthCalledWith(
        2,
        itemId,
        warehouseId,
        shelfId,
        null,
        12,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledTimes(2);
      expect(stockRepo.insertMovement).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          shelfId: stagingShelfId,
          type: 'PUTAWAY',
          quantity: -12,
          refType: 'put_away_task',
        }),
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          shelfId,
          type: 'PUTAWAY',
          quantity: 12,
          refType: 'put_away_task',
        }),
        expect.anything(),
      );
      expect(repo.decrementRemainingQty).toHaveBeenCalledWith(
        taskId,
        itemId,
        null,
        12,
        expect.anything(),
      );
      expect(repo.markCompletedIfAllDone).toHaveBeenCalledWith(
        taskId,
        expect.anything(),
      );
      // Bất biến UC-03: onHand không đổi — StockRepository.upsertBalance KHÔNG được gọi
      expect(
        (stockRepo as unknown as { upsertBalance?: jest.Mock }).upsertBalance,
      ).toBeUndefined();
    });
  });
});
