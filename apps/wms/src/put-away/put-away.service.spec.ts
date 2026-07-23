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

// findShelfByCode giờ gọi thẳng WarehouseRepository (trả về document hoặc null,
// không tự throw) — PutAwayService tự throw PUTAWAY_SHELF_NOT_FOUND khi null.
const makeWarehouseRepo = () => ({
  findShelfByCode: jest.fn(),
});

const makeWarehouseService = () => ({
  findStagingShelf: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

describe('PutAwayService', () => {
  let svc: PutAwayService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let warehouseRepo: ReturnType<typeof makeWarehouseRepo>;
  let warehouseService: ReturnType<typeof makeWarehouseService>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let barcodeSvc: ReturnType<typeof makeBarcodeService>;

  const actorId = new Types.ObjectId().toString();
  const grnId = new Types.ObjectId();
  const warehouseId = new Types.ObjectId();
  const itemId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    warehouseRepo = makeWarehouseRepo();
    warehouseService = makeWarehouseService();
    txHelper = makeTxHelper();
    barcodeSvc = makeBarcodeService();
    svc = new PutAwayService(
      repo as never,
      stockRepo as never,
      warehouseRepo as never,
      warehouseService as never,
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
      // (generic, cross-cutting) do gọi qua WarehouseService.findShelfByCode. Đúng
      // spec (dòng 77), phải throw PUTAWAY_SHELF_NOT_FOUND (domain riêng của put-away).
      repo.findTaskById.mockResolvedValue(baseTask());
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: itemId });
      warehouseRepo.findShelfByCode.mockResolvedValue(null);
      await expect(
        svc.confirmLine(
          taskId,
          { itemBarcode: 'X', shelfCode: 'UNKNOWN', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_SHELF_NOT_FOUND' });
    });

    it('throw PUTAWAY_SHELF_NOT_FOUND khi shelf tìm được thuộc kho KHÁC với task.warehouseId', async () => {
      // Bug tìm thấy ở final review: findShelfByCode tra theo code toàn cục
      // (unique toàn hệ thống), KHÔNG lọc theo warehouseId. Nếu RECEIVER quét
      // nhầm shelf hợp lệ nhưng thuộc kho khác, trước đây vẫn cho qua vì không
      // phải staging → ghi InventoryStock với warehouseId=task.warehouseId
      // nhưng shelfId thực tế ở kho khác → dữ liệu tồn kho mâu thuẫn.
      // Tái dùng PUTAWAY_SHELF_NOT_FOUND vì với kho của task, shelf này coi như
      // "không tồn tại"/không hợp lệ — không tạo code mới.
      repo.findTaskById.mockResolvedValue(baseTask());
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: itemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
        warehouseId: new Types.ObjectId(), // kho khác với task.warehouseId
      });
      await expect(
        svc.confirmLine(
          taskId,
          { itemBarcode: 'X', shelfCode: 'OTHER-WH-A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PUTAWAY_SHELF_NOT_FOUND' });
    });

    it('throw PUTAWAY_SHELF_IS_STAGING khi quét đúng shelf staging', async () => {
      repo.findTaskById.mockResolvedValue(baseTask());
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: itemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: true,
        warehouseId,
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
        warehouseId,
        items: [{ itemId, lotId: null, quantity: 20, remainingQty: 20 }],
      };
      repo.findTaskById.mockResolvedValue(taskWithNullLotLine);
      barcodeSvc.findItemIdByCode.mockResolvedValue(itemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({
        _id: itemId,
        isPerishable: true,
      });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
        warehouseId,
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
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
        warehouseId,
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
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
        warehouseId,
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
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        isStaging: false,
        warehouseId,
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
