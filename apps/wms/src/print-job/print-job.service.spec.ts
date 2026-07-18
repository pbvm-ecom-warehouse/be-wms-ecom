import { Types } from 'mongoose';
import { PrintJobService } from './print-job.service';
import { PrintJobStatus, PrintJobLineStatus } from './schemas/print-job.schema';
import { ItemType } from '../stock/schemas/warehouse-item.schema';

const makeRepo = () => ({
  findByOrderId: jest.fn(),
  findById: jest.fn(),
  createPrintJob: jest.fn(),
  findAll: jest.fn(),
  decrementRemainingQty: jest.fn(),
  markLineConsumedIfDone: jest.fn(),
  markLineCompleted: jest.fn(),
  markJobCompleted: jest.fn(),
});

const makeStockRepo = () => ({
  findItemBySku: jest.fn(),
  findItemByBarcode: jest.fn(),
  findBalanceByItemAndWarehouse: jest.fn(),
  upsertBalance: jest.fn(),
  findInventory: jest.fn(),
  upsertInventory: jest.fn(),
  insertMovement: jest.fn(),
  createItem: jest.fn(),
  findSkuById: jest.fn(),
});

const makeWarehouseRepo = () => ({
  findShelfByCode: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeStockService = () => ({
  checkAndEmitStockLow: jest.fn(),
});

// stock.changed (reserve CUP_BLANK) đi QUEUES.STOCK, print.completed đi
// QUEUES.SHIPMENT — 2 queue riêng, khớp đúng consumer thật bên Ecom
// (apps/ecommerce/src/catalog/stock.consumer.ts @Processor(QUEUES.STOCK) và
// apps/ecommerce/src/order/order.consumer.ts @Processor(QUEUES.SHIPMENT)).
const makeStockQueue = () => ({ add: jest.fn() });
const makeShipmentQueue = () => ({ add: jest.fn() });

describe('PrintJobService', () => {
  let svc: PrintJobService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let warehouseRepo: ReturnType<typeof makeWarehouseRepo>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let stockService: ReturnType<typeof makeStockService>;
  let stockQueue: ReturnType<typeof makeStockQueue>;
  let shipmentQueue: ReturnType<typeof makeShipmentQueue>;

  const actorId = new Types.ObjectId().toString();
  const orderId = 'order-1';
  const warehouseId = new Types.ObjectId();
  const blankItemId = new Types.ObjectId();
  const printedItemId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    warehouseRepo = makeWarehouseRepo();
    txHelper = makeTxHelper();
    stockService = makeStockService();
    stockQueue = makeStockQueue();
    shipmentQueue = makeShipmentQueue();
    svc = new PrintJobService(
      repo as never,
      stockRepo as never,
      stockService as never,
      warehouseRepo as never,
      txHelper as never,
      stockQueue as never,
      shipmentQueue as never,
    );
  });

  describe('createFromPrintRequested', () => {
    it('bỏ qua nếu đã có PrintJob cho orderId này (idempotent)', async () => {
      repo.findByOrderId.mockResolvedValue({ _id: 'pj1' });
      await svc.createFromPrintRequested(orderId, warehouseId.toString(), [
        { sku: 'CUP-PRINTED-1', quantity: 5 },
      ]);
      expect(repo.createPrintJob).not.toHaveBeenCalled();
    });

    it('design đã có CUP_PRINTED với blankItemId sẵn — dùng luôn, reserve đủ khi available đủ', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      stockRepo.findItemBySku.mockImplementation((sku: string) =>
        sku === 'CUP-PRINTED-1'
          ? Promise.resolve({
              _id: printedItemId,
              sku: 'CUP-PRINTED-1',
              type: ItemType.CUP_PRINTED,
              blankItemId,
            })
          : Promise.resolve(null),
      );
      stockRepo.findBalanceByItemAndWarehouse.mockResolvedValue({
        onHand: 100,
        reserved: 20,
        expired: 0,
      });
      stockRepo.findSkuById.mockResolvedValue({ sku: 'CUP-BLANK-500' });

      await svc.createFromPrintRequested(orderId, warehouseId.toString(), [
        { sku: 'CUP-PRINTED-1', quantity: 10 },
      ]);

      // available = 100 - 20 - 0 = 80 ≥ 10 → reservedQty = 10
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        blankItemId,
        warehouseId,
        0,
        10,
        0,
        expect.anything(),
      );
      expect(repo.createPrintJob).toHaveBeenCalledWith(
        orderId,
        warehouseId,
        [
          {
            inputItemId: blankItemId,
            outputItemId: printedItemId,
            sku: 'CUP-PRINTED-1',
            designFile: undefined,
            quantity: 10,
            reservedQty: 10,
          },
        ],
        expect.anything(),
      );
      expect(stockQueue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: expect.any(String), delta: -10 },
        expect.objectContaining({ jobId: expect.any(String) }),
      );
    });

    it('reserve min(quantity, available) khi CUP_BLANK không đủ tồn, vẫn tạo job', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      stockRepo.findItemBySku.mockResolvedValue({
        _id: printedItemId,
        sku: 'CUP-PRINTED-1',
        type: ItemType.CUP_PRINTED,
        blankItemId,
      });
      stockRepo.findBalanceByItemAndWarehouse.mockResolvedValue({
        onHand: 5,
        reserved: 0,
        expired: 0,
      });

      await svc.createFromPrintRequested(orderId, warehouseId.toString(), [
        { sku: 'CUP-PRINTED-1', quantity: 10 },
      ]);

      // available = 5 → reservedQty = min(10, 5) = 5
      expect(repo.createPrintJob).toHaveBeenCalledWith(
        orderId,
        warehouseId,
        [expect.objectContaining({ quantity: 10, reservedQty: 5 })],
        expect.anything(),
      );
    });

    it('design mới (chưa có CUP_PRINTED) + có blankSku → tạo item mới với blankItemId', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      const newBlankItemId = new Types.ObjectId();
      stockRepo.findItemBySku.mockImplementation((sku: string) => {
        if (sku === 'CUP-PRINTED-NEW') return Promise.resolve(null);
        if (sku === 'CUP-BLANK-500')
          return Promise.resolve({
            _id: newBlankItemId,
            sku: 'CUP-BLANK-500',
            type: ItemType.CUP_BLANK,
          });
        return Promise.resolve(null);
      });
      stockRepo.createItem.mockResolvedValue({
        _id: printedItemId,
        sku: 'CUP-PRINTED-NEW',
      });
      stockRepo.findBalanceByItemAndWarehouse.mockResolvedValue({
        onHand: 100,
        reserved: 0,
        expired: 0,
      });

      await svc.createFromPrintRequested(orderId, warehouseId.toString(), [
        {
          sku: 'CUP-PRINTED-NEW',
          quantity: 3,
          blankSku: 'CUP-BLANK-500',
          designFile: 'design-042.png',
        },
      ]);

      expect(stockRepo.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: 'CUP-PRINTED-NEW',
          type: ItemType.CUP_PRINTED,
          blankItemId: newBlankItemId,
        }),
        expect.any(Types.ObjectId),
      );
      expect(repo.createPrintJob).toHaveBeenCalledWith(
        orderId,
        warehouseId,
        [
          expect.objectContaining({
            inputItemId: newBlankItemId,
            outputItemId: printedItemId,
            designFile: 'design-042.png',
          }),
        ],
        expect.anything(),
      );
    });

    it('bỏ qua dòng design mới thiếu blankSku, vẫn tạo job với dòng hợp lệ khác', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      stockRepo.findItemBySku.mockImplementation((sku: string) =>
        sku === 'CUP-PRINTED-OK'
          ? Promise.resolve({
              _id: printedItemId,
              sku: 'CUP-PRINTED-OK',
              type: ItemType.CUP_PRINTED,
              blankItemId,
            })
          : Promise.resolve(null),
      );
      stockRepo.findBalanceByItemAndWarehouse.mockResolvedValue({
        onHand: 100,
        reserved: 0,
        expired: 0,
      });

      await svc.createFromPrintRequested(orderId, warehouseId.toString(), [
        { sku: 'CUP-PRINTED-OK', quantity: 5 },
        { sku: 'CUP-PRINTED-NO-BLANK-SKU', quantity: 2 },
      ]);

      expect(repo.createPrintJob).toHaveBeenCalledWith(
        orderId,
        warehouseId,
        [expect.objectContaining({ sku: 'CUP-PRINTED-OK' })],
        expect.anything(),
      );
      expect(stockRepo.createItem).not.toHaveBeenCalled();
    });

    it('bỏ qua dòng sku output tồn tại nhưng sai type, không throw', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      stockRepo.findItemBySku.mockResolvedValue({
        _id: printedItemId,
        sku: 'CUP-PRINTED-1',
        type: ItemType.MATERIAL,
      });

      await svc.createFromPrintRequested(orderId, warehouseId.toString(), [
        { sku: 'CUP-PRINTED-1', quantity: 5 },
      ]);

      expect(repo.createPrintJob).not.toHaveBeenCalled();
    });

    it('không tạo job nếu không có dòng nào hợp lệ', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      stockRepo.findItemBySku.mockResolvedValue(null);
      await svc.createFromPrintRequested(orderId, warehouseId.toString(), [
        { sku: 'CUP-PRINTED-UNKNOWN', quantity: 3 },
      ]);
      expect(repo.createPrintJob).not.toHaveBeenCalled();
    });

    it('gọi checkAndEmitStockLow cho mỗi dòng đã reserve (reservedQty > 0)', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      const printedItemId2 = new Types.ObjectId();
      const blankItemId2 = new Types.ObjectId();
      stockRepo.findItemBySku.mockImplementation((sku: string) => {
        if (sku === 'CUP-PRINTED-1')
          return Promise.resolve({
            _id: printedItemId,
            sku: 'CUP-PRINTED-1',
            type: ItemType.CUP_PRINTED,
            blankItemId,
          });
        if (sku === 'CUP-PRINTED-2')
          return Promise.resolve({
            _id: printedItemId2,
            sku: 'CUP-PRINTED-2',
            type: ItemType.CUP_PRINTED,
            blankItemId: blankItemId2,
          });
        return Promise.resolve(null);
      });
      stockRepo.findBalanceByItemAndWarehouse.mockResolvedValue({
        onHand: 100,
        reserved: 0,
        expired: 0,
      });
      stockRepo.findSkuById.mockResolvedValue({ sku: 'CUP-BLANK-500' });

      await svc.createFromPrintRequested(orderId, warehouseId.toString(), [
        { sku: 'CUP-PRINTED-1', quantity: 10 },
        { sku: 'CUP-PRINTED-2', quantity: 5 },
      ]);

      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledTimes(2);
    });
  });

  describe('consumeItem', () => {
    const pjId = 'pj1';
    const shelfId = new Types.ObjectId();

    const baseJob = () => ({
      _id: pjId,
      orderId,
      warehouseId,
      items: [
        {
          inputItemId: blankItemId,
          outputItemId: printedItemId,
          sku: 'CUP-PRINTED-1',
          quantity: 10,
          reservedQty: 10,
          remainingQty: 10,
          lineStatus: PrintJobLineStatus.PENDING,
        },
      ],
    });

    it('throw PRINT_JOB_NOT_FOUND khi job không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        svc.consumeItem(
          pjId,
          blankItemId.toString(),
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_NOT_FOUND' });
    });

    it('throw PRINT_JOB_ITEM_NOT_FOUND khi barcode không khớp item nào', async () => {
      repo.findById.mockResolvedValue(baseJob());
      stockRepo.findItemByBarcode.mockResolvedValue(null);
      await expect(
        svc.consumeItem(
          pjId,
          blankItemId.toString(),
          { itemBarcode: 'UNKNOWN', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_ITEM_NOT_FOUND' });
    });

    it('throw PRINT_JOB_SHELF_NOT_FOUND khi shelf không khớp', async () => {
      repo.findById.mockResolvedValue(baseJob());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: blankItemId });
      warehouseRepo.findShelfByCode.mockResolvedValue(null);
      await expect(
        svc.consumeItem(
          pjId,
          blankItemId.toString(),
          { itemBarcode: 'X', shelfCode: 'UNKNOWN', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_SHELF_NOT_FOUND' });
    });

    it('throw PRINT_JOB_ITEM_MISMATCH khi item quét được không thuộc job', async () => {
      repo.findById.mockResolvedValue(baseJob());
      stockRepo.findItemByBarcode.mockResolvedValue({
        _id: new Types.ObjectId(),
      });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      await expect(
        svc.consumeItem(
          pjId,
          blankItemId.toString(),
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_ITEM_MISMATCH' });
    });

    it('throw PRINT_JOB_QTY_EXCEEDS khi quantity > remainingQty', async () => {
      repo.findById.mockResolvedValue(baseJob());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: blankItemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      await expect(
        svc.consumeItem(
          pjId,
          blankItemId.toString(),
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 999 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_QTY_EXCEEDS' });
    });

    it('throw STOCK_INSUFFICIENT khi InventoryStock tại shelf không đủ', async () => {
      repo.findById.mockResolvedValue(baseJob());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: blankItemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 2 });
      await expect(
        svc.consumeItem(
          pjId,
          blankItemId.toString(),
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'STOCK_INSUFFICIENT' });
    });

    it('trừ onHand+reserved của CUP_BLANK, ghi movement PRINT_CONSUME âm, KHÔNG bắn stock.changed', async () => {
      repo.findById.mockResolvedValue(baseJob());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: blankItemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 20 });

      await svc.consumeItem(
        pjId,
        blankItemId.toString(),
        { itemBarcode: 'X', shelfCode: 'A1', quantity: 4 },
        actorId,
      );

      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        blankItemId,
        warehouseId,
        shelfId,
        null,
        -4,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        blankItemId,
        warehouseId,
        -4,
        -4,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: blankItemId,
          warehouseId,
          shelfId,
          type: 'PRINT_CONSUME',
          quantity: -4,
          refType: 'print_job',
        }),
        expect.anything(),
      );
      expect(repo.decrementRemainingQty).toHaveBeenCalledWith(
        pjId,
        blankItemId,
        4,
        expect.anything(),
      );
      expect(stockQueue.add).not.toHaveBeenCalled();
      expect(shipmentQueue.add).not.toHaveBeenCalled();
    });

    it('gọi checkAndEmitStockLow(item._id, job.warehouseId) sau khi commit', async () => {
      repo.findById.mockResolvedValue(baseJob());
      stockRepo.findItemByBarcode.mockResolvedValue({ _id: blankItemId });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      stockRepo.findInventory.mockResolvedValue({ quantity: 20 });

      await svc.consumeItem(
        pjId,
        blankItemId.toString(),
        { itemBarcode: 'X', shelfCode: 'A1', quantity: 4 },
        actorId,
      );

      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledWith(
        blankItemId,
        warehouseId,
      );
    });
  });

  describe('completeItem', () => {
    const pjId = 'pj1';
    const shelfId = new Types.ObjectId();

    const consumedJob = () => ({
      _id: pjId,
      orderId,
      warehouseId,
      items: [
        {
          inputItemId: blankItemId,
          outputItemId: printedItemId,
          sku: 'CUP-PRINTED-1',
          quantity: 10,
          reservedQty: 10,
          remainingQty: 0,
          lineStatus: PrintJobLineStatus.CONSUMED,
        },
      ],
    });

    it('throw PRINT_JOB_NOT_FOUND khi job không tồn tại', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        svc.completeItem(
          pjId,
          blankItemId.toString(),
          { shelfCode: 'A1', quantity: 10 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_NOT_FOUND' });
    });

    it('throw PRINT_JOB_ITEM_MISMATCH khi inputItemId không thuộc job', async () => {
      repo.findById.mockResolvedValue(consumedJob());
      await expect(
        svc.completeItem(
          pjId,
          new Types.ObjectId().toString(),
          { shelfCode: 'A1', quantity: 10 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_ITEM_MISMATCH' });
    });

    it('throw PRINT_JOB_ITEM_NOT_CONSUMED khi dòng còn remainingQty > 0', async () => {
      repo.findById.mockResolvedValue({
        ...consumedJob(),
        items: [{ ...consumedJob().items[0], remainingQty: 3 }],
      });
      await expect(
        svc.completeItem(
          pjId,
          blankItemId.toString(),
          { shelfCode: 'A1', quantity: 10 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_ITEM_NOT_CONSUMED' });
    });

    it('throw PRINT_JOB_ITEM_ALREADY_COMPLETED khi dòng đã COMPLETED từ trước (chặn double-complete)', async () => {
      repo.findById.mockResolvedValue({
        ...consumedJob(),
        items: [
          {
            ...consumedJob().items[0],
            lineStatus: PrintJobLineStatus.COMPLETED,
          },
        ],
      });
      await expect(
        svc.completeItem(
          pjId,
          blankItemId.toString(),
          { shelfCode: 'A1', quantity: 10 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_ITEM_ALREADY_COMPLETED' });
      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
    });

    it('throw PRINT_JOB_SHELF_NOT_FOUND khi shelf không khớp', async () => {
      repo.findById.mockResolvedValue(consumedJob());
      warehouseRepo.findShelfByCode.mockResolvedValue(null);
      await expect(
        svc.completeItem(
          pjId,
          blankItemId.toString(),
          { shelfCode: 'UNKNOWN', quantity: 10 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_SHELF_NOT_FOUND' });
    });

    it('throw PRINT_JOB_QTY_EXCEEDS khi quantity khác reservedQty', async () => {
      repo.findById.mockResolvedValue(consumedJob());
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      await expect(
        svc.completeItem(
          pjId,
          blankItemId.toString(),
          { shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'PRINT_JOB_QTY_EXCEEDS' });
    });

    it('cộng onHand+reserved của CUP_PRINTED, ghi movement PRINT_OUTPUT dương, KHÔNG bắn stock.changed, KHÔNG emit khi còn dòng khác chưa xong', async () => {
      repo.findById.mockResolvedValueOnce(consumedJob()).mockResolvedValueOnce({
        ...consumedJob(),
        status: PrintJobStatus.IN_PROGRESS,
      });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      repo.markLineCompleted.mockResolvedValue({ allDone: false });

      await svc.completeItem(
        pjId,
        blankItemId.toString(),
        { shelfCode: 'A1', quantity: 10 },
        actorId,
      );

      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        printedItemId,
        warehouseId,
        shelfId,
        null,
        10,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        printedItemId,
        warehouseId,
        10,
        10,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: printedItemId,
          warehouseId,
          shelfId,
          type: 'PRINT_OUTPUT',
          quantity: 10,
          refType: 'print_job',
        }),
        expect.anything(),
      );
      expect(repo.markJobCompleted).not.toHaveBeenCalled();
      expect(stockQueue.add).not.toHaveBeenCalled();
      expect(shipmentQueue.add).not.toHaveBeenCalled();
    });

    it('emit print.completed đúng 1 lần khi markLineCompleted trả allDone=true', async () => {
      repo.findById.mockResolvedValueOnce(consumedJob()).mockResolvedValueOnce({
        ...consumedJob(),
        status: PrintJobStatus.COMPLETED,
      });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      repo.markLineCompleted.mockResolvedValue({ allDone: true });

      await svc.completeItem(
        pjId,
        blankItemId.toString(),
        { shelfCode: 'A1', quantity: 10 },
        actorId,
      );

      expect(repo.markJobCompleted).toHaveBeenCalledWith(
        pjId,
        expect.any(Types.ObjectId),
        expect.anything(),
      );
      expect(shipmentQueue.add).toHaveBeenCalledTimes(1);
      expect(shipmentQueue.add).toHaveBeenCalledWith(
        'print.completed',
        { orderId, printJobId: pjId },
        { jobId: `print_job:${pjId}` },
      );
    });

    it('gọi checkAndEmitStockLow(line.outputItemId, job.warehouseId) sau khi commit', async () => {
      repo.findById.mockResolvedValueOnce(consumedJob()).mockResolvedValueOnce({
        ...consumedJob(),
        status: PrintJobStatus.IN_PROGRESS,
      });
      warehouseRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
        warehouseId,
      });
      repo.markLineCompleted.mockResolvedValue({ allDone: false });

      await svc.completeItem(
        pjId,
        blankItemId.toString(),
        { shelfCode: 'A1', quantity: 10 },
        actorId,
      );

      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledWith(
        printedItemId,
        warehouseId,
      );
    });
  });

  describe('listPrintJobs', () => {
    it('ủy quyền cho repo.findAll', async () => {
      repo.findAll.mockResolvedValue({ data: [], total: 0 });
      const result = await svc.listPrintJobs({});
      expect(repo.findAll).toHaveBeenCalledWith({});
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  describe('getPrintJob', () => {
    it('throw PRINT_JOB_NOT_FOUND khi không tìm thấy', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.getPrintJob('pj1')).rejects.toMatchObject({
        code: 'PRINT_JOB_NOT_FOUND',
      });
    });

    it('trả về document khi tìm thấy', async () => {
      const doc = { _id: 'pj1' };
      repo.findById.mockResolvedValue(doc);
      const result = await svc.getPrintJob('pj1');
      expect(result).toBe(doc);
    });
  });
});
