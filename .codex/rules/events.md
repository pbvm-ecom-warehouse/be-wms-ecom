# Rule: Event đồng bộ (BullMQ + Redis qua `libs/events`)

`libs/events` là **hợp đồng (contract) duy nhất** giữa các app. Mọi giao tiếp xuyên app đi qua đây — không gọi HTTP chéo, không đọc DB chéo.

## Cấu trúc `libs/events/src/events.ts`

- `QUEUES` — tên các BullMQ queue, nhóm theo miền (`STOCK`, `ORDER`, `PRINT`, `SHIPMENT`, `NOTIFICATION`). 1 event = 1 *job name* trên 1 queue.
- `EVENTS` — tên job (vd `stock.changed`, `order.placed`).
- `*Payload` interface — payload cho từng event (tối thiểu: sku + id tham chiếu).
- `EventPayloadMap` — map `event → payload` để producer/consumer type-safe.
- `EventsModule` (`events.module.ts`) — `BullModule.forRootAsync` cấu hình kết nối Redis (`REDIS_HOST`/`REDIS_PORT`) + `defaultJobOptions` (retry 5 lần, backoff exponential). Import ở **root module mỗi app**.

## Thêm một event mới — checklist

1. **Khai báo trong `libs/events/src/events.ts`**: thêm vào `QUEUES` (nếu cần queue mới), thêm tên vào `EVENTS`, tạo `interface XxxPayload`, đăng ký vào `EventPayloadMap`.
2. **Producer** (app sở hữu nghiệp vụ): inject queue + `add`.
   ```ts
   @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue
   await this.stockQueue.add(EVENTS.STOCK_CHANGED, payload); // payload: StockChangedPayload
   ```
   Module của producer phải `imports: [BullModule.registerQueue({ name: QUEUES.STOCK })]`.
3. **Consumer** (app nhận): `@Processor(QUEUES.STOCK)` extends `WorkerHost`, `switch (job.name)` theo `EVENTS.*`, cast `job.data as XxxPayload`. Đăng ký consumer làm provider; module `imports: [BullModule.registerQueue({ name: QUEUES.STOCK })]`. Job lạ → `logger.warn`, đừng throw.
4. Đảm bảo app đã import `EventsModule` ở root module.

## Mẫu chuẩn trong repo (copy theo)

- Producer: `apps/wms/src/stock/stock.service.ts` (`emitStockChanged`).
- Consumer: `apps/ecommerce/src/catalog/stock.consumer.ts` (cộng dồn `availableQty` theo delta, **không** đọc `wms_db`).

## Nguyên tắc payload

- **Tối thiểu**: chỉ `sku` + id tham chiếu + số liệu cần thiết. Không nhồi cả entity, không gửi field mà bên nhận không dùng.
- `delta > 0` = tăng tồn, `delta < 0` = giảm tồn.
- Producer = app **sở hữu** nghiệp vụ; consumer = app **nhận hệ quả**. Hướng đã ghi chú sẵn cạnh mỗi event trong `events.ts` (vd `// Ecom → WMS`). Tôn trọng hướng đó.

## Idempotency & retry

- Job retry tới 5 lần (backoff exponential) → **consumer phải idempotent**: xử lý cùng job 2 lần không được sai số liệu (vd dùng key idempotency, hoặc thao tác cộng dồn an toàn / kiểm tra trạng thái trước khi áp).
- Với callback cổng thanh toán: dùng `providerTxnId @unique` làm khóa idempotency.

## Saga reserve tồn (luồng quan trọng nhất — đừng làm bằng transaction xuyên DB)

```
Ecom checkout → STOCK_RESERVE_REQUESTED ─▶ WMS giữ tồn
WMS ─ STOCK_RESERVED ─▶ Ecom (lưu fulfillWarehouseId, đơn đi tiếp)
WMS ─ STOCK_RESERVE_FAILED ─▶ Ecom (không đủ tồn → hủy đơn)
Ecom hủy đơn → STOCK_RELEASE_REQUESTED ─▶ WMS bù tồn
```

Đây là cơ chế chống oversell **bất đồng bộ**. Không thay bằng đọc/ghi xuyên DB.
