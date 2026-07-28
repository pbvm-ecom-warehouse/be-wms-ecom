import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import { CloudinaryService, setupApp } from '@app/common';
import { EVENTS, QUEUES, type OrderReadyToFulfillPayload } from '@app/events';
import { AppModule } from '../src/app.module';
import {
  StockBalance,
  type StockBalanceDocument,
} from '../src/stock/schemas/stock-balance.schema';
import {
  InventoryStock,
  type InventoryStockDocument,
} from '../src/stock/schemas/inventory-stock.schema';
import {
  StockMovement,
  type StockMovementDocument,
  MovementType,
} from '../src/stock/schemas/stock-movement.schema';
import { GoodsIssueRepository } from '../src/goods-issue/goods-issue.repository';
import {
  Shelf,
  type ShelfDocument,
} from '../src/location/schemas/shelf.schema';

/**
 * E2E happy-path WMS (S4-05): login → PO → GRN CONFIRMED (onHand+) → put-away
 * (+ gợi ý) → xuất hàng (onHand-, goods.issued) → kiểm kê khớp. Assert bất biến
 * 2 lớp tồn kho sau mỗi bước quan trọng.
 *
 * File này (phần 1 — Task 3) cover: bootstrap/login, zone/rack/shelf,
 * WarehouseItem/Supplier/SupplierItem, PO → GRN confirm, put-away suggestion +
 * confirm-line. Phần 2 (Task 4) nối tiếp cùng file: goods-issue qua queue +
 * stock-count + assertion cuối.
 *
 * CẦN Mongo (replica set rs0) + Redis chạy — xem docker-compose.local.yml.
 * Chạy: `pnpm test:e2e`.
 */
