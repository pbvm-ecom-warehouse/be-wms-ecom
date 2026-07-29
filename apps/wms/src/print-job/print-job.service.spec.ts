import { Types } from 'mongoose';
import { createHash } from 'node:crypto';
import { PrintStage } from '@app/events';
import { PrintJobService } from './print-job.service';
import { PrintJobStatus, PrintJobLineStatus } from './schemas/print-job.schema';
import { ItemType } from '../stock/schemas/warehouse-item.schema';

const makeRepo = () => ({
  findByOrderAndStage: jest.fn(),
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
  findItemByIdDocument: jest.fn(),
  findBalance: jest.fn(),
  reserveIfAvailable: jest.fn(),
  upsertBalance: jest.fn(),
  findInventory: jest.fn(),
  upsertInventory: jest.fn(),
  insertMovement: jest.fn(),
  createItem: jest.fn(),
  findSkuById: jest.fn(),
});

const makeLocationRepo = () => ({
  findShelfByCode: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeBarcodeService = () => ({
  findItemIdByCode: jest.fn(),
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
const makeDocumentNumberService = () => ({
  next: jest.fn().mockResolvedValue('PRN-20260730-0001'),
});

const printedSkuFor = (blankSku: string, identity: string) =>
  `${blankSku}-DSG${createHash('sha256')
    .update(identity)
    .digest('hex')
    .slice(0, 24)
    .toUpperCase()}`;

describe('PrintJobService', () => {
  let svc: PrintJobService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let locationRepo: ReturnType<typeof makeLocationRepo>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let stockService: ReturnType<typeof makeStockService>;
  let barcodeSvc: ReturnType<typeof makeBarcodeService>;
  let stockQueue: ReturnType<typeof makeStockQueue>;
  let shipmentQueue: ReturnType<typeof makeShipmentQueue>;
  let documentNumber: ReturnType<typeof makeDocumentNumberService>;

  const actorId = new Types.ObjectId().toString();
  const orderId = 'order-1';
  const blankItemId = new Types.ObjectId();
  const printedItemId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    locationRepo = makeLocationRepo();
    txHelper = makeTxHelper();
    stockService = makeStockService();
    barcodeSvc = makeBarcodeService();
    stockQueue = makeStockQueue();
    shipmentQueue = makeShipmentQueue();
    documentNumber = makeDocumentNumberService();
    stockRepo.reserveIfAvailable.mockResolvedValue(true);
    svc = new PrintJobService(
      repo as never,
      stockRepo as never,
      stockService as never,
      locationRepo,
      txHelper as never,
      barcodeSvc as never,
      documentNumber as never,
      stockQueue as never,
      shipmentQueue as never,
    );
  });

  describe('createFromPrintRequested', () => {
    const canonicalRequest = (overrides: Record<string, unknown> = {}) => ({
      orderId,
      orderCode: 'ORD-20260730-0001',
      stage: PrintStage.PRODUCTION,
      items: [
        {
          orderItemId: 'order-item-1',
          blankSku: 'CUP-HRT-PET-500-CLR',
          quantity: 10,
          designFile: 'https://cdn.example/design-042.png',
          designId: '042',
        },
      ],
      ...overrides,
    });

    const mockBlankAndNewOutput = () => {
      stockRepo.findItemBySku.mockImplementation((sku: string) => {
        if (sku === 'CUP-HRT-PET-500-CLR') {
          return Promise.resolve({
            _id: blankItemId,
            sku,
            type: ItemType.CUP_BLANK,
          });
        }
        return Promise.resolve(null);
      });
      stockRepo.createItem.mockResolvedValue({
        _id: printedItemId,
        sku: printedSkuFor('CUP-HRT-PET-500-CLR', '042'),
      });
      stockRepo.findBalance.mockResolvedValue({
        onHand: 100,
        reserved: 20,
        expired: 0,
      });
      stockRepo.findSkuById.mockResolvedValue({
        sku: 'CUP-HRT-PET-500-CLR',
      });
    };

    it('bỏ qua đúng khóa orderId + stage khi event được giao lại', async () => {
      repo.findByOrderAndStage.mockResolvedValue({ _id: 'pj1' });

      await svc.createFromPrintRequested(canonicalRequest());

      expect(repo.findByOrderAndStage).toHaveBeenCalledWith(
        orderId,
        PrintStage.PRODUCTION,
      );
      expect(repo.createPrintJob).not.toHaveBeenCalled();
    });

    it('event giao lại cho job đã lưu sẽ đối soát stock.changed từng bị lỗi sau commit', async () => {
      repo.findByOrderAndStage.mockResolvedValue({
        _id: 'pj1',
        orderId,
        stage: PrintStage.PRODUCTION,
        items: [
          {
            inputItemId: blankItemId,
            reservedQty: 5,
          },
        ],
      });
      stockRepo.findSkuById.mockResolvedValue({
        sku: 'CUP-HRT-PET-500-CLR',
      });

      await svc.createFromPrintRequested(canonicalRequest());

      expect(repo.createPrintJob).not.toHaveBeenCalled();
      expect(stockQueue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: 'CUP-HRT-PET-500-CLR', delta: -5 },
        {
          jobId: 'print-job-reserve-order-1-PRODUCTION-CUP-HRT-PET-500-CLR',
        },
      );
      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledWith(
        blankItemId,
      );
    });

    it('không xem SAMPLE và PRODUCTION của cùng orderId là cùng một job', async () => {
      repo.findByOrderAndStage.mockResolvedValue(null);
      mockBlankAndNewOutput();

      await svc.createFromPrintRequested(
        canonicalRequest({ stage: PrintStage.SAMPLE }),
      );

      expect(repo.findByOrderAndStage).toHaveBeenCalledWith(
        orderId,
        PrintStage.SAMPLE,
      );
      expect(repo.createPrintJob).toHaveBeenCalled();
    });

    it('tự sinh output SKU từ blankSku + designId và lưu orderItemId', async () => {
      repo.findByOrderAndStage.mockResolvedValue(null);
      mockBlankAndNewOutput();

      await svc.createFromPrintRequested(canonicalRequest());

      expect(stockRepo.findItemBySku).toHaveBeenCalledWith(
        printedSkuFor('CUP-HRT-PET-500-CLR', '042'),
      );
      expect(stockRepo.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          sku: printedSkuFor('CUP-HRT-PET-500-CLR', '042'),
          type: ItemType.CUP_PRINTED,
          blankItemId,
        }),
        expect.any(Types.ObjectId),
        expect.anything(),
      );
      expect(repo.createPrintJob).toHaveBeenCalledWith(
        orderId,
        PrintStage.PRODUCTION,
        [
          expect.objectContaining({
            orderItemId: 'order-item-1',
            inputItemId: blankItemId,
            outputItemId: printedItemId,
            sku: printedSkuFor('CUP-HRT-PET-500-CLR', '042'),
            designFile: 'https://cdn.example/design-042.png',
            quantity: 10,
            reservedQty: 10,
          }),
        ],
        expect.anything(),
        'PRN-20260730-0001',
        'ORD-20260730-0001',
        undefined,
      );
      expect(documentNumber.next).toHaveBeenCalledWith('PRN');
    });

    it('fallback sang orderItemId và tạo cùng output SKU cho SAMPLE/PRODUCTION của cùng dòng', async () => {
      repo.findByOrderAndStage.mockResolvedValue(null);
      stockRepo.findItemBySku.mockImplementation((sku: string) => {
        if (sku === 'CUP-HRT-PET-500-CLR') {
          return Promise.resolve({
            _id: blankItemId,
            sku,
            type: ItemType.CUP_BLANK,
          });
        }
        if (sku === printedSkuFor('CUP-HRT-PET-500-CLR', 'order-item-1')) {
          return Promise.resolve({
            _id: printedItemId,
            sku,
            type: ItemType.CUP_PRINTED,
            blankItemId,
          });
        }
        return Promise.resolve(null);
      });
      stockRepo.findBalance.mockResolvedValue({
        onHand: 100,
        reserved: 0,
        expired: 0,
      });

      const itemWithoutDesignId = {
        orderItemId: 'order-item-1',
        blankSku: 'CUP-HRT-PET-500-CLR',
        quantity: 1,
        designFile: 'https://cdn.example/design.png',
      };
      await svc.createFromPrintRequested(
        canonicalRequest({
          stage: PrintStage.SAMPLE,
          items: [itemWithoutDesignId],
        }),
      );

      expect(repo.createPrintJob).toHaveBeenCalledWith(
        orderId,
        PrintStage.SAMPLE,
        [
          expect.objectContaining({
            orderItemId: 'order-item-1',
            sku: printedSkuFor('CUP-HRT-PET-500-CLR', 'order-item-1'),
          }),
        ],
        expect.anything(),
        'PRN-20260730-0001',
        'ORD-20260730-0001',
        undefined,
      );
    });

    it('không làm mất thông tin identity khiến hai design khác nhau trùng output SKU', async () => {
      repo.findByOrderAndStage.mockResolvedValue(null);
      stockRepo.findItemBySku.mockImplementation((sku: string) => {
        if (sku === 'CUP-HRT-PET-500-CLR') {
          return Promise.resolve({
            _id: blankItemId,
            sku,
            type: ItemType.CUP_BLANK,
          });
        }
        return Promise.resolve(null);
      });
      stockRepo.findBalance.mockResolvedValue({
        onHand: 100,
        reserved: 0,
        expired: 0,
      });
      stockRepo.createItem
        .mockResolvedValueOnce({ _id: new Types.ObjectId() })
        .mockResolvedValueOnce({ _id: new Types.ObjectId() });

      await svc.createFromPrintRequested(
        canonicalRequest({
          items: [
            {
              orderItemId: 'order-item-1',
              blankSku: 'CUP-HRT-PET-500-CLR',
              quantity: 1,
              designFile: 'one.png',
              designId: 'A-B',
            },
            {
              orderItemId: 'order-item-2',
              blankSku: 'CUP-HRT-PET-500-CLR',
              quantity: 1,
              designFile: 'two.png',
              designId: 'A_B',
            },
          ],
        }),
      );

      const persistedLines = repo.createPrintJob.mock.calls[0][2] as {
        sku: string;
      }[];
      expect(persistedLines.map((line) => line.sku)).toEqual([
        printedSkuFor('CUP-HRT-PET-500-CLR', 'A-B'),
        printedSkuFor('CUP-HRT-PET-500-CLR', 'A_B'),
      ]);
      expect(new Set(persistedLines.map((line) => line.sku)).size).toBe(2);
    });

    it.each([
      ['orderId', canonicalRequest({ orderId: '' })],
      ['stage', canonicalRequest({ stage: 'UNKNOWN' })],
      ['items', canonicalRequest({ items: [] })],
      [
        'orderItemId',
        canonicalRequest({
          items: [
            {
              blankSku: 'CUP-HRT-PET-500-CLR',
              quantity: 1,
              designFile: 'd.png',
            },
          ],
        }),
      ],
      [
        'blankSku',
        canonicalRequest({
          items: [
            {
              orderItemId: 'order-item-1',
              blankSku: '',
              quantity: 1,
              designFile: 'd.png',
            },
          ],
        }),
      ],
      [
        'quantity',
        canonicalRequest({
          items: [
            {
              orderItemId: 'order-item-1',
              blankSku: 'CUP-HRT-PET-500-CLR',
              quantity: 0,
              designFile: 'd.png',
            },
          ],
        }),
      ],
      [
        'designFile',
        canonicalRequest({
          items: [
            {
              orderItemId: 'order-item-1',
              blankSku: 'CUP-HRT-PET-500-CLR',
              quantity: 1,
              designFile: '',
            },
          ],
        }),
      ],
    ])('reject malformed %s trước mọi mutation', async (_field, payload) => {
      await expect(
        svc.createFromPrintRequested(payload as never),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      expect(repo.createPrintJob).not.toHaveBeenCalled();
      expect(stockRepo.createItem).not.toHaveBeenCalled();
      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
    });

    it('reject segment không an toàn thay vì ghép thẳng vào output SKU', async () => {
      await expect(
        svc.createFromPrintRequested(
          canonicalRequest({
            items: [
              {
                orderItemId: 'order/item/1',
                blankSku: 'CUP-HRT-PET-500-CLR',
                quantity: 1,
                designFile: 'd.png',
              },
            ],
          }) as never,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(stockRepo.findItemBySku).not.toHaveBeenCalled();
    });

    it('reject toàn request nếu một blank master không tồn tại, không silent skip dòng', async () => {
      repo.findByOrderAndStage.mockResolvedValue(null);
      stockRepo.findItemBySku.mockResolvedValue(null);

      await expect(
        svc.createFromPrintRequested(canonicalRequest() as never),
      ).rejects.toThrow('CUP_BLANK');

      expect(repo.createPrintJob).not.toHaveBeenCalled();
      expect(stockRepo.createItem).not.toHaveBeenCalled();
      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
    });

    it('preflight mọi dòng: dòng sau thiếu master thì dòng output mới trước đó cũng chưa được tạo', async () => {
      repo.findByOrderAndStage.mockResolvedValue(null);
      stockRepo.findItemBySku.mockImplementation((sku: string) => {
        if (sku === 'CUP-HRT-PET-500-CLR') {
          return Promise.resolve({
            _id: blankItemId,
            sku,
            type: ItemType.CUP_BLANK,
          });
        }
        return Promise.resolve(null);
      });
      stockRepo.findBalance.mockResolvedValue({
        onHand: 100,
        reserved: 0,
        expired: 0,
      });

      await expect(
        svc.createFromPrintRequested(
          canonicalRequest({
            items: [
              {
                orderItemId: 'order-item-1',
                blankSku: 'CUP-HRT-PET-500-CLR',
                quantity: 1,
                designFile: 'one.png',
                designId: '001',
              },
              {
                orderItemId: 'order-item-2',
                blankSku: 'CUP-MISSING',
                quantity: 1,
                designFile: 'two.png',
                designId: '002',
              },
            ],
          }) as never,
        ),
      ).rejects.toThrow('CUP_BLANK');

      expect(stockRepo.createItem).not.toHaveBeenCalled();
      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
      expect(repo.createPrintJob).not.toHaveBeenCalled();
    });

    it('reject toàn request nếu output SKU đã tồn tại nhưng sai type', async () => {
      repo.findByOrderAndStage.mockResolvedValue(null);
      stockRepo.findItemBySku.mockImplementation((sku: string) => {
        if (sku === 'CUP-HRT-PET-500-CLR') {
          return Promise.resolve({
            _id: blankItemId,
            sku,
            type: ItemType.CUP_BLANK,
          });
        }
        return Promise.resolve({
          _id: printedItemId,
          sku,
          type: ItemType.MATERIAL,
        });
      });

      await expect(
        svc.createFromPrintRequested(canonicalRequest() as never),
      ).rejects.toThrow('CUP_PRINTED');

      expect(repo.createPrintJob).not.toHaveBeenCalled();
      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
    });

    it('không tạo PrintJob nửa vời khi không đủ toàn bộ CUP_BLANK', async () => {
      repo.findByOrderAndStage.mockResolvedValue(null);
      mockBlankAndNewOutput();
      stockRepo.reserveIfAvailable.mockResolvedValue(false);

      await expect(
        svc.createFromPrintRequested(canonicalRequest()),
      ).rejects.toMatchObject({ code: 'STOCK_INSUFFICIENT' });

      expect(repo.createPrintJob).not.toHaveBeenCalled();
      expect(stockRepo.createItem).not.toHaveBeenCalled();
      expect(stockQueue.add).not.toHaveBeenCalled();
    });

    it('không cộng lặp line/delta khi Mongo retry callback transaction', async () => {
      repo.findByOrderAndStage.mockResolvedValue(null);
      mockBlankAndNewOutput();
      txHelper.withStockTransaction.mockImplementation(
        async (fn: (session: unknown) => Promise<unknown>) => {
          await fn({ attempt: 1 });
          return fn({ attempt: 2 });
        },
      );

      await svc.createFromPrintRequested(canonicalRequest());

      expect(repo.createPrintJob).toHaveBeenLastCalledWith(
        orderId,
        PrintStage.PRODUCTION,
        [expect.objectContaining({ orderItemId: 'order-item-1' })],
        { attempt: 2 },
        'PRN-20260730-0001',
        'ORD-20260730-0001',
        undefined,
      );
      expect(stockQueue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: 'CUP-HRT-PET-500-CLR', delta: -10 },
        expect.anything(),
      );
    });
  });

  describe('consumeItem', () => {
    const pjId = 'pj1';
    const shelfId = new Types.ObjectId();

    const baseJob = () => ({
      _id: pjId,
      orderId,
      stage: PrintStage.PRODUCTION,
      items: [
        {
          orderItemId: 'order-item-1',
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

    it('reject job legacy thiếu orderItemId trước khi consume tồn', async () => {
      repo.findById.mockResolvedValue({
        ...baseJob(),
        items: [
          {
            ...baseJob().items[0],
            orderItemId: undefined,
          },
        ],
      });

      await expect(
        svc.consumeItem(
          pjId,
          blankItemId.toString(),
          { itemBarcode: 'X', shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      expect(barcodeSvc.findItemIdByCode).not.toHaveBeenCalled();
      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
    });

    it('throw PRINT_JOB_ITEM_NOT_FOUND khi barcode không khớp item nào', async () => {
      repo.findById.mockResolvedValue(baseJob());
      barcodeSvc.findItemIdByCode.mockResolvedValue(null);
      stockRepo.findItemByIdDocument.mockResolvedValue(null);
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
      barcodeSvc.findItemIdByCode.mockResolvedValue(blankItemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: blankItemId });
      locationRepo.findShelfByCode.mockResolvedValue(null);
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
      const mismatchedItemId = new Types.ObjectId();
      barcodeSvc.findItemIdByCode.mockResolvedValue(mismatchedItemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({
        _id: mismatchedItemId,
      });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
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
      barcodeSvc.findItemIdByCode.mockResolvedValue(blankItemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: blankItemId });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
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
      barcodeSvc.findItemIdByCode.mockResolvedValue(blankItemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: blankItemId });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
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
      barcodeSvc.findItemIdByCode.mockResolvedValue(blankItemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: blankItemId });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
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
        shelfId,
        null,
        -4,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        blankItemId,
        -4,
        -4,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: blankItemId,
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

    it('gọi checkAndEmitStockLow(item._id) sau khi commit', async () => {
      repo.findById.mockResolvedValue(baseJob());
      barcodeSvc.findItemIdByCode.mockResolvedValue(blankItemId);
      stockRepo.findItemByIdDocument.mockResolvedValue({ _id: blankItemId });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
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
      );
    });
  });

  describe('completeItem', () => {
    const pjId = 'pj1';
    const shelfId = new Types.ObjectId();

    const consumedJob = () => ({
      _id: pjId,
      orderId,
      stage: PrintStage.PRODUCTION,
      items: [
        {
          orderItemId: 'order-item-1',
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

    it('job đã COMPLETED sẽ phát lại print.completed nếu lần enqueue trước lỗi sau commit', async () => {
      repo.findById.mockResolvedValue({
        ...consumedJob(),
        status: PrintJobStatus.COMPLETED,
        items: [
          {
            ...consumedJob().items[0],
            lineStatus: PrintJobLineStatus.COMPLETED,
          },
        ],
      });

      await svc.completeItem(
        pjId,
        blankItemId.toString(),
        { shelfCode: 'A1', quantity: 10 },
        actorId,
      );

      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
      expect(repo.markLineCompleted).not.toHaveBeenCalled();
      expect(shipmentQueue.add).toHaveBeenCalledWith(
        'print.completed',
        expect.objectContaining({
          orderId,
          printJobId: pjId,
          stage: PrintStage.PRODUCTION,
        }),
        { jobId: `print-job-${pjId}` },
      );
    });

    it('throw PRINT_JOB_SHELF_NOT_FOUND khi shelf không khớp', async () => {
      repo.findById.mockResolvedValue(consumedJob());
      locationRepo.findShelfByCode.mockResolvedValue(null);
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
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
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

    it('reject job legacy thiếu orderItemId trước khi ghi output hoặc mark complete', async () => {
      repo.findById.mockResolvedValue({
        ...consumedJob(),
        items: [
          {
            ...consumedJob().items[0],
            orderItemId: undefined,
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
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
      expect(repo.markLineCompleted).not.toHaveBeenCalled();
      expect(shipmentQueue.add).not.toHaveBeenCalled();
    });

    it('SAMPLE hoàn tất bắt buộc proofImage trước mọi mutation', async () => {
      repo.findById.mockResolvedValue({
        ...consumedJob(),
        stage: PrintStage.SAMPLE,
      });

      await expect(
        svc.completeItem(
          pjId,
          blankItemId.toString(),
          { shelfCode: 'A1', quantity: 10 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
      expect(repo.markLineCompleted).not.toHaveBeenCalled();
      expect(shipmentQueue.add).not.toHaveBeenCalled();
    });

    it('cộng onHand+reserved của CUP_PRINTED, ghi movement PRINT_OUTPUT dương, KHÔNG bắn stock.changed, KHÔNG emit khi còn dòng khác chưa xong', async () => {
      repo.findById.mockResolvedValueOnce(consumedJob()).mockResolvedValueOnce({
        ...consumedJob(),
        status: PrintJobStatus.IN_PROGRESS,
      });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
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
        shelfId,
        null,
        10,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        printedItemId,
        10,
        10,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: printedItemId,
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

    it('SAMPLE nhập mẫu vật lý nhưng không reserve thành phẩm giao hàng', async () => {
      const sampleJob = {
        ...consumedJob(),
        stage: PrintStage.SAMPLE,
      };
      repo.findById.mockResolvedValueOnce(sampleJob).mockResolvedValueOnce({
        ...sampleJob,
        status: PrintJobStatus.COMPLETED,
      });
      locationRepo.findShelfByCode.mockResolvedValue({ _id: shelfId });
      repo.markLineCompleted.mockResolvedValue({ allDone: true });

      await svc.completeItem(
        pjId,
        blankItemId.toString(),
        {
          shelfCode: 'A1',
          quantity: 10,
          proofImage: 'https://cdn.example.com/proof.png',
        },
        actorId,
      );

      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        printedItemId,
        shelfId,
        null,
        10,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        printedItemId,
        10,
        0,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PRINT_OUTPUT',
          quantity: 10,
        }),
        expect.anything(),
      );
      expect(shipmentQueue.add).toHaveBeenCalledWith(
        'print.completed',
        expect.objectContaining({
          stage: PrintStage.SAMPLE,
          proofImage: 'https://cdn.example.com/proof.png',
        }),
        { jobId: `print-job-${pjId}` },
      );
    });

    it('emit print.completed đúng 1 lần khi markLineCompleted trả allDone=true', async () => {
      repo.findById.mockResolvedValueOnce(consumedJob()).mockResolvedValueOnce({
        ...consumedJob(),
        status: PrintJobStatus.COMPLETED,
      });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
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
        {
          orderId,
          printJobId: pjId,
          stage: PrintStage.PRODUCTION,
          items: [
            {
              orderItemId: 'order-item-1',
              printedSku: 'CUP-PRINTED-1',
              quantity: 10,
            },
          ],
        },
        { jobId: `print-job-${pjId}` },
      );
    });

    it('reject job legacy reserve partial trước mọi output mutation', async () => {
      const partialJob = {
        ...consumedJob(),
        items: [
          {
            ...consumedJob().items[0],
            quantity: 10,
            reservedQty: 5,
          },
        ],
      };
      repo.findById.mockResolvedValueOnce(partialJob);

      await expect(
        svc.completeItem(
          pjId,
          blankItemId.toString(),
          { shelfCode: 'A1', quantity: 5 },
          actorId,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
      expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
      expect(shipmentQueue.add).not.toHaveBeenCalled();
    });

    it('gọi checkAndEmitStockLow(line.outputItemId) sau khi commit', async () => {
      repo.findById.mockResolvedValueOnce(consumedJob()).mockResolvedValueOnce({
        ...consumedJob(),
        status: PrintJobStatus.IN_PROGRESS,
      });
      locationRepo.findShelfByCode.mockResolvedValue({
        _id: shelfId,
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
