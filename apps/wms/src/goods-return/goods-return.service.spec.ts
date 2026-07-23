import { Types } from 'mongoose';
import { GoodsReturnService } from './goods-return.service';
import {
  GoodsReturnItemCondition,
  GoodsReturnStatus,
} from './schemas/goods-return.schema';

const makeRepo = () => ({
  findById: jest.fn(),
  findByOrderId: jest.fn(),
  createGoodsReturn: jest.fn(),
  findAll: jest.fn(),
  setInspected: jest.fn(),
  setRestocked: jest.fn(),
  setCancelled: jest.fn(),
});

const makeStockRepo = () => ({
  findItemById: jest.fn(),
  findItemBySku: jest.fn(),
  upsertInventory: jest.fn(),
  upsertBalance: jest.fn(),
  insertMovement: jest.fn(),
});

const makeWarehouseRepo = () => ({
  findWarehouseById: jest.fn(),
  findShelfById: jest.fn(),
});

const makeScrapNoteService = () => ({
  createApprovedScrapNoteForReturn: jest.fn(),
});

const makeStockService = () => ({
  checkAndEmitStockLow: jest.fn(),
});

const makeTxHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makeStockQueue = () => ({ add: jest.fn() });

const makeCloudinaryService = () => ({
  uploadImage: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/demo/image/upload/wms/goods-return/x.jpg',
    publicId: 'wms/goods-return/x',
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

describe('GoodsReturnService', () => {
  let svc: GoodsReturnService;
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let warehouseRepo: ReturnType<typeof makeWarehouseRepo>;
  let scrapNoteService: ReturnType<typeof makeScrapNoteService>;
  let stockService: ReturnType<typeof makeStockService>;
  let txHelper: ReturnType<typeof makeTxHelper>;
  let stockQueue: ReturnType<typeof makeStockQueue>;
  let cloudinary: ReturnType<typeof makeCloudinaryService>;

  const actorId = new Types.ObjectId().toString();
  const warehouseId = new Types.ObjectId();
  const itemId = new Types.ObjectId();
  const shelfId = new Types.ObjectId();
  const lotId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    warehouseRepo = makeWarehouseRepo();
    scrapNoteService = makeScrapNoteService();
    stockService = makeStockService();
    txHelper = makeTxHelper();
    stockQueue = makeStockQueue();
    cloudinary = makeCloudinaryService();
    svc = new GoodsReturnService(
      repo as never,
      stockRepo as never,
      stockService as never,
      warehouseRepo as never,
      scrapNoteService as never,
      txHelper as never,
      stockQueue as never,
      cloudinary as never,
    );
  });

  describe('createFromOrderReturned', () => {
    it('idempotent: đã có phiếu cho orderId → bỏ qua, không tạo trùng', async () => {
      repo.findByOrderId.mockResolvedValue({ _id: 'gr-existing' });

      await svc.createFromOrderReturned('order-1', [
        { sku: 'SKU-1', quantity: 2 },
      ]);

      expect(repo.createGoodsReturn).not.toHaveBeenCalled();
    });

    it('sku không khớp WarehouseItem nào → bỏ qua dòng đó, không throw', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      stockRepo.findItemBySku.mockResolvedValue(null);

      await svc.createFromOrderReturned('order-1', [
        { sku: 'SKU-X', quantity: 2 },
      ]);

      expect(repo.createGoodsReturn).not.toHaveBeenCalled();
    });

    it('tạo GoodsReturn DRAFT với các dòng resolve được sku→itemId', async () => {
      repo.findByOrderId.mockResolvedValue(null);
      stockRepo.findItemBySku.mockResolvedValue({ _id: itemId, sku: 'SKU-1' });

      await svc.createFromOrderReturned('order-1', [
        { sku: 'SKU-1', quantity: 2 },
      ]);

      expect(repo.createGoodsReturn).toHaveBeenCalledWith(
        'order-1',
        null,
        undefined,
        [{ itemId, sku: 'SKU-1', quantity: 2 }],
      );
    });
  });

  describe('createGoodsReturn (tạo tay)', () => {
    it('item không tồn tại → throw STOCK_ITEM_NOT_FOUND', async () => {
      stockRepo.findItemById.mockResolvedValue(null);

      await expect(
        svc.createGoodsReturn(
          { items: [{ itemId: itemId.toString(), quantity: 2 }] },
          actorId,
        ),
      ).rejects.toThrow();
      expect(repo.createGoodsReturn).not.toHaveBeenCalled();
    });

    it('tạo phiếu hợp lệ với createdBy=actorId', async () => {
      stockRepo.findItemById.mockResolvedValue({ _id: itemId, sku: 'SKU-1' });
      repo.createGoodsReturn.mockResolvedValue({ _id: 'gr1' });

      await svc.createGoodsReturn(
        {
          orderId: 'order-1',
          note: 'Ghi chú',
          items: [{ itemId: itemId.toString(), quantity: 3 }],
        },
        actorId,
      );

      expect(repo.createGoodsReturn).toHaveBeenCalledWith(
        'order-1',
        new Types.ObjectId(actorId),
        'Ghi chú',
        [{ itemId, sku: 'SKU-1', quantity: 3 }],
      );
    });
  });

  describe('inspectGoodsReturn', () => {
    it('phiếu không tồn tại → throw GOODS_RETURN_NOT_FOUND', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        svc.inspectGoodsReturn(
          'gr1',
          { warehouseId: warehouseId.toString(), items: [] },
          actorId,
        ),
      ).rejects.toThrow();
    });

    it('phiếu không phải DRAFT → throw GOODS_RETURN_ALREADY_DECIDED', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.RESTOCKED,
        items: [],
      });
      await expect(
        svc.inspectGoodsReturn(
          'gr1',
          { warehouseId: warehouseId.toString(), items: [] },
          actorId,
        ),
      ).rejects.toThrow();
    });

    it('warehouseId không tồn tại → throw WAREHOUSE_NOT_FOUND', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', quantity: 2 }],
      });
      warehouseRepo.findWarehouseById.mockResolvedValue(null);

      await expect(
        svc.inspectGoodsReturn(
          'gr1',
          {
            warehouseId: warehouseId.toString(),
            items: [
              {
                itemId: itemId.toString(),
                condition: GoodsReturnItemCondition.GOOD,
                shelfId: shelfId.toString(),
              },
            ],
          },
          actorId,
        ),
      ).rejects.toThrow();
    });

    it('dòng thiếu trong dto.items so với phiếu → throw GOODS_RETURN_ITEM_NOT_FOUND', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', quantity: 2 }],
      });
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });

      await expect(
        svc.inspectGoodsReturn(
          'gr1',
          { warehouseId: warehouseId.toString(), items: [] },
          actorId,
        ),
      ).rejects.toThrow();
    });

    it('shelf không tồn tại → throw SHELF_NOT_FOUND', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', quantity: 2 }],
      });
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue(null);
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });

      await expect(
        svc.inspectGoodsReturn(
          'gr1',
          {
            warehouseId: warehouseId.toString(),
            items: [
              {
                itemId: itemId.toString(),
                condition: GoodsReturnItemCondition.GOOD,
                shelfId: shelfId.toString(),
              },
            ],
          },
          actorId,
        ),
      ).rejects.toThrow();
    });

    it('item isPerishable, condition=GOOD, thiếu lotId → throw GOODS_RETURN_ITEM_ISPERISHABLE_NO_LOT', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', quantity: 2 }],
      });
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: true,
      });

      await expect(
        svc.inspectGoodsReturn(
          'gr1',
          {
            warehouseId: warehouseId.toString(),
            items: [
              {
                itemId: itemId.toString(),
                condition: GoodsReturnItemCondition.GOOD,
                shelfId: shelfId.toString(),
              },
            ],
          },
          actorId,
        ),
      ).rejects.toThrow();
      expect(repo.setInspected).not.toHaveBeenCalled();
    });

    it('item isPerishable, condition=DAMAGED, thiếu lotId → KHÔNG throw', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', quantity: 2 }],
      });
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: true,
      });

      await svc.inspectGoodsReturn(
        'gr1',
        {
          warehouseId: warehouseId.toString(),
          items: [
            {
              itemId: itemId.toString(),
              condition: GoodsReturnItemCondition.DAMAGED,
              shelfId: shelfId.toString(),
            },
          ],
        },
        actorId,
      );

      expect(repo.setInspected).toHaveBeenCalled();
    });

    it('inspect hợp lệ → gọi setInspected với đúng tham số, status INSPECTED', async () => {
      const updated = { _id: 'gr1', status: GoodsReturnStatus.INSPECTED };
      repo.findById
        .mockResolvedValueOnce({
          _id: 'gr1',
          status: GoodsReturnStatus.DRAFT,
          items: [{ itemId, sku: 'SKU-1', quantity: 2 }],
        })
        .mockResolvedValueOnce(updated);
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: true,
      });

      const result = await svc.inspectGoodsReturn(
        'gr1',
        {
          warehouseId: warehouseId.toString(),
          items: [
            {
              itemId: itemId.toString(),
              condition: GoodsReturnItemCondition.GOOD,
              shelfId: shelfId.toString(),
              lotId: lotId.toString(),
            },
          ],
        },
        actorId,
      );

      expect(repo.setInspected).toHaveBeenCalledWith(
        'gr1',
        warehouseId,
        new Types.ObjectId(actorId),
        [
          {
            itemId,
            condition: GoodsReturnItemCondition.GOOD,
            shelfId,
            lotId,
            images: [],
          },
        ],
      );
      expect(result).toBe(updated);
    });

    it('không có imagesByItemId → images rỗng, không gọi CloudinaryService', async () => {
      repo.findById
        .mockResolvedValueOnce({
          _id: 'gr1',
          status: GoodsReturnStatus.DRAFT,
          items: [{ itemId, sku: 'SKU-1', quantity: 2 }],
        })
        .mockResolvedValueOnce({ _id: 'gr1' });
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });

      await svc.inspectGoodsReturn(
        'gr1',
        {
          warehouseId: warehouseId.toString(),
          items: [
            {
              itemId: itemId.toString(),
              condition: GoodsReturnItemCondition.DAMAGED,
              shelfId: shelfId.toString(),
            },
          ],
        },
        actorId,
      );

      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
      expect(repo.setInspected).toHaveBeenCalledWith(
        'gr1',
        warehouseId,
        new Types.ObjectId(actorId),
        [expect.objectContaining({ images: [] })],
      );
    });

    it('có ảnh minh chứng cho dòng DAMAGED → upload Cloudinary vào wms/goods-return, lưu URL đúng dòng', async () => {
      repo.findById
        .mockResolvedValueOnce({
          _id: 'gr1',
          status: GoodsReturnStatus.DRAFT,
          items: [{ itemId, sku: 'SKU-1', quantity: 2 }],
        })
        .mockResolvedValueOnce({ _id: 'gr1' });
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });

      const imagesByItemId = new Map([[itemId.toString(), [fakeImageFile()]]]);

      await svc.inspectGoodsReturn(
        'gr1',
        {
          warehouseId: warehouseId.toString(),
          items: [
            {
              itemId: itemId.toString(),
              condition: GoodsReturnItemCondition.DAMAGED,
              shelfId: shelfId.toString(),
            },
          ],
        },
        actorId,
        imagesByItemId,
      );

      expect(cloudinary.uploadImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        'wms/goods-return',
      );
      expect(repo.setInspected).toHaveBeenCalledWith(
        'gr1',
        warehouseId,
        new Types.ObjectId(actorId),
        [
          expect.objectContaining({
            images: [
              'https://res.cloudinary.com/demo/image/upload/wms/goods-return/x.jpg',
            ],
          }),
        ],
      );
    });

    it('ảnh minh chứng sai mimetype → throw VALIDATION_FAILED, không gọi setInspected', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', quantity: 2 }],
      });
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });

      const imagesByItemId = new Map([
        [itemId.toString(), [fakeImageFile({ mimetype: 'application/pdf' })]],
      ]);

      await expect(
        svc.inspectGoodsReturn(
          'gr1',
          {
            warehouseId: warehouseId.toString(),
            items: [
              {
                itemId: itemId.toString(),
                condition: GoodsReturnItemCondition.DAMAGED,
                shelfId: shelfId.toString(),
              },
            ],
          },
          actorId,
          imagesByItemId,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(repo.setInspected).not.toHaveBeenCalled();
    });

    it('ảnh minh chứng > 5MB → throw VALIDATION_FAILED', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.DRAFT,
        items: [{ itemId, sku: 'SKU-1', quantity: 2 }],
      });
      warehouseRepo.findWarehouseById.mockResolvedValue({ _id: warehouseId });
      warehouseRepo.findShelfById.mockResolvedValue({ _id: shelfId });
      stockRepo.findItemById.mockResolvedValue({
        _id: itemId,
        sku: 'SKU-1',
        isPerishable: false,
      });

      const imagesByItemId = new Map([
        [itemId.toString(), [fakeImageFile({ size: 5 * 1024 * 1024 + 1 })]],
      ]);

      await expect(
        svc.inspectGoodsReturn(
          'gr1',
          {
            warehouseId: warehouseId.toString(),
            items: [
              {
                itemId: itemId.toString(),
                condition: GoodsReturnItemCondition.DAMAGED,
                shelfId: shelfId.toString(),
              },
            ],
          },
          actorId,
          imagesByItemId,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('confirmGoodsReturn', () => {
    it('phiếu không phải INSPECTED → throw GOODS_RETURN_NOT_INSPECTED', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.DRAFT,
        items: [],
      });
      await expect(svc.confirmGoodsReturn('gr1', actorId)).rejects.toThrow();
    });

    it('dòng GOOD → nhập lại kho, StockMovement RETURN_IN dương, CÓ bắn stock.changed(+)', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        warehouseId,
        status: GoodsReturnStatus.INSPECTED,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            quantity: 4,
            condition: GoodsReturnItemCondition.GOOD,
            shelfId,
            lotId: null,
          },
        ],
      });

      await svc.confirmGoodsReturn('gr1', actorId);

      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        itemId,
        warehouseId,
        shelfId,
        null,
        4,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemId,
        warehouseId,
        4,
        0,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          quantity: 4,
          refType: 'goods_return',
        }),
        expect.anything(),
      );
      expect(
        scrapNoteService.createApprovedScrapNoteForReturn,
      ).not.toHaveBeenCalled();
      expect(stockQueue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: 'SKU-1', delta: 4 },
        expect.objectContaining({ jobId: expect.any(String) }),
      );
    });

    it('dòng DAMAGED → nhập tạm rồi hủy ngay qua ScrapNoteService, KHÔNG bắn stock.changed', async () => {
      const scrapNoteId = new Types.ObjectId();
      scrapNoteService.createApprovedScrapNoteForReturn.mockResolvedValue(
        scrapNoteId,
      );
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        warehouseId,
        status: GoodsReturnStatus.INSPECTED,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            quantity: 3,
            condition: GoodsReturnItemCondition.DAMAGED,
            shelfId,
            lotId: null,
          },
        ],
      });

      await svc.confirmGoodsReturn('gr1', actorId);

      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        itemId,
        warehouseId,
        shelfId,
        null,
        3,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        itemId,
        warehouseId,
        3,
        0,
        0,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 3, refType: 'goods_return' }),
        expect.anything(),
      );
      expect(
        scrapNoteService.createApprovedScrapNoteForReturn,
      ).toHaveBeenCalledWith({
        warehouseId,
        itemId,
        sku: 'SKU-1',
        shelfId,
        lotId: null,
        quantity: 3,
        actorId: new Types.ObjectId(actorId),
        session: expect.anything(),
      });
      expect(repo.setRestocked).toHaveBeenCalledWith(
        'gr1',
        new Map([[itemId.toString(), scrapNoteId]]),
        expect.anything(),
      );
      expect(stockQueue.add).not.toHaveBeenCalled();
    });

    it('phiếu mix GOOD+DAMAGED → chỉ bắn stock.changed cho dòng GOOD, chỉ tạo ScrapNote cho dòng DAMAGED', async () => {
      const otherItemId = new Types.ObjectId();
      const scrapNoteId = new Types.ObjectId();
      scrapNoteService.createApprovedScrapNoteForReturn.mockResolvedValue(
        scrapNoteId,
      );
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        warehouseId,
        status: GoodsReturnStatus.INSPECTED,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            quantity: 2,
            condition: GoodsReturnItemCondition.GOOD,
            shelfId,
            lotId: null,
          },
          {
            itemId: otherItemId,
            sku: 'SKU-2',
            quantity: 1,
            condition: GoodsReturnItemCondition.DAMAGED,
            shelfId,
            lotId: null,
          },
        ],
      });

      await svc.confirmGoodsReturn('gr1', actorId);

      expect(stockQueue.add).toHaveBeenCalledTimes(1);
      expect(stockQueue.add).toHaveBeenCalledWith(
        'stock.changed',
        { sku: 'SKU-1', delta: 2 },
        expect.objectContaining({ jobId: expect.any(String) }),
      );
      expect(
        scrapNoteService.createApprovedScrapNoteForReturn,
      ).toHaveBeenCalledTimes(1);
    });

    it('confirmGoodsReturn gọi checkAndEmitStockLow cho mỗi dòng (cả GOOD và DAMAGED)', async () => {
      const otherItemId = new Types.ObjectId();
      const scrapNoteId = new Types.ObjectId();
      scrapNoteService.createApprovedScrapNoteForReturn.mockResolvedValue(
        scrapNoteId,
      );
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        warehouseId,
        status: GoodsReturnStatus.INSPECTED,
        items: [
          {
            itemId,
            sku: 'SKU-1',
            quantity: 2,
            condition: GoodsReturnItemCondition.GOOD,
            shelfId,
            lotId: null,
          },
          {
            itemId: otherItemId,
            sku: 'SKU-2',
            quantity: 1,
            condition: GoodsReturnItemCondition.DAMAGED,
            shelfId,
            lotId: null,
          },
        ],
      });

      await svc.confirmGoodsReturn('gr1', actorId);

      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledTimes(2);
      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledWith(
        itemId,
        warehouseId,
      );
      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledWith(
        otherItemId,
        warehouseId,
      );
    });
  });

  describe('cancelGoodsReturn', () => {
    it('status=RESTOCKED → throw GOODS_RETURN_ALREADY_DECIDED', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.RESTOCKED,
      });
      await expect(svc.cancelGoodsReturn('gr1')).rejects.toThrow();
    });

    it('status=CANCELLED → throw GOODS_RETURN_ALREADY_DECIDED', async () => {
      repo.findById.mockResolvedValue({
        _id: 'gr1',
        status: GoodsReturnStatus.CANCELLED,
      });
      await expect(svc.cancelGoodsReturn('gr1')).rejects.toThrow();
    });

    it('DRAFT/INSPECTED hợp lệ → set CANCELLED', async () => {
      repo.findById
        .mockResolvedValueOnce({ _id: 'gr1', status: GoodsReturnStatus.DRAFT })
        .mockResolvedValueOnce({
          _id: 'gr1',
          status: GoodsReturnStatus.CANCELLED,
        });

      await svc.cancelGoodsReturn('gr1');

      expect(repo.setCancelled).toHaveBeenCalledWith('gr1');
      expect(stockRepo.upsertInventory).not.toHaveBeenCalled();
    });
  });

  describe('getGoodsReturn', () => {
    it('trả về phiếu khi tìm thấy', async () => {
      const doc = { _id: 'gr1' };
      repo.findById.mockResolvedValue(doc);
      const result = await svc.getGoodsReturn('gr1');
      expect(result).toBe(doc);
    });

    it('không tìm thấy → throw GOODS_RETURN_NOT_FOUND', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(svc.getGoodsReturn('gr1')).rejects.toThrow();
    });
  });

  describe('listGoodsReturns', () => {
    it('trả về kết quả từ repo.findAll, truyền đúng query', async () => {
      const result = { data: [], total: 0 };
      repo.findAll.mockResolvedValue(result);
      const query = { status: GoodsReturnStatus.DRAFT };
      const returned = await svc.listGoodsReturns(query);
      expect(repo.findAll).toHaveBeenCalledWith(query);
      expect(returned).toBe(result);
    });
  });
});
