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
  findItemByIdDocument: jest.fn(),
  upsertInventory: jest.fn(),
  insertMovement: jest.fn(),
});

const makeBarcodeService = () => ({
  findItemIdByCode: jest.fn(),
});

// findShelfByCode giờ gọi thẳng LocationRepository (trả về document hoặc null,
// không tự throw) — PutAwayService tự throw PUTAWAY_SHELF_NOT_FOUND khi null.
const makeLocationRepo = () => ({
  findShelfByCode: jest.fn(),
  lockActiveShelfForInventory: jest.fn(),
});

const makeLocationService = () => ({
  findStagingShelf: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

describe('PutAwayService', () => {
  let svc: PutAwayService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let locationRepo: ReturnType<typeof makeLocationRepo>;
  let locationService: ReturnType<typeof makeLocationService>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let barcodeSvc: ReturnType<typeof makeBarcodeService>;

  const actorId = new Types.ObjectId().toString();
  const grnId = new Types.ObjectId();
  const itemId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    locationRepo = makeLocationRepo();
    locationService = makeLocationService();
    txHelper = makeTxHelper();
    barcodeSvc = makeBarcodeService();
    svc = new PutAwayService(
      repo as never,
      stockRepo as never,
      locationRepo as never,
      locationService as never,
      txHelper as never,
      barcodeSvc as never,
    );
  });

  describe('createTaskFromGrn', () => {
    it('gọi repo.createTask với đúng session truyền vào, map lines đúng field', async () => {
      const session = {} as never;
      repo.createTask.mockResolvedValue({ _id: 'task1' });

      await svc.createTaskFromGrn(
        grnId,
        [{ itemId: itemId.toString(), lotId: null, quantity: 20 }],
        actorId,
        session,
      );

      expect(repo.createTask).toHaveBeenCalledWith(
        grnId,
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

    it('revalidate shelf đích còn active bên trong transaction trước khi ghi tồn', async () => {
      const transactionSession = {};
      txHelper.withStockTransaction.mockImplementation(
        (work: (session: unknown) => unknown) => work(transactionSession),
      );
      repo.findTaskById
        .mockResolvedValueOnce(baseTask())
        .mockResolvedValueOnce(baseTask());
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: itemId });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
      });
      locationRepo.lockActiveShelfForInventory.mockResolvedValue(null);
      locationService.findStagingShelf.mockResolvedValue({
        _id: stagingShelfId,
      });

      await expect(
        svc.confirmLine(
          taskId,
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_SHELF_NOT_FOUND' });

      expect(locationRepo.lockActiveShelfForInventory).toHaveBeenCalledWith(
        shelfId.toString(),
        transactionSession,
      );
      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
      expect(stockRepo.insertMovement).not.toHaveBeenCalled();
    });

    const baseTask = () => ({
      _id: taskId,
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
      barcodeSvc.findItemIdByCode.mockResolvedValue(null);
      stockRepo.findItemByIdDocument.mockResolvedValue(null);
      await expect(
        svc.confirmLine(
          taskId,
          { itemBarcode: 'UNKNOWN', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_ITEM_NOT_FOUND' });
    });

    it('throw PUTAWAY_SHELF_NOT_FOUND khi shelf code không khớp shelf nào', async () => {
      // Gap reviewer chỉ ra: nhánh shelf-not-found trước đây rơi vào SHELF_NOT_FOUND
      // (generic, cross-cutting) do gọi qua LocationService.findShelfByCode. Đúng
      // spec (dòng 77), phải throw PUTAWAY_SHELF_NOT_FOUND (domain riêng của put-away).
      repo.findTaskById.mockResolvedValue(baseTask());
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: itemId });
      locationRepo.findShelfByCode.mockResolvedValue(null);
      await expect(
        svc.confirmLine(
          taskId,
          { itemBarcode: 'X', shelfCode: 'UNKNOWN', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_SHELF_NOT_FOUND' });
    });

    it('throw PUTAWAY_SHELF_IS_STAGING khi quét đúng shelf staging', async () => {
      repo.findTaskById.mockResolvedValue(baseTask());
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: itemId });
      locationRepo.findShelfByCode.mockResolvedValue({
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

    it('throw PUTAWAY_ITEM_MISMATCH sớm khi item.isPerishable nhưng dto không gửi lotId — kể cả khi (vô tình) có dòng task lotId null trùng khớp', async () => {
      // Finding mức thấp ở final review: trước đây thiếu lotId với item isPerishable
      // thường vẫn bị chặn đúng vì rơi vào nhánh ITEM_MISMATCH khi tìm `line` — NHƯNG
      // đó là hệ quả gián tiếp (do lotId thật của task khác null), không phải validate
      // tường minh. Nếu (giả thuyết) task có 1 dòng lotId=null cho item đó — dữ liệu lẽ
      // ra không nên xảy ra nhưng minh hoạ rằng match-theo-lotId=null vẫn có thể khớp
      // "trùng lặp giả" — thì code CŨ sẽ cho qua vì line match được (cả 2 đều null),
      // dẫn tới ghi nhận put-away cho hàng perishable mà không có lotId. Check mới validate
      // NGAY sau khi có `item`, trước khi dò `line`, nên luôn chặn đúng bất kể task.items
      // chứa gì.
      const taskWithNullLotLine = {
        _id: taskId,
        items: [{ itemId, lotId: null, quantity: 20, remainingQty: 20 }],
      };
      repo.findTaskById.mockResolvedValue(taskWithNullLotLine);
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({
        _id: itemId,
        isPerishable: true,
      });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
      });
      await expect(
        svc.confirmLine(
          taskId,
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 }, // không có lotId
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_ITEM_MISMATCH' });
    });

    it('throw PUTAWAY_ITEM_MISMATCH khi item không thuộc task (lotId khác)', async () => {
      repo.findTaskById.mockResolvedValue(baseTask());
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: itemId });
      locationRepo.findShelfByCode.mockResolvedValue({
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
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: itemId });
      locationRepo.findShelfByCode.mockResolvedValue({
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
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: itemId });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
      });
      locationRepo.lockActiveShelfForInventory.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
      });
      locationService.findStagingShelf.mockResolvedValue({
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
        stagingShelfId,
        null,
        -12,
        expect.anything(),
      );
      expect(stockRepo.upsertInventory).toHaveBeenNthCalledWith(
        2,
        itemId,
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
