import { Types } from 'mongoose';
import { GoodsReceiptNoteService } from './goods-receipt-note.service';
import { GoodsReceiptNoteStatus } from './schemas/goods-receipt-note.schema';
import { PurchaseOrderStatus } from '../purchase-order/schemas/purchase-order.schema';

// WarehouseItem giả lập unit chính = "thùng" (factor 10 với "cái", chỉ để
// hiển thị) + kích thước cả thùng — GRN service tự resolve packageSpec từ
// đây (không snapshot), và actualQty luôn là số thùng nguyên (không quy đổi
// qua factor nữa).
const warehouseItem = {
  isPerishable: false,
  unit: 'thùng',
  altUnits: [{ unit: 'cái', factor: 10 }],
  depth: 40,
  width: 30,
  height: 20,
};
const resolvedPackageSpec = {
  unit: 'thùng',
  factor: 10,
  depthCm: 40,
  widthCm: 30,
  heightCm: 20,
  volumeCm3: 24000,
};
const proofImage = {
  buffer: Buffer.from('proof'),
  mimetype: 'image/jpeg',
  size: 5,
};

describe('GoodsReceiptNoteService - duyệt trước khi ghi tồn', () => {
  const actorId = new Types.ObjectId().toString();
  const approverId = new Types.ObjectId().toString();
  const purchaseOrderId = new Types.ObjectId().toString();
  const itemId = new Types.ObjectId().toString();
  const supplierId = new Types.ObjectId().toString();
  const grnId = new Types.ObjectId();
  const stagingShelfId = new Types.ObjectId();

  const repo = {
    createGoodsReceiptNote: jest.fn(),
    findGoodsReceiptNoteById: jest.fn(),
    findGoodsReceiptNotes: jest.fn(),
    countByGrnNumberPrefix: jest.fn(),
    updateStatusSubmitted: jest.fn(),
    updateStatusApproved: jest.fn(),
    updateStatusRejected: jest.fn(),
    pushImage: jest.fn(),
    replaceItems: jest.fn(),
    deleteGoodsReceiptNote: jest.fn(),
  };
  const poService = {
    getPurchaseOrder: jest.fn(),
    applyReceivedQty: jest.fn(),
    listPurchaseOrdersByIds: jest.fn(),
  };
  const locationService = { findStagingShelf: jest.fn() };
  const stockRepo = {
    findItemById: jest.fn(),
    findActiveLotByNumber: jest.fn(),
    createLot: jest.fn(),
    upsertBalance: jest.fn(),
    upsertInventory: jest.fn(),
    insertMovement: jest.fn(),
    findItemsByIds: jest.fn(),
  };
  const stockService = {
    publishAvailableForItem: jest.fn(),
    checkAndEmitStockLow: jest.fn(),
  };
  const tx = {
    withStockTransaction: jest.fn((fn: (session: object) => unknown) => fn({})),
  };
  const putaway = { createTaskFromGrn: jest.fn() };
  const cloudinary = { uploadImage: jest.fn() };
  const supplierService = {
    getSupplier: jest.fn(),
    listSuppliersByIds: jest.fn(),
  };

  let service: GoodsReceiptNoteService;

  const purchaseOrder = () => ({
    _id: new Types.ObjectId(purchaseOrderId),
    supplierId: new Types.ObjectId(supplierId),
    status: PurchaseOrderStatus.SENT,
    items: [
      {
        itemId: new Types.ObjectId(itemId),
        sku: 'SKU-1',
        unit: 'thùng',
        expectedQty: 100,
        receivedQty: 0,
      },
    ],
  });
  const pendingGrn = () => ({
    _id: grnId,
    grnNumber: 'GRN-001',
    purchaseOrderId: new Types.ObjectId(purchaseOrderId),
    status: GoodsReceiptNoteStatus.PENDING_APPROVAL,
    images: ['https://example.com/proof.jpg'],
    items: [
      {
        itemId: new Types.ObjectId(itemId),
        sku: 'SKU-1',
        actualQty: 2,
      },
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GoodsReceiptNoteService(
      repo as never,
      poService as never,
      locationService as never,
      stockRepo as never,
      stockService as never,
      tx as never,
      putaway as never,
      cloudinary as never,
      supplierService as never,
    );
    repo.countByGrnNumberPrefix.mockResolvedValue(0);
    poService.getPurchaseOrder.mockResolvedValue(purchaseOrder());
    stockRepo.findItemById.mockResolvedValue(warehouseItem);
    cloudinary.uploadImage.mockResolvedValue({
      url: 'https://example.com/grn-proof.jpg',
    });
    locationService.findStagingShelf.mockResolvedValue({ _id: stagingShelfId });
    supplierService.getSupplier.mockResolvedValue({
      name: 'NCC Test',
      status: 'ACTIVE',
    });
    repo.updateStatusApproved.mockResolvedValue({
      status: GoodsReceiptNoteStatus.APPROVED,
    });
  });

  it('không cho tạo GRN khi thiếu ảnh minh chứng', async () => {
    await expect(
      service.createGoodsReceiptNote(
        {
          purchaseOrderId,
          items: [{ itemId, actualQty: 2, manufacturedDate: '2026-07-28' }],
        },
        actorId,
        [],
      ),
    ).rejects.toMatchObject({ code: 'GRN_IMAGE_REQUIRED' });
    expect(repo.createGoodsReceiptNote).not.toHaveBeenCalled();
  });

  it('tạo GRN với actualQty là số thùng nguyên, không còn packageCount/unit riêng', async () => {
    repo.createGoodsReceiptNote.mockResolvedValue({
      status: GoodsReceiptNoteStatus.DRAFT,
    });

    await service.createGoodsReceiptNote(
      {
        purchaseOrderId,
        items: [{ itemId, actualQty: 2, manufacturedDate: '2026-07-28' }],
      },
      actorId,
      [proofImage],
    );

    expect(repo.createGoodsReceiptNote).toHaveBeenCalledWith(
      purchaseOrderId,
      expect.stringMatching(/^GRN-/),
      [
        expect.objectContaining({
          itemId,
          actualQty: 2,
          wholePackageOnly: true,
        }),
      ],
      actorId,
      ['https://example.com/grn-proof.jpg'],
    );
  });

  it('tạo GRN với expiryDate/lotNumber được parse đúng thành Date và lưu vào item', async () => {
    repo.createGoodsReceiptNote.mockResolvedValue({
      status: GoodsReceiptNoteStatus.DRAFT,
    });
    stockRepo.findItemById.mockResolvedValue({
      ...warehouseItem,
      isPerishable: true,
    });

    await service.createGoodsReceiptNote(
      {
        purchaseOrderId,
        items: [
          {
            itemId,
            actualQty: 2,
            lotNumber: 'LOT-20260728-001',
            manufacturedDate: '2026-07-28',
            expiryDate: '2027-01-01',
          },
        ],
      },
      actorId,
      [proofImage],
    );

    expect(repo.createGoodsReceiptNote).toHaveBeenCalledWith(
      purchaseOrderId,
      expect.stringMatching(/^GRN-/),
      [
        expect.objectContaining({
          itemId,
          actualQty: 2,
          lotNumber: 'LOT-20260728-001',
          manufacturedDate: new Date('2026-07-28'),
          expiryDate: new Date('2027-01-01'),
        }),
      ],
      actorId,
      ['https://example.com/grn-proof.jpg'],
    );
  });

  it('expiryDate/lotNumber lưu lúc tạo GRN round-trip đúng qua attachDisplayInfo (không bị mất khi đọc lại)', async () => {
    // Mô phỏng document ĐÃ LƯU sau khi tạo — expiryDate là Date thật (như service
    // parse ở createGoodsReceiptNote), items là Mongoose EmbeddedDocument (field
    // thật nằm sau getter trên prototype, không phải own-enumerable) — đúng hành
    // vi Mongoose thật, để bài test này bắt được bug nếu attachDisplayInfo lại
    // vô tình spread nhầm doc.items thay vì plain.items.
    const savedItem = {
      itemId: new Types.ObjectId(itemId),
      sku: 'SKU-1',
      expectedQty: 100,
      actualQty: 2,
      lotNumber: 'LOT-260728-001',
      manufacturedDate: new Date('2026-07-28'),
      expiryDate: new Date('2027-01-01'),
    };
    class EmbeddedDocumentStub {
      _doc: typeof savedItem;
      constructor(doc: typeof savedItem) {
        this._doc = doc;
      }
    }
    for (const key of Object.keys(savedItem)) {
      Object.defineProperty(EmbeddedDocumentStub.prototype, key, {
        enumerable: false,
        get(this: EmbeddedDocumentStub) {
          return this._doc[key as keyof typeof savedItem];
        },
      });
    }
    const savedDoc = {
      _id: grnId,
      purchaseOrderId: new Types.ObjectId(purchaseOrderId),
      items: [new EmbeddedDocumentStub(savedItem)],
      toObject: () => ({
        _id: grnId,
        purchaseOrderId: new Types.ObjectId(purchaseOrderId),
        items: [{ ...savedItem }],
      }),
    };

    stockRepo.findItemsByIds.mockResolvedValue([
      { _id: new Types.ObjectId(itemId), name: 'Ly nhựa 500ml' },
    ]);
    poService.listPurchaseOrdersByIds.mockResolvedValue([purchaseOrder()]);
    supplierService.listSuppliersByIds.mockResolvedValue([
      { _id: new Types.ObjectId(supplierId), name: 'NCC Test' },
    ]);

    const [result] = await service.attachDisplayInfo([savedDoc as never]);
    const items = result.items as Record<string, unknown>[];

    expect(items[0].expiryDate).toEqual(new Date('2027-01-01'));
    expect(items[0].lotNumber).toBe('LOT-260728-001');
    expect(items[0].manufacturedDate).toEqual(new Date('2026-07-28'));
    expect(items[0].actualQty).toBe(2);
  });

  it('submit bắt buộc ít nhất một ảnh', async () => {
    repo.findGoodsReceiptNoteById.mockResolvedValue({
      ...pendingGrn(),
      status: GoodsReceiptNoteStatus.DRAFT,
      images: [],
    });

    await expect(
      service.submitGoodsReceiptNote(grnId.toString(), actorId),
    ).rejects.toMatchObject({ code: 'GRN_IMAGE_REQUIRED' });
    expect(repo.updateStatusSubmitted).not.toHaveBeenCalled();
  });

  it('submit throw GRN_PACKAGE_SPEC_REQUIRED nếu item thiếu depth/width/height', async () => {
    stockRepo.findItemById.mockResolvedValue({
      isPerishable: false,
      altUnits: [{ unit: 'cái', factor: 10 }],
      // thiếu depth/width/height
    });
    repo.findGoodsReceiptNoteById.mockResolvedValue({
      ...pendingGrn(),
      status: GoodsReceiptNoteStatus.DRAFT,
    });

    await expect(
      service.submitGoodsReceiptNote(grnId.toString(), actorId),
    ).rejects.toMatchObject({ code: 'GRN_PACKAGE_SPEC_REQUIRED' });
  });

  it('submit throw GRN_PACKAGE_COUNT_REQUIRED nếu actualQty <= 0', async () => {
    repo.findGoodsReceiptNoteById.mockResolvedValue({
      ...pendingGrn(),
      status: GoodsReceiptNoteStatus.DRAFT,
      items: [
        {
          ...pendingGrn().items[0],
          actualQty: 0,
        },
      ],
    });

    await expect(
      service.submitGoodsReceiptNote(grnId.toString(), actorId),
    ).rejects.toMatchObject({ code: 'GRN_PACKAGE_COUNT_REQUIRED' });
  });

  it('Receiver có thể sửa phiếu REJECTED và gửi duyệt lại', async () => {
    repo.findGoodsReceiptNoteById
      .mockResolvedValueOnce({
        ...pendingGrn(),
        status: GoodsReceiptNoteStatus.REJECTED,
      })
      .mockResolvedValueOnce({
        ...pendingGrn(),
        status: GoodsReceiptNoteStatus.REJECTED,
      });
    repo.replaceItems.mockResolvedValue({
      ...pendingGrn(),
      status: GoodsReceiptNoteStatus.REJECTED,
    });
    repo.updateStatusSubmitted.mockResolvedValue({
      ...pendingGrn(),
      status: GoodsReceiptNoteStatus.PENDING_APPROVAL,
    });

    await service.updateGoodsReceiptNoteItems(grnId.toString(), [
      { itemId, actualQty: 2, manufacturedDate: '2026-07-28' },
    ]);
    const submitted = await service.submitGoodsReceiptNote(
      grnId.toString(),
      actorId,
    );

    expect(repo.replaceItems).toHaveBeenCalled();
    expect(repo.updateStatusSubmitted).toHaveBeenCalledWith(
      grnId.toString(),
      actorId,
    );
    expect(submitted.status).toBe(GoodsReceiptNoteStatus.PENDING_APPROVAL);
  });

  it('approve atomically claim GRN, ghi staging, movement và sinh PutAwayTask', async () => {
    const approved = {
      ...pendingGrn(),
      status: GoodsReceiptNoteStatus.APPROVED,
    };
    repo.findGoodsReceiptNoteById
      .mockResolvedValueOnce(pendingGrn())
      .mockResolvedValueOnce(approved);

    const result = await service.approveGoodsReceiptNote(
      grnId.toString(),
      approverId,
    );

    expect(repo.updateStatusApproved).toHaveBeenCalledWith(
      grnId.toString(),
      approverId,
      expect.anything(),
    );
    // baseQty = actualQty trực tiếp (2), không còn nhân factor.
    expect(stockRepo.upsertBalance).toHaveBeenCalledWith(
      new Types.ObjectId(itemId),
      2,
      0,
      0,
      expect.anything(),
    );
    expect(stockRepo.upsertInventory).toHaveBeenCalledWith(
      new Types.ObjectId(itemId),
      stagingShelfId,
      null,
      2,
      expect.anything(),
      expect.objectContaining({
        packageFactor: 10,
        packageVolumeCm3Snapshot: 24000,
      }),
    );
    expect(stockRepo.insertMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RECEIVE',
        quantity: 2,
        createdBy: new Types.ObjectId(approverId),
      }),
      expect.anything(),
    );
    expect(putaway.createTaskFromGrn).toHaveBeenCalledWith(
      grnId,
      [
        expect.objectContaining({
          itemId,
          quantity: 2,
          packageSpec: resolvedPackageSpec,
        }),
      ],
      approverId,
      expect.anything(),
      stagingShelfId,
    );
    expect(result).toEqual(approved);
  });

  it('approve retry khi đã APPROVED không cộng tồn lần hai', async () => {
    repo.findGoodsReceiptNoteById.mockResolvedValue({
      ...pendingGrn(),
      status: GoodsReceiptNoteStatus.APPROVED,
    });

    await service.approveGoodsReceiptNote(grnId.toString(), approverId);

    expect(tx.withStockTransaction).not.toHaveBeenCalled();
    expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
    expect(putaway.createTaskFromGrn).not.toHaveBeenCalled();
  });

  it('approve đồng thời: request thua claim đọc lại APPROVED và không ghi tồn', async () => {
    repo.findGoodsReceiptNoteById
      .mockResolvedValueOnce(pendingGrn())
      .mockResolvedValueOnce({
        ...pendingGrn(),
        status: GoodsReceiptNoteStatus.APPROVED,
      });
    repo.updateStatusApproved.mockResolvedValue(null);

    const result = await service.approveGoodsReceiptNote(
      grnId.toString(),
      approverId,
    );

    expect(result.status).toBe(GoodsReceiptNoteStatus.APPROVED);
    expect(stockRepo.upsertBalance).not.toHaveBeenCalled();
    expect(stockRepo.insertMovement).not.toHaveBeenCalled();
  });

  it('không publish tồn nếu transaction approve rollback', async () => {
    repo.findGoodsReceiptNoteById.mockResolvedValue(pendingGrn());
    tx.withStockTransaction.mockRejectedValueOnce(
      new Error('transaction failed'),
    );

    await expect(
      service.approveGoodsReceiptNote(grnId.toString(), approverId),
    ).rejects.toThrow('transaction failed');
    expect(stockService.publishAvailableForItem).not.toHaveBeenCalled();
  });

  it('reject chỉ nhận PENDING_APPROVAL và lưu người duyệt cùng lý do qua repository', async () => {
    repo.updateStatusRejected.mockResolvedValue({
      ...pendingGrn(),
      status: GoodsReceiptNoteStatus.REJECTED,
      rejectionReason: 'Ảnh chưa rõ',
    });

    const result = await service.rejectGoodsReceiptNote(
      grnId.toString(),
      approverId,
      'Ảnh chưa rõ',
    );

    expect(repo.updateStatusRejected).toHaveBeenCalledWith(
      grnId.toString(),
      approverId,
      'Ảnh chưa rõ',
    );
    expect(result.status).toBe(GoodsReceiptNoteStatus.REJECTED);
  });

  it('attachDisplayInfo trả đúng actualQty/lotNumber/expiryDate — không lấy nhầm từ doc.items (Mongoose EmbeddedDocument) mà phải lấy từ doc.toObject().items (plain object)', async () => {
    stockRepo.findItemsByIds.mockResolvedValue([
      { _id: new Types.ObjectId(itemId), name: 'Ly nhựa 500ml' },
    ]);
    poService.listPurchaseOrdersByIds.mockResolvedValue([purchaseOrder()]);
    supplierService.listSuppliersByIds.mockResolvedValue([
      { _id: new Types.ObjectId(supplierId), name: 'NCC Test' },
    ]);

    // Mô phỏng đúng hành vi Mongoose thật: doc.items[i] là EmbeddedDocument —
    // field thật (actualQty/lotNumber/expiryDate/sku/expectedQty) nằm trong
    // `_doc` nội bộ, truy cập qua getter khai báo trên PROTOTYPE (không phải
    // own-enumerable property của instance). Spread `{...instance}` chỉ copy
    // own-enumerable properties nên bỏ sót toàn bộ field thật — đây chính là
    // bug đã sửa (dùng nhầm doc.items thay vì plain.items khi spread).
    const rawItem = {
      itemId: new Types.ObjectId(itemId),
      sku: 'SKU-1',
      expectedQty: 100,
      actualQty: 7,
      lotNumber: 'LOT-260728-001',
      expiryDate: new Date('2027-01-01'),
    };
    class EmbeddedDocumentStub {
      _doc: typeof rawItem;
      constructor(doc: typeof rawItem) {
        this._doc = doc;
      }
    }
    for (const key of Object.keys(rawItem)) {
      Object.defineProperty(EmbeddedDocumentStub.prototype, key, {
        enumerable: false,
        get(this: EmbeddedDocumentStub) {
          return this._doc[key as keyof typeof rawItem];
        },
      });
    }
    const embeddedDocumentStub = new EmbeddedDocumentStub(
      rawItem,
    ) as unknown as { itemId: Types.ObjectId };
    const doc = {
      _id: grnId,
      purchaseOrderId: new Types.ObjectId(purchaseOrderId),
      items: [embeddedDocumentStub],
      toObject: () => ({
        _id: grnId,
        purchaseOrderId: new Types.ObjectId(purchaseOrderId),
        items: [{ ...rawItem }],
      }),
    };

    const [result] = await service.attachDisplayInfo([doc as never]);
    const items = result.items as Record<string, unknown>[];

    expect(items[0].actualQty).toBe(7);
    expect(items[0].lotNumber).toBe('LOT-260728-001');
    expect(items[0].manufacturedDate).toEqual(
      new Date('2026-07-28T00:00:00.000Z'),
    );
    expect(items[0].expiryDate).toEqual(new Date('2027-01-01'));
  });
});
