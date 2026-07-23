import { Types } from 'mongoose';
import { GoodsReceiptNoteService } from './goods-receipt-note.service';
import { GoodsReceiptNoteStatus } from './schemas/goods-receipt-note.schema';
import { PurchaseOrderStatus } from '../purchase-order/schemas/purchase-order.schema';

const makeRepo = () => ({
  createGoodsReceiptNote: jest.fn(),
  findGoodsReceiptNoteById: jest.fn(),
  findGoodsReceiptNotes: jest.fn(),
  countByGrnNumberPrefix: jest.fn(),
  updateStatusConfirmed: jest.fn(),
  updateStatusApproved: jest.fn(),
  pushImage: jest.fn(),
});

const makeCloudinaryService = () => ({
  uploadImage: jest.fn().mockResolvedValue({
    url: 'https://res.cloudinary.com/demo/image/upload/wms/grn/x.jpg',
    publicId: 'wms/grn/x',
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

const makePurchaseOrderService = () => ({
  getPurchaseOrder: jest.fn(),
  applyReceivedQty: jest.fn(),
});

const makeWarehouseService = () => ({
  findStagingShelf: jest.fn(),
});

const makeStockRepository = () => ({
  findItemById: jest.fn(),
  findActiveLotByNumber: jest.fn(),
  createLot: jest.fn(),
  upsertBalance: jest.fn(),
  upsertInventory: jest.fn(),
  insertMovement: jest.fn(),
});

const makeStockService = () => ({
  publishAvailableForItem: jest.fn(),
  checkAndEmitStockLow: jest.fn(),
});

const makeStockTransactionHelper = () => ({
  withStockTransaction: jest.fn((fn: (session: unknown) => unknown) => fn({})),
});

const makePutAwayService = () => ({
  createTaskFromGrn: jest.fn(),
});

describe('GoodsReceiptNoteService', () => {
  let svc: GoodsReceiptNoteService;
  let repo: ReturnType<typeof makeRepo>;
  let poService: ReturnType<typeof makePurchaseOrderService>;
  let warehouseService: ReturnType<typeof makeWarehouseService>;
  let stockRepo: ReturnType<typeof makeStockRepository>;
  let stockService: ReturnType<typeof makeStockService>;
  let txHelper: ReturnType<typeof makeStockTransactionHelper>;
  let putAwayService: ReturnType<typeof makePutAwayService>;
  let cloudinary: ReturnType<typeof makeCloudinaryService>;

  const actorId = new Types.ObjectId().toString();
  const purchaseOrderId = new Types.ObjectId().toString();
  const warehouseId = new Types.ObjectId().toString();
  const itemId = new Types.ObjectId().toString();
  const stagingShelfId = new Types.ObjectId();

  beforeEach(() => {
    repo = makeRepo();
    poService = makePurchaseOrderService();
    warehouseService = makeWarehouseService();
    stockRepo = makeStockRepository();
    stockService = makeStockService();
    txHelper = makeStockTransactionHelper();
    putAwayService = makePutAwayService();
    cloudinary = makeCloudinaryService();
    svc = new GoodsReceiptNoteService(
      repo as never,
      poService as never,
      warehouseService as never,
      stockRepo as never,
      stockService as never,
      txHelper as never,
      putAwayService as never,
      cloudinary as never,
    );
    repo.countByGrnNumberPrefix.mockResolvedValue(0);
  });

  describe('createGoodsReceiptNote', () => {
    const baseDto = {
      purchaseOrderId,
      items: [
        {
          itemId,
          sku: 'SKU-1',
          actualQty: 20,
          unit: 'cái',
        },
      ],
    };

    it('throw PO_NOT_RECEIVABLE khi PO đã CANCELLED', async () => {
      poService.getPurchaseOrder.mockResolvedValue({
        _id: purchaseOrderId,
        warehouseId,
        status: PurchaseOrderStatus.CANCELLED,
        items: [{ itemId, expectedQty: 100, receivedQty: 0 }],
      });
      await expect(
        svc.createGoodsReceiptNote(baseDto as never, actorId),
      ).rejects.toMatchObject({ code: 'PO_NOT_RECEIVABLE' });
    });

    it('throw PO_NOT_RECEIVABLE khi PO đã COMPLETED', async () => {
      poService.getPurchaseOrder.mockResolvedValue({
        _id: purchaseOrderId,
        warehouseId,
        status: PurchaseOrderStatus.COMPLETED,
        items: [{ itemId, expectedQty: 100, receivedQty: 100 }],
      });
      await expect(
        svc.createGoodsReceiptNote(baseDto as never, actorId),
      ).rejects.toMatchObject({ code: 'PO_NOT_RECEIVABLE' });
    });

    it('throw GRN_ITEM_NOT_IN_PO khi item không thuộc PO', async () => {
      poService.getPurchaseOrder.mockResolvedValue({
        _id: purchaseOrderId,
        warehouseId,
        status: PurchaseOrderStatus.SENT,
        items: [{ itemId: 'other-item', expectedQty: 100, receivedQty: 0 }],
      });
      await expect(
        svc.createGoodsReceiptNote(baseDto as never, actorId),
      ).rejects.toMatchObject({ code: 'GRN_ITEM_NOT_IN_PO' });
    });

    it('throw GRN_LOT_INFO_MISSING khi item perishable thiếu lotNumber/expiryDate', async () => {
      poService.getPurchaseOrder.mockResolvedValue({
        _id: purchaseOrderId,
        warehouseId,
        status: PurchaseOrderStatus.SENT,
        items: [{ itemId, expectedQty: 100, receivedQty: 0 }],
      });
      stockRepo.findItemById.mockResolvedValue({ isPerishable: true });
      await expect(
        svc.createGoodsReceiptNote(baseDto as never, actorId),
      ).rejects.toMatchObject({ code: 'GRN_LOT_INFO_MISSING' });
    });

    it('tạo GRN DRAFT thành công khi mọi validate qua', async () => {
      poService.getPurchaseOrder.mockResolvedValue({
        _id: purchaseOrderId,
        warehouseId,
        status: PurchaseOrderStatus.SENT,
        items: [{ itemId, expectedQty: 100, receivedQty: 0 }],
      });
      stockRepo.findItemById.mockResolvedValue({ isPerishable: false });
      repo.createGoodsReceiptNote.mockResolvedValue({
        grnNumber: 'GRN-X',
      });
      await svc.createGoodsReceiptNote(baseDto, actorId);
      expect(repo.createGoodsReceiptNote).toHaveBeenCalledWith(
        purchaseOrderId,
        warehouseId,
        expect.any(String),
        [
          {
            itemId,
            sku: 'SKU-1',
            expectedQty: 100,
            actualQty: 20,
            unit: 'cái',
            lotNumber: undefined,
            expiryDate: undefined,
            note: undefined,
          },
        ],
        actorId,
      );
    });
  });

  describe('confirmGoodsReceiptNote', () => {
    const grnId = 'grn1';

    it('throw GRN_NOT_FOUND khi GRN không tồn tại', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue(null);
      await expect(
        svc.confirmGoodsReceiptNote(grnId, actorId),
      ).rejects.toMatchObject({ code: 'GRN_NOT_FOUND' });
    });

    it('throw GRN_INVALID_STATUS_TRANSITION khi GRN không phải DRAFT', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({
        status: GoodsReceiptNoteStatus.CONFIRMED,
      });
      await expect(
        svc.confirmGoodsReceiptNote(grnId, actorId),
      ).rejects.toMatchObject({ code: 'GRN_INVALID_STATUS_TRANSITION' });
    });

    it('throw GRN_QTY_EXCEEDS_PO khi vượt expectedQty còn lại', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({
        _id: grnId,
        status: GoodsReceiptNoteStatus.DRAFT,
        purchaseOrderId,
        warehouseId,
        items: [{ itemId, sku: 'SKU-1', actualQty: 60, unit: 'cái' }],
      });
      poService.getPurchaseOrder.mockResolvedValue({
        items: [{ itemId, expectedQty: 100, receivedQty: 50 }],
      });
      await expect(
        svc.confirmGoodsReceiptNote(grnId, actorId),
      ).rejects.toMatchObject({ code: 'GRN_QTY_EXCEEDS_PO' });
      expect(warehouseService.findStagingShelf).not.toHaveBeenCalled();
    });

    it('cộng tồn 2 lớp + ghi movement RECEIVE + cập nhật PO khi hợp lệ', async () => {
      poService.getPurchaseOrder.mockResolvedValue({
        items: [{ itemId, expectedQty: 100, receivedQty: 50 }],
      });
      stockRepo.findItemById.mockResolvedValue({
        isPerishable: false,
        unit: 'cái',
        altUnits: [],
      });
      warehouseService.findStagingShelf.mockResolvedValue({
        _id: stagingShelfId,
      });
      const confirmed = { status: GoodsReceiptNoteStatus.CONFIRMED };
      // Service đọc GRN 2 lần: 1 lần đầu để load DRAFT, 1 lần cuối (sau transaction) để trả bản ghi mới nhất
      repo.findGoodsReceiptNoteById
        .mockResolvedValueOnce({
          _id: grnId,
          status: GoodsReceiptNoteStatus.DRAFT,
          purchaseOrderId,
          warehouseId,
          items: [
            {
              itemId,
              sku: 'SKU-1',
              actualQty: 20,
              unit: 'cái',
            },
          ],
        })
        .mockResolvedValueOnce(confirmed);

      const result = await svc.confirmGoodsReceiptNote(grnId, actorId);

      expect(txHelper.withStockTransaction).toHaveBeenCalled();
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        new Types.ObjectId(itemId),
        new Types.ObjectId(warehouseId),
        20,
        0,
        0,
        expect.anything(),
      );
      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        new Types.ObjectId(itemId),
        new Types.ObjectId(warehouseId),
        stagingShelfId,
        null,
        20,
        expect.anything(),
      );
      expect(stockRepo.insertMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          itemId: new Types.ObjectId(itemId),
          warehouseId: new Types.ObjectId(warehouseId),
          shelfId: stagingShelfId,
          lotId: null,
          type: 'RECEIVE',
          quantity: 20,
          refType: 'grn',
        }),
        expect.anything(),
      );
      expect(poService.applyReceivedQty).toHaveBeenCalledWith(
        purchaseOrderId,
        itemId,
        20,
        expect.anything(),
      );
      // Sinh PutAwayTask ngay trong transaction — cùng session, dùng đúng
      // lotId đã resolve (null ở case này vì item không perishable/không có lô)
      expect(putAwayService.createTaskFromGrn).toHaveBeenCalledWith(
        grnId,
        new Types.ObjectId(warehouseId),
        [
          {
            itemId: itemId,
            lotId: null,
            quantity: 20,
          },
        ],
        actorId,
        expect.anything(),
      );
      expect(repo.updateStatusConfirmed).toHaveBeenCalledWith(
        grnId,
        actorId,
        expect.anything(),
      );
      expect(stockService.publishAvailableForItem).toHaveBeenCalledWith(
        itemId,
        20,
        'grn',
        grnId,
      );
      // S4-04: checkAndEmitStockLow gọi cho cặp (item, warehouse) đã chạm upsertBalance
      // trong transaction — sau khi commit.
      expect(stockService.checkAndEmitStockLow).toHaveBeenCalledWith(
        new Types.ObjectId(itemId),
        new Types.ObjectId(warehouseId),
      );
      expect(result).toEqual(confirmed);
    });

    it('xử lý đúng 2 dòng cùng itemId nhưng khác lô (lotNumber/expiryDate riêng)', async () => {
      poService.getPurchaseOrder.mockResolvedValue({
        items: [{ itemId, expectedQty: 100, receivedQty: 0 }],
      });
      stockRepo.findItemById.mockResolvedValue({
        isPerishable: true,
        unit: 'cái',
        altUnits: [],
      });
      warehouseService.findStagingShelf.mockResolvedValue({
        _id: stagingShelfId,
      });

      const expiryL1 = new Date('2026-08-01');
      const expiryL2 = new Date('2026-09-01');
      const confirmed = { status: GoodsReceiptNoteStatus.CONFIRMED };
      repo.findGoodsReceiptNoteById
        .mockResolvedValueOnce({
          _id: grnId,
          status: GoodsReceiptNoteStatus.DRAFT,
          purchaseOrderId,
          warehouseId,
          items: [
            {
              itemId,
              sku: 'SKU-1',
              actualQty: 20,
              unit: 'cái',
              lotNumber: 'L1',
              expiryDate: expiryL1,
            },
            {
              itemId,
              sku: 'SKU-1',
              actualQty: 15,
              unit: 'cái',
              lotNumber: 'L2',
              expiryDate: expiryL2,
            },
          ],
        })
        .mockResolvedValueOnce(confirmed);

      // Không có lô active nào tồn tại từ trước — cả 2 dòng đều tạo lô mới
      stockRepo.findActiveLotByNumber.mockResolvedValue(null);
      const lotId1 = new Types.ObjectId();
      const lotId2 = new Types.ObjectId();
      stockRepo.createLot
        .mockResolvedValueOnce({ _id: lotId1 })
        .mockResolvedValueOnce({ _id: lotId2 });

      await svc.confirmGoodsReceiptNote(grnId, actorId);

      // createLot được gọi đúng 2 lần, mỗi lần với lotNumber/expiryDate riêng của từng dòng
      expect(stockRepo.createLot).toHaveBeenCalledTimes(2);
      expect(stockRepo.createLot).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          itemId: new Types.ObjectId(itemId),
          lotNumber: 'L1',
          expiryDate: expiryL1,
        }),
        expect.anything(),
      );
      expect(stockRepo.createLot).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          itemId: new Types.ObjectId(itemId),
          lotNumber: 'L2',
          expiryDate: expiryL2,
        }),
        expect.anything(),
      );

      // upsertInventory gọi 2 lần, mỗi lần dùng đúng lotId trả về từ createLot của chính dòng đó
      // (không bị lẫn lotId giữa 2 dòng)
      expect(stockRepo.upsertInventory).toHaveBeenCalledTimes(2);
      expect(stockRepo.upsertInventory).toHaveBeenNthCalledWith(
        1,
        new Types.ObjectId(itemId),
        new Types.ObjectId(warehouseId),
        stagingShelfId,
        lotId1,
        20,
        expect.anything(),
      );
      expect(stockRepo.upsertInventory).toHaveBeenNthCalledWith(
        2,
        new Types.ObjectId(itemId),
        new Types.ObjectId(warehouseId),
        stagingShelfId,
        lotId2,
        15,
        expect.anything(),
      );

      // upsertBalance: code hiện tại gọi 1 lần / dòng (không gộp trước khi ghi transaction) —
      // 2 lệnh $inc riêng biệt trong cùng transaction lên cùng 1 balance doc vẫn cộng dồn ra tổng đúng (20 + 15 = 35),
      // nên đây là hành vi hợp lệ dù không gộp thành 1 lệnh duy nhất.
      expect(stockRepo.upsertBalance).toHaveBeenCalledTimes(2);
      expect(stockRepo.upsertBalance).toHaveBeenNthCalledWith(
        1,
        new Types.ObjectId(itemId),
        new Types.ObjectId(warehouseId),
        20,
        0,
        0,
        expect.anything(),
      );
      expect(stockRepo.upsertBalance).toHaveBeenNthCalledWith(
        2,
        new Types.ObjectId(itemId),
        new Types.ObjectId(warehouseId),
        15,
        0,
        0,
        expect.anything(),
      );

      // applyReceivedQty cũng gọi theo từng dòng — 20 rồi 15, cộng dồn ra đúng 35 ở PO
      expect(poService.applyReceivedQty).toHaveBeenCalledTimes(2);
      expect(poService.applyReceivedQty).toHaveBeenNthCalledWith(
        1,
        purchaseOrderId,
        itemId,
        20,
        expect.anything(),
      );
      expect(poService.applyReceivedQty).toHaveBeenNthCalledWith(
        2,
        purchaseOrderId,
        itemId,
        15,
        expect.anything(),
      );

      // publishAvailableForItem gộp theo itemId TRƯỚC transaction (baseQtyByItem) — gọi 1 lần với tổng 35
      expect(stockService.publishAvailableForItem).toHaveBeenCalledTimes(1);
      expect(stockService.publishAvailableForItem).toHaveBeenCalledWith(
        itemId,
        35,
        'grn',
        grnId,
      );

      // createTaskFromGrn được gọi đúng 1 lần với putAwayLines giữ đúng lotId riêng
      // của từng dòng — dùng lotId1/lotId2 cụ thể (không phải expect.anything()) để
      // bắt được lỗi hoán đổi/null hóa lotId giữa 2 dòng multi-lot nếu có.
      expect(putAwayService.createTaskFromGrn).toHaveBeenCalledTimes(1);
      expect(putAwayService.createTaskFromGrn).toHaveBeenCalledWith(
        grnId,
        new Types.ObjectId(warehouseId),
        [
          { itemId: itemId, lotId: lotId1, quantity: 20 },
          { itemId: itemId, lotId: lotId2, quantity: 15 },
        ],
        actorId,
        expect.anything(),
      );
    });

    it('quy đổi baseQty theo altUnits khi dòng GRN dùng đơn vị thay thế (thùng → cái)', async () => {
      poService.getPurchaseOrder.mockResolvedValue({
        items: [{ itemId, expectedQty: 1000, receivedQty: 0 }],
      });
      stockRepo.findItemById.mockResolvedValue({
        isPerishable: false,
        unit: 'cái',
        altUnits: [{ unit: 'thùng', factor: 50 }],
      });
      warehouseService.findStagingShelf.mockResolvedValue({
        _id: stagingShelfId,
      });
      const confirmed = { status: GoodsReceiptNoteStatus.CONFIRMED };
      repo.findGoodsReceiptNoteById
        .mockResolvedValueOnce({
          _id: grnId,
          status: GoodsReceiptNoteStatus.DRAFT,
          purchaseOrderId,
          warehouseId,
          items: [
            {
              itemId,
              sku: 'SKU-1',
              actualQty: 2,
              unit: 'thùng',
            },
          ],
        })
        .mockResolvedValueOnce(confirmed);

      await svc.confirmGoodsReceiptNote(grnId, actorId);

      // 2 thùng x factor 50 = 100 cái (baseQty), không phải 2
      expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
        new Types.ObjectId(itemId),
        new Types.ObjectId(warehouseId),
        100,
        0,
        0,
        expect.anything(),
      );
      expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
        new Types.ObjectId(itemId),
        new Types.ObjectId(warehouseId),
        stagingShelfId,
        null,
        100,
        expect.anything(),
      );
      expect(poService.applyReceivedQty).toHaveBeenCalledWith(
        purchaseOrderId,
        itemId,
        100,
        expect.anything(),
      );
      expect(stockService.publishAvailableForItem).toHaveBeenCalledWith(
        itemId,
        100,
        'grn',
        grnId,
      );
    });
  });

  describe('approveGoodsReceiptNote', () => {
    const grnId = 'grn1';

    it('throw GRN_NOT_FOUND khi GRN không tồn tại', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue(null);
      await expect(
        svc.approveGoodsReceiptNote(grnId, actorId),
      ).rejects.toMatchObject({ code: 'GRN_NOT_FOUND' });
    });

    it('throw GRN_INVALID_STATUS_TRANSITION khi GRN chưa CONFIRMED', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({
        status: GoodsReceiptNoteStatus.DRAFT,
      });
      await expect(
        svc.approveGoodsReceiptNote(grnId, actorId),
      ).rejects.toMatchObject({ code: 'GRN_INVALID_STATUS_TRANSITION' });
    });

    it('set APPROVED khi GRN đang CONFIRMED', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({
        status: GoodsReceiptNoteStatus.CONFIRMED,
      });
      repo.updateStatusApproved.mockResolvedValue({
        status: GoodsReceiptNoteStatus.APPROVED,
      });
      const result = await svc.approveGoodsReceiptNote(grnId, actorId);
      expect(repo.updateStatusApproved).toHaveBeenCalledWith(grnId, actorId);
      expect(result).toEqual({ status: GoodsReceiptNoteStatus.APPROVED });
    });
  });

  describe('uploadGrnImage', () => {
    const grnId = 'grn1';

    it('throw GRN_NOT_FOUND khi GRN không tồn tại', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue(null);
      await expect(
        svc.uploadGrnImage(grnId, fakeImageFile()),
      ).rejects.toMatchObject({ code: 'GRN_NOT_FOUND' });
      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('throw GRN_INVALID_STATUS_TRANSITION khi GRN đã APPROVED', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({
        status: GoodsReceiptNoteStatus.APPROVED,
      });
      await expect(
        svc.uploadGrnImage(grnId, fakeImageFile()),
      ).rejects.toMatchObject({ code: 'GRN_INVALID_STATUS_TRANSITION' });
      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('file không phải ảnh → AppException VALIDATION_FAILED, không gọi CloudinaryService', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({
        status: GoodsReceiptNoteStatus.DRAFT,
      });
      await expect(
        svc.uploadGrnImage(
          grnId,
          fakeImageFile({ mimetype: 'application/pdf' }),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('file > 5MB → AppException VALIDATION_FAILED', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({
        status: GoodsReceiptNoteStatus.DRAFT,
      });
      await expect(
        svc.uploadGrnImage(grnId, fakeImageFile({ size: 5 * 1024 * 1024 + 1 })),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(cloudinary.uploadImage).not.toHaveBeenCalled();
    });

    it('upload ảnh hợp lệ khi GRN đang DRAFT → push URL vào images', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({
        status: GoodsReceiptNoteStatus.DRAFT,
      });
      repo.pushImage.mockResolvedValue({
        status: GoodsReceiptNoteStatus.DRAFT,
        images: ['https://res.cloudinary.com/demo/image/upload/wms/grn/x.jpg'],
      });

      const result = await svc.uploadGrnImage(grnId, fakeImageFile());

      expect(cloudinary.uploadImage).toHaveBeenCalledWith(
        expect.any(Buffer),
        'wms/grn',
      );
      expect(repo.pushImage).toHaveBeenCalledWith(
        grnId,
        'https://res.cloudinary.com/demo/image/upload/wms/grn/x.jpg',
      );
      expect(result.images).toEqual([
        'https://res.cloudinary.com/demo/image/upload/wms/grn/x.jpg',
      ]);
    });

    it('upload ảnh hợp lệ khi GRN đang CONFIRMED → vẫn cho phép', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({
        status: GoodsReceiptNoteStatus.CONFIRMED,
      });
      repo.pushImage.mockResolvedValue({
        status: GoodsReceiptNoteStatus.CONFIRMED,
        images: ['https://res.cloudinary.com/demo/image/upload/wms/grn/x.jpg'],
      });

      await svc.uploadGrnImage(grnId, fakeImageFile());

      expect(cloudinary.uploadImage).toHaveBeenCalled();
    });

    it('throw GRN_NOT_FOUND nếu repo.pushImage trả về null (bị xóa giữa chừng)', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({
        status: GoodsReceiptNoteStatus.DRAFT,
      });
      repo.pushImage.mockResolvedValue(null);

      await expect(
        svc.uploadGrnImage(grnId, fakeImageFile()),
      ).rejects.toMatchObject({ code: 'GRN_NOT_FOUND' });
    });
  });

  describe('getGoodsReceiptNote', () => {
    it('throw GRN_NOT_FOUND khi không tìm thấy', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue(null);
      await expect(svc.getGoodsReceiptNote('grn1')).rejects.toMatchObject({
        code: 'GRN_NOT_FOUND',
      });
    });

    it('trả về GRN khi tìm thấy', async () => {
      repo.findGoodsReceiptNoteById.mockResolvedValue({ grnNumber: 'GRN-X' });
      await expect(svc.getGoodsReceiptNote('grn1')).resolves.toEqual({
        grnNumber: 'GRN-X',
      });
    });
  });

  describe('listGoodsReceiptNotes', () => {
    it('gọi repo.findGoodsReceiptNotes với query nguyên vẹn', async () => {
      repo.findGoodsReceiptNotes.mockResolvedValue({ data: [], total: 0 });
      await svc.listGoodsReceiptNotes({ page: 2, limit: 10 });
      expect(repo.findGoodsReceiptNotes).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
      });
    });
  });
});