describe('WMS happy-path (e2e)', () => {
  let app: INestApplication;
  let stockBalanceModel: Model<StockBalanceDocument>;
  let inventoryStockModel: Model<InventoryStockDocument>;
  let stockMovementModel: Model<StockMovementDocument>;
  let shelfModel: Model<ShelfDocument>;
  // orderQueue + goodsIssueRepo: gán ở beforeAll nhưng chỉ được ĐỌC ở phần
  // goods-issue (Task 4, nối tiếp cùng file này) — khai báo sẵn ở đây vì
  // beforeAll chỉ chạy 1 lần cho toàn bộ describe.
  let orderQueue: Queue;
  let goodsIssueRepo: GoodsIssueRepository;

  let adminToken: string;
  let managerToken: string;
  let receiverToken: string;
  // pickerToken + counterToken: login ở Task 3 (Step 3) nhưng chỉ dùng ở
  // Task 4 (PICKER xuất hàng, COUNTER kiểm kê) — giữ ở đây để tránh gọi
  // /auth/login thêm lần nữa (xem cảnh báo throttle 5 req/60s trong brief).
  let pickerToken: string;
  let counterToken: string;

  let stagingShelfId: string;
  // stagingShelfCode: gán ở Step 4 (tạo shelf) nhưng chỉ dùng ở Task 4 khi
  // kiểm kê phải đếm luôn dòng ở shelf staging (systemQty=0, xem giải thích
  // ở it-block kiểm kê bên dưới).
  let stagingShelfCode: string;
  let mainShelfId: string;
  let mainShelfCode: string;
  let itemId: string;
  let itemBarcode: string;
  let itemSku: string;
  let supplierId: string;
  let purchaseOrderId: string;
  let grnId: string;
  let putAwayTaskId: string;

  const RECEIVE_QTY = 100;
  const uniqueSuffix = Date.now().toString();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CloudinaryService)
      .useValue({
        uploadImage: jest.fn().mockResolvedValue({
          url: 'https://example.com/grn-proof.jpg',
        }),
      })
      .compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    setupApp(app, {
      corsOrigins: undefined,
      isProd: false,
      globalPrefix: 'api/wms',
    });
    await app.init();

    stockBalanceModel = app.get(getModelToken(StockBalance.name));
    inventoryStockModel = app.get(getModelToken(InventoryStock.name));
    stockMovementModel = app.get(getModelToken(StockMovement.name));
    shelfModel = app.get(getModelToken(Shelf.name));
    orderQueue = app.get(getQueueToken(QUEUES.ORDER));
    goodsIssueRepo = app.get(GoodsIssueRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Bất biến 2 lớp tồn kho: onHand (lớp 1, snapshot tổng) phải luôn khớp
   * tổng quantity của mọi InventoryStock (lớp 2, chi tiết theo shelf/lot)
   * cho cùng item. Đọc thẳng model thay vì qua HTTP vì không có endpoint trả
   * StockBalance trực tiếp (xem design doc — "Điểm mở").
   */
  async function assertTwoLayerInvariant(
    checkItemId: string,
  ): Promise<{ onHand: number; sumInventory: number }> {
    const balance = await stockBalanceModel
      .findOne({ itemId: checkItemId })
      .lean();
    expect(balance).not.toBeNull();
    const inventoryRows = await inventoryStockModel
      .find({ itemId: checkItemId })
      .lean();
    const sumInventory = inventoryRows.reduce((sum, r) => sum + r.quantity, 0);
    expect(balance?.onHand).toBe(sumInventory);
    return { onHand: balance?.onHand ?? 0, sumInventory };
  }

  async function countMovements(
    checkItemId: string,
    type: MovementType,
  ): Promise<number> {
    return stockMovementModel.countDocuments({
      itemId: checkItemId,
      type,
    });
  }

  it('bootstrap admin (hoặc dùng seed_admin nếu đã bootstrap) + login 4 role cần dùng', async () => {
    const adminUsername = `e2e_admin_${uniqueSuffix}`;
    const adminPassword = 'E2ePass123!';
    const bootstrapRes = await request(app.getHttpServer())
      .post('/api/wms/auth/bootstrap-admin')
      .send({ username: adminUsername, password: adminPassword });

    let loginUsername = adminUsername;
    let loginPassword = adminPassword;
    if (bootstrapRes.status === 403) {
      // DB đã có user (vd seed script apps/wms/src/seed/seed.ts đã chạy trước) →
      // bootstrap-admin luôn từ chối nếu countAll() > 0. Không có cách phục hồi
      // ADMIN token từ user có sẵn (passwordHash 1 chiều) — dùng đúng tài khoản
      // seed_admin mà seed.ts tạo ra (Task 1) làm fallback thay vì fail cứng.
      loginUsername = 'seed_admin';
      loginPassword = 'Seed@12345';
    } else {
      expect(bootstrapRes.status).toBe(201);
    }

    const adminLoginRes = await request(app.getHttpServer())
      .post('/api/wms/auth/login')
      .send({ username: loginUsername, password: loginPassword })
      .expect(200);
    adminToken = adminLoginRes.body.data.accessToken as string;

    async function createAndLogin(
      username: string,
      role: string,
    ): Promise<string> {
      await request(app.getHttpServer())
        .post('/api/wms/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'E2ePass123!', role })
        .expect(201);
      const loginRes = await request(app.getHttpServer())
        .post('/api/wms/auth/login')
        .send({ username, password: 'E2ePass123!' })
        .expect(200);
      return loginRes.body.data.accessToken as string;
    }

    managerToken = await createAndLogin(
      `e2e_manager_${uniqueSuffix}`,
      'MANAGER',
    );
    receiverToken = await createAndLogin(
      `e2e_receiver_${uniqueSuffix}`,
      'RECEIVER',
    );
    pickerToken = await createAndLogin(`e2e_picker_${uniqueSuffix}`, 'PICKER');
    counterToken = await createAndLogin(
      `e2e_counter_${uniqueSuffix}`,
      'COUNTER',
    );
  });

  it('MANAGER tạo zone/rack/shelf(staging+chính)', async () => {
    const zoneRes = await request(app.getHttpServer())
      .post('/api/wms/location/zones')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: 'Khu A', code: `E2E-A-${uniqueSuffix}` })
      .expect(201);
    const zoneId = zoneRes.body.data.id;

    const rackRes = await request(app.getHttpServer())
      .post('/api/wms/location/racks')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ zoneId, name: 'Kệ A1', code: `E2E-A1-${uniqueSuffix}` })
      .expect(201);
    const rackId = rackRes.body.data.id;

    const stagingRes = await request(app.getHttpServer())
      .post('/api/wms/location/shelves')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        rackId,
        level: 1,
        code: `E2E-STAGING-${uniqueSuffix}`,
        isStaging: true,
      })
      .expect(201);
    stagingShelfId = stagingRes.body.data.id;
    stagingShelfCode = stagingRes.body.data.code;

    const mainRes = await request(app.getHttpServer())
      .post('/api/wms/location/shelves')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        rackId,
        level: 2,
        code: `E2E-MAIN-${uniqueSuffix}`,
        innerDepth: 120,
        innerWidth: 80,
        innerHeight: 50,
        fillFactor: 0.8,
      })
      .expect(201);
    mainShelfId = mainRes.body.data.id;
    mainShelfCode = mainRes.body.data.code;
  });

  it('tạo WarehouseItem + Supplier + SupplierItem', async () => {
    itemSku = `E2E-SKU-${uniqueSuffix}`;
    itemBarcode = `E2E-BC-${uniqueSuffix}`;
    const itemRes = await request(app.getHttpServer())
      .post('/api/wms/stock/items')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        sku: itemSku,
        barcode: itemBarcode,
        name: 'Item E2E',
        type: 'MATERIAL',
        unit: 'cái',
        isPerishable: false,
        depth: 10,
        width: 8,
        height: 12,
      })
      .expect(201);
    itemId = itemRes.body.data.id;

    const supplierRes = await request(app.getHttpServer())
      .post('/api/wms/supplier')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ code: `E2E-NCC-${uniqueSuffix}`, name: 'NCC E2E' })
      .expect(201);
    supplierId = supplierRes.body.data.id;

    await request(app.getHttpServer())
      .post('/api/wms/supplier/items')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ itemId, supplierId, purchasePrice: 10000 })
      .expect(201);
  });

  it('tạo PO → GRN → confirm GRN (onHand tăng, PUTAWAY task tự sinh)', async () => {
    const poRes = await request(app.getHttpServer())
      .post('/api/wms/purchase-orders')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        supplierId,
        items: [
          { itemId, sku: itemSku, expectedQty: RECEIVE_QTY, unit: 'cái' },
        ],
      })
      .expect(201);
    purchaseOrderId = poRes.body.data.id;
    expect(poRes.body.data.status).toBe('CONFIRMED');

    const grnRes = await request(app.getHttpServer())
      .post('/api/wms/goods-receipt-notes')
      .set('Authorization', `Bearer ${receiverToken}`)
      .field('purchaseOrderId', purchaseOrderId)
      .field(
        'items',
        JSON.stringify([
          {
            itemId,
            actualQty: RECEIVE_QTY,
            manufacturedDate: '2026-07-28',
          },
        ]),
      )
      .attach('images', Buffer.from('proof'), {
        filename: 'grn-proof.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);
    grnId = grnRes.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/wms/goods-receipt-notes/${grnId}/confirm`)
      .set('Authorization', `Bearer ${receiverToken}`)
      .send()
      .expect(201);

    const { onHand } = await assertTwoLayerInvariant(itemId);
    expect(onHand).toBe(RECEIVE_QTY);
    const receiveMovements = await countMovements(itemId, MovementType.RECEIVE);
    expect(receiveMovements).toBe(1);
  });

  it('GET gợi ý put-away rồi confirm-line dời hàng staging → shelf chính', async () => {
    const suggestRes = await request(app.getHttpServer())
      .get('/api/wms/putaway/suggestions')
      .query({ sku: itemSku, qty: RECEIVE_QTY })
      .set('Authorization', `Bearer ${receiverToken}`)
      .expect(200);
    expect(suggestRes.body.data.warning).toBeNull();
    expect(suggestRes.body.data.suggestions.length).toBeGreaterThan(0);

    const tasksRes = await request(app.getHttpServer())
      .get('/api/wms/putaway-tasks')
      .query({ status: 'PENDING' })
      .set('Authorization', `Bearer ${receiverToken}`)
      .expect(200);
    // Controller trả { data: PutAwayTaskResponseDto[], total, page, limit },
    // rồi setupApp bọc thêm 1 lớp { data, meta } toàn cục → mảng task nằm ở
    // res.body.data.data (KHÔNG phải res.body.data trực tiếp).
    const task = (
      tasksRes.body.data.data as { id: string; grnId: string }[]
    ).find((t) => t.grnId === grnId);
    expect(task).toBeDefined();
    putAwayTaskId = task!.id;

    await request(app.getHttpServer())
      .post(`/api/wms/putaway-tasks/${putAwayTaskId}/confirm-line`)
      .set('Authorization', `Bearer ${receiverToken}`)
      .send({ itemBarcode, shelfCode: mainShelfCode, quantity: RECEIVE_QTY })
      .expect(201);

    const { onHand } = await assertTwoLayerInvariant(itemId);
    expect(onHand).toBe(RECEIVE_QTY); // put-away chỉ dời vị trí, KHÔNG đổi onHand
    // confirmLine ghi 2 dòng movement PUTAWAY trong cùng transaction: 1 dòng âm
    // ở shelf staging (hàng rời đi) + 1 dòng dương ở shelf đích (hàng đến),
    // cùng itemId (chỉ khác shelfId). countMovements không lọc theo shelfId
    // nên đếm cả 2 — đúng bản chất là 2 sự kiện tồn kho thật đã xảy ra.
    const putawayMovements = await countMovements(itemId, MovementType.PUTAWAY);
    expect(putawayMovements).toBe(2);

    const stagingRow = await inventoryStockModel
      .findOne({ itemId, shelfId: stagingShelfId })
      .lean();
    expect(stagingRow?.quantity ?? 0).toBe(0);
    const mainRow = await inventoryStockModel
      .findOne({ itemId, shelfId: mainShelfId })
      .lean();
    expect(mainRow?.quantity).toBe(RECEIVE_QTY);
  });

  const ISSUE_QTY = 30;
  let orderId: string;
  let goodsIssueId: string;

  it('enqueue order.ready_to_fulfill thật → consumer sinh GoodsIssue', async () => {
    orderId = `e2e-order-${uniqueSuffix}`;
    const payload: OrderReadyToFulfillPayload = {
      orderId,
      items: [{ sku: itemSku, quantity: ISSUE_QTY }],
      shippingAddress: { line1: 'test' },
      recipient: { name: 'E2E Recipient', phone: '0900000000' },
      paymentMethod: 'COD',
    };
    // KHÔNG bump StockBalance.reserved trước khi enqueue: đã đọc toàn bộ
    // GoodsIssueService.createFromOrderReady (apps/wms/src/goods-issue/
    // goods-issue.service.ts) — method này chỉ tra WarehouseItem theo sku rồi
    // tạo GoodsIssue với remainingQty = quantity, KHÔNG đọc/kiểm tra
    // StockBalance.reserved ở đâu cả. Việc giữ tồn thật (reserve) là trách
    // nhiệm của saga Ecom checkout (STOCK_RESERVE_REQUESTED, xem
    // architecture.md) — nằm ngoài phạm vi test WMS-only này, không cần giả lập.
    await orderQueue.add(EVENTS.ORDER_READY_TO_FULFILL, payload);

    const deadline = Date.now() + 8000;
    let goodsIssue = await goodsIssueRepo.findByOrderId(orderId);
    while (!goodsIssue && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      goodsIssue = await goodsIssueRepo.findByOrderId(orderId);
    }
    expect(goodsIssue).not.toBeNull();
    goodsIssueId = goodsIssue!._id.toString();
  }, 10000);

  it('PICKER confirm-line xuất kho (onHand giảm, goods.issued)', async () => {
    await request(app.getHttpServer())
      .post(`/api/wms/goods-issues/${goodsIssueId}/confirm-line`)
      .set('Authorization', `Bearer ${pickerToken}`)
      .send({ itemBarcode, shelfCode: mainShelfCode, quantity: ISSUE_QTY })
      .expect(201);

    const { onHand } = await assertTwoLayerInvariant(itemId);
    expect(onHand).toBe(RECEIVE_QTY - ISSUE_QTY);
    // Đã đọc toàn bộ GoodsIssueService.confirmLine: trong 1 transaction, path
    // này gọi insertMovement CHỈ 1 LẦN (type ISSUE, quantity=-ISSUE_QTY) —
    // khác PUTAWAY (2 dòng vì dịch chuyển giữa 2 shelf), ISSUE chỉ trừ tồn ở
    // đúng 1 shelf (mainShelfCode) nên chỉ có 1 sự kiện tồn kho thật xảy ra.
    const issueMovements = await countMovements(itemId, MovementType.ISSUE);
    expect(issueMovements).toBe(1);
  });

  it('kiểm kê khớp (COUNTER đếm đúng số hệ thống, MANAGER duyệt, 0 adjustment)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/wms/stock-counts')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);
    const stockCountId = createRes.body.data.id;

    const lines = createRes.body.data.items as {
      itemId: string;
      shelfId: string;
      lotId: string | null;
      systemQty: number;
    }[];
    const targetLine = lines.find(
      (l) => l.itemId === itemId && l.shelfId === mainShelfId,
    );
    expect(targetLine).toBeDefined();

    // Kho E2E này chỉ có duy nhất 1 item, nhưng InventoryStock không xoá dòng
    // khi quantity về 0 (upsertInventory chỉ $inc) và findInventoryByScope
    // (dùng để auto-generate dòng kiểm kê) không lọc quantity > 0 — nên dòng
    // shelf staging (systemQty=0, hàng đã dời hết sang mainShelf ở Task 3) vẫn
    // xuất hiện trong `lines`. approveStockCount yêu cầu status=COMPLETED, mà
    // markCompletedIfAllCounted chỉ set COMPLETED khi MỌI dòng đã actualQty !=
    // null — nên phải đếm hết `lines`, không chỉ dòng mainShelf, nếu không
    // approve bên dưới sẽ ném STOCK_COUNT_NOT_COMPLETED.
    const stagingLine = lines.find(
      (l) => l.itemId === itemId && l.shelfId === stagingShelfId,
    );
    expect(stagingLine).toBeDefined();
    expect(stagingLine!.systemQty).toBe(0);
    // Sanity check: dòng staging thật sự trỏ đúng shelf đã tạo ở Task 3 (khớp
    // code) — xác nhận auto-generate không lẫn sang shelf khác trong kho.
    const stagingShelfDoc = await shelfModel.findById(stagingShelfId).lean();
    expect(stagingShelfDoc?.code).toBe(stagingShelfCode);

    for (const line of lines) {
      await request(app.getHttpServer())
        .post(
          `/api/wms/stock-counts/${stockCountId}/items/${line.itemId}/count`,
        )
        .set('Authorization', `Bearer ${counterToken}`)
        .send({
          shelfId: line.shelfId,
          lotId: line.lotId ?? undefined,
          actualQty: line.systemQty,
        })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/wms/stock-counts/${stockCountId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({})
      .expect(201);

    const adjustMovements = await countMovements(itemId, MovementType.ADJUST);
    expect(adjustMovements).toBe(0);
  });

  it('bất biến cuối kịch bản: onHand = ΣInventoryStock, tổng movement = 4 (RECEIVE 1 + PUTAWAY 2 + ISSUE 1), 0 ADJUST', async () => {
    await assertTwoLayerInvariant(itemId);
    // Đếm lại thủ công theo type để hand-trace đúng tổng, tránh giả định nhầm
    // như bug đã bị review phát hiện ở Task 3 (PUTAWAY tưởng 1 dòng, thực ra
    // 2): RECEIVE=1 (GRN confirm) + PUTAWAY=2 (dời staging→main, 2 dòng ±) +
    // ISSUE=1 (xuất kho, chỉ 1 shelf) = 4 dòng thật sự — KHÔNG phải 3.
    const receiveMovements = await countMovements(itemId, MovementType.RECEIVE);
    const putawayMovements = await countMovements(itemId, MovementType.PUTAWAY);
    const issueMovements = await countMovements(itemId, MovementType.ISSUE);
    const adjustMovements = await countMovements(itemId, MovementType.ADJUST);
    expect(receiveMovements).toBe(1);
    expect(putawayMovements).toBe(2);
    expect(issueMovements).toBe(1);
    expect(adjustMovements).toBe(0);

    const totalMovements = await stockMovementModel.countDocuments({
      itemId,
    });
    expect(totalMovements).toBe(4);
  });
});
