# Rule: Auth & cấu trúc module

## Auth — tách biệt mỗi app, secret riêng

| Loại user | App | Collection | JWT secret | Hạn token | Claim `type` |
|---|---|---|---|---|---|
| Staff / Manager / Admin | WMS | `users` | `WMS_JWT_SECRET` | ngắn (`WMS_JWT_EXPIRES_IN`, ~8h) | `user` (`WMS`) |
| Khách hàng | Ecommerce | `customers` | `ECOM_JWT_SECRET` | dài (`ECOM_JWT_EXPIRES_IN`, ~30d) | `customer` (`CUSTOMER`) |

- Secret khác nhau ⇒ token chéo app **không dùng được**. Đừng share secret giữa app.
- `users` (wms_db) là **danh bạ nhân viên DUY NHẤT** cho cả kho lẫn back-office shop. Route admin của Ecommerce **validate token tại chỗ bằng shared secret**, KHÔNG đọc chéo `wms_db`.
- `libs/auth` chỉ chứa **utilities dùng chung** (guard `@Roles`, decorator `@CurrentUser`, interface JWT payload) — **không** chứa business logic. Mỗi app tự có module auth riêng (controller/service/jwt.strategy) trong `apps/<app>/src/...`.
- `RolesGuard`: cho qua nếu `user.roles` chứa ít nhất một role yêu cầu; `ADMIN` luôn bypass. Roles WMS: `ADMIN`/`MANAGER`/`RECEIVER`/`PICKER`/`PRINTER`/`COUNTER`.

> Lưu ý: nhiều file trong `libs/auth`, `libs/common`, `libs/database`, `libs/shared-types` hiện còn là **khung rỗng** (service `@Injectable` trống). Khi hiện thực, đặt utility dùng chung vào đây thay vì lặp lại trong từng app.

## Cấu trúc module NestJS

- Tổ chức theo **miền nghiệp vụ**: `apps/<app>/src/<domain>/<domain>.module.ts` (+ service/controller/consumer). Ví dụ: `apps/wms/src/stock/`, `apps/ecommerce/src/catalog/`.
- Root module mỗi app (`AppModule` / `EcommerceModule` / `NotificationModule`) import:
  - `ConfigModule.forRoot({ isGlobal: true })`
  - `DatabaseModule.forApp('<APP>_DATABASE_URL')` từ `@app/database` (Mongoose, nối đúng DB)
  - `EventsModule` nếu app có produce/consume event
  - các domain module
- Module nào produce/consume event phải tự `BullModule.registerQueue({ name: QUEUES.X })` cho queue nó dùng (xem rule events).
- Service export ra khỏi module bằng `exports` khi domain khác cần (vd `StockModule` export `StockService`).

## Routing & cấu hình app

- Prefix toàn cục đặt trong `main.ts`: WMS = `api/wms`, Ecommerce = `api/shop`. Giữ nguyên quy ước này khi thêm controller.
- Port lấy từ env (`WMS_PORT`/`ECOM_PORT`/`NOTIFICATION_PORT`).
- Đã có `helmet`, `class-validator`, `class-transformer` trong deps → dùng `ValidationPipe` + DTO `class-validator` cho input, `helmet` cho security header khi bổ sung.

## Notification app

Hiện là **stub** (chưa nối `EventsModule`/queue). Khi hiện thực: cho nó consume `QUEUES.NOTIFICATION` (các event `stock.low`, `payment.success`, `customer.verify_requested`…), tự import `EventsModule` + `registerQueue`. Đây là consumer thuần, không phát event đi đâu.
