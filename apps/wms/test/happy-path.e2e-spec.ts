import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import { setupApp } from '@app/common';
import { QUEUES } from '@app/events';
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

/**
 * E2E happy-path WMS (S4-05): login → PO → GRN CONFIRMED (onHand+) → put-away
 * (+ gợi ý) → xuất hàng (onHand-, goods.issued) → kiểm kê khớp. Assert bất biến
 * 2 lớp tồn kho sau mỗi bước quan trọng.
 *
 * File này (phần 1 — Task 3) cover: bootstrap/login, warehouse/zone/rack/shelf,
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
  // orderQueue + goodsIssueRepo: gán ở beforeAll nhưng chỉ được ĐỌC ở phần
  // goods-issue (Task 4, nối tiếp cùng file này) — khai báo sẵn ở đây vì
  // beforeAll chỉ chạy 1 lần cho toàn bộ describe. eslint-disable vì phần 1
  // (Task 3) chưa có `it` nào dùng tới.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let orderQueue: Queue;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let goodsIssueRepo: GoodsIssueRepository;

  let adminToken: string;
  let managerToken: string;
  let receiverToken: string;
  // pickerToken + counterToken: login ở Task 3 (Step 3) nhưng chỉ dùng ở
  // Task 4 (PICKER xuất hàng, COUNTER kiểm kê) — giữ ở đây để tránh gọi
  // /auth/login thêm lần nữa (xem cảnh báo throttle 5 req/60s trong brief).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let pickerToken: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let counterToken: string;

  let warehouseId: string;
  let stagingShelfId: string;
  // stagingShelfCode: gán ở Step 4 (tạo shelf) nhưng chỉ dùng ở Task 4 khi
  // PICKER quét mã shelf staging lúc xuất hàng.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    }).compile();
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
    orderQueue = app.get(getQueueToken(QUEUES.ORDER));
    goodsIssueRepo = app.get(GoodsIssueRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  /**
   * Bất biến 2 lớp tồn kho: onHand (lớp 1, snapshot tổng) phải luôn khớp
   * tổng quantity của mọi InventoryStock (lớp 2, chi tiết theo shelf/lot)
   * cho cùng (item, warehouse). Đọc thẳng model thay vì qua HTTP vì không
   * có endpoint trả StockBalance trực tiếp (xem design doc — "Điểm mở").
   */
  async function assertTwoLayerInvariant(
    checkItemId: string,
    checkWarehouseId: string,
  ): Promise<{ onHand: number; sumInventory: number }> {
    const balance = await stockBalanceModel
      .findOne({ itemId: checkItemId, warehouseId: checkWarehouseId })
      .lean();
    expect(balance).not.toBeNull();
    const inventoryRows = await inventoryStockModel
      .find({ itemId: checkItemId, warehouseId: checkWarehouseId })
      .lean();
    const sumInventory = inventoryRows.reduce((sum, r) => sum + r.quantity, 0);
    expect(balance?.onHand).toBe(sumInventory);
    return { onHand: balance?.onHand ?? 0, sumInventory };
  }

  async function countMovements(
    checkItemId: string,
    checkWarehouseId: string,
    type: MovementType,
  ): Promise<number> {
    return stockMovementModel.countDocuments({
      itemId: checkItemId,
      warehouseId: checkWarehouseId,
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
        .post('/api/wms/auth/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'E2ePass123!', roles: [role] })
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

  it('MANAGER tạo warehouse/zone/rack/shelf(staging+chính)', async () => {
    const whRes = await request(app.getHttpServer())
      .post('/api/wms/warehouse')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ name: `Kho E2E ${uniqueSuffix}`, address: 'Địa chỉ test' })
      .expect(201);
    warehouseId = whRes.body.data.id;

    const zoneRes = await request(app.getHttpServer())
      .post('/api/wms/warehouse/zones')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ warehouseId, name: 'Khu A', code: `E2E-A-${uniqueSuffix}` })
      .expect(201);
    const zoneId = zoneRes.body.data.id;

    const rackRes = await request(app.getHttpServer())
      .post('/api/wms/warehouse/racks')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ zoneId, name: 'Kệ A1', code: `E2E-A1-${uniqueSuffix}` })
      .expect(201);
    const rackId = rackRes.body.data.id;

    const stagingRes = await request(app.getHttpServer())
      .post('/api/wms/warehouse/shelves')
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
      .post('/api/wms/warehouse/shelves')
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
        warehouseId,
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
      .send({
        purchaseOrderId,
        items: [{ itemId, sku: itemSku, actualQty: RECEIVE_QTY, unit: 'cái' }],
      })
      .expect(201);
    grnId = grnRes.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/wms/goods-receipt-notes/${grnId}/confirm`)
      .set('Authorization', `Bearer ${receiverToken}`)
      .send()
      .expect(201);

    const { onHand } = await assertTwoLayerInvariant(itemId, warehouseId);
    expect(onHand).toBe(RECEIVE_QTY);
    const receiveMovements = await countMovements(
      itemId,
      warehouseId,
      MovementType.RECEIVE,
    );
    expect(receiveMovements).toBe(1);
  });

  it('GET gợi ý put-away rồi confirm-line dời hàng staging → shelf chính', async () => {
    const suggestRes = await request(app.getHttpServer())
      .get('/api/wms/putaway/suggestions')
      .query({ sku: itemSku, qty: RECEIVE_QTY, warehouseId })
      .set('Authorization', `Bearer ${receiverToken}`)
      .expect(200);
    expect(suggestRes.body.data.warning).toBeNull();
    expect(suggestRes.body.data.suggestions.length).toBeGreaterThan(0);

    const tasksRes = await request(app.getHttpServer())
      .get('/api/wms/putaway-tasks')
      .query({ warehouseId, status: 'PENDING' })
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

    const { onHand } = await assertTwoLayerInvariant(itemId, warehouseId);
    expect(onHand).toBe(RECEIVE_QTY); // put-away chỉ dời vị trí, KHÔNG đổi onHand
    // confirmLine ghi 2 dòng movement PUTAWAY trong cùng transaction: 1 dòng âm
    // ở shelf staging (hàng rời đi) + 1 dòng dương ở shelf đích (hàng đến),
    // cùng itemId+warehouseId (chỉ khác shelfId). countMovements không lọc theo
    // shelfId nên đếm cả 2 — đúng bản chất là 2 sự kiện tồn kho thật đã xảy ra.
    const putawayMovements = await countMovements(
      itemId,
      warehouseId,
      MovementType.PUTAWAY,
    );
    expect(putawayMovements).toBe(2);

    const stagingRow = await inventoryStockModel
      .findOne({ itemId, warehouseId, shelfId: stagingShelfId })
      .lean();
    expect(stagingRow?.quantity ?? 0).toBe(0);
    const mainRow = await inventoryStockModel
      .findOne({ itemId, warehouseId, shelfId: mainShelfId })
      .lean();
    expect(mainRow?.quantity).toBe(RECEIVE_QTY);
  });

  // Task 4 nối tiếp tại đây: goods-issue qua queue (order.ready_to_fulfill),
  // stock-count, và assertion bất biến cuối cùng. Các biến pickerToken,
  // counterToken, orderQueue, goodsIssueRepo, stagingShelfId, purchaseOrderId
  // đã sẵn sàng ở phần này để Task 4 dùng tiếp.
});
