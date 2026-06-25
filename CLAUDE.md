# WMS-ECOM Backend — Hướng dẫn cho Claude

Backend NestJS **monorepo mode** (native, không Nx/Turborepo) cho hệ thống WMS (quản lý kho) + Ecommerce (bán hàng) + Notification. Mỗi app build/deploy độc lập, mỗi app có **DB logic riêng**, đồng bộ với nhau **chỉ bằng event** (BullMQ + Redis).

> ⚠️ Kiến trúc này còn mới với chủ dự án. Khi làm việc: giải thích ngắn gọn *vì sao* làm theo cách này, đừng chỉ đưa code. Giữ comment tiếng Việt như phần còn lại của codebase.

## Bản đồ nhanh

| Thành phần | Vai trò | DB | Port (env) |
|---|---|---|---|
| `apps/wms` (root project) | Kho: nhập/xuất/kiểm/chuyển/in ly/shipping/auth nhân viên | `wms_db` | `WMS_PORT` (3001) |
| `apps/ecommerce` | Bán hàng: catalog/order/payment/auth khách | `ecom_db` | `ECOM_PORT` (3002) |
| `apps/notification` | Gửi thông báo (hiện là stub, chưa nối event) | — | `NOTIFICATION_PORT` (3000) |
| `libs/events` | Danh mục event + payload + cấu hình BullMQ dùng chung | — | — |
| `libs/auth` `libs/common` `libs/database` `libs/shared-types` | Utilities dùng chung (phần lớn còn là khung) | — | — |

## 4 luật bất biến (KHÔNG được vi phạm)

1. **Mỗi app có connection DB riêng. KHÔNG đọc chéo DB.** App này không bao giờ query collection của app kia. Liên kết xuyên app **chỉ** qua `sku` (khóa sync tồn) và id tham chiếu lưu dạng scalar (`orderId`, `fulfillWarehouseId`, `printJobId`…).
2. **Đồng bộ xuyên app = event, không phải gọi trực tiếp.** Producer ở app *sở hữu* nghiệp vụ, consumer ở app *nhận*. Payload truyền tối thiểu (sku + id), không nhồi cả entity.
3. **MongoDB qua Mongoose (`@nestjs/mongoose`).** Mỗi app kết nối DB riêng bằng `DatabaseModule.forApp('<APP>_DATABASE_URL')` (từ `@app/database`). Không dùng Prisma nữa.
4. **Auth tách biệt mỗi app, secret JWT riêng.** Token WMS không dùng được ở Ecommerce và ngược lại.

## Lệnh hay dùng

```bash
pnpm start:wms          # hoặc start:ecom / start:notification (watch mode)
pnpm lint   # eslint --fix      pnpm test   # jest      pnpm build
```

> Mongoose tự đồng bộ collection theo schema khi chạy app — không có bước generate/migrate riêng như Prisma.

## Quy ước chung

- Import lib qua path alias `@app/*` (xem `tsconfig.json`). **Apps không import lẫn nhau**, chỉ import `libs/*`.
- Schema Mongoose đặt trong từng module (`apps/<app>/src/<domain>/schemas/*.schema.ts`), đăng ký bằng `MongooseModule.forFeature([...])`. Giữ tên collection snake_case cũ qua `@Schema({ collection: '...' })`.
- Khớp phong cách hiện có: NestJS module/service/controller, decorator, comment tiếng Việt giải thích *vì sao*.
- Tài liệu nguồn nằm ở `../docs/overview/` (`data-ownership.md`, `erd.dbml`, `main-flow.md`, `nestjs-monorepo.md`). Code là nguồn sự thật khi lệch với docs (xem rules kiến trúc).

## Rules chi tiết theo chủ đề

@.claude/rules/architecture.md
@.claude/rules/data-and-mongoose.md
@.claude/rules/events.md
@.claude/rules/auth-and-modules.md
@.claude/rules/dto-conventions.md
@.claude/rules/error-handling.md
