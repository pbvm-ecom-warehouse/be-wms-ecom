# Rule: Dữ liệu & Mongoose (MongoDB, DB-per-app)

Dự án dùng **`@nestjs/mongoose` + `mongoose`** (đã bỏ Prisma). Mỗi app kết nối logical DB riêng, không đọc chéo.

## Kết nối DB mỗi app

- Connection do `DatabaseModule.forApp('<APP>_DATABASE_URL')` (trong `libs/database`, export qua `@app/database`) tạo bằng `MongooseModule.forRootAsync` đọc URI từ `ConfigService.getOrThrow`.
- WMS: `DatabaseModule.forApp('WMS_DATABASE_URL')` → `wms_db`. Ecommerce: `DatabaseModule.forApp('ECOM_DATABASE_URL')` → `ecom_db`.
- 2 logical DB **cùng 1 cluster MongoDB**, khác tên database ở cuối URI. Mỗi app là process Nest riêng nên mỗi app chỉ có 1 connection mặc định — không cần named connection.
- **Không có bước generate/migrate.** Mongoose tự áp schema/index khi app khởi động. (Khác Prisma: bỏ hẳn `prisma generate` / `db push`.)

## Định nghĩa schema

- Mỗi entity = 1 file `apps/<app>/src/<domain>/schemas/<name>.schema.ts` dùng `@Schema`/`@Prop` + `SchemaFactory.createForClass`.
- **Giữ nguyên tên collection snake_case cũ**: `@Schema({ collection: 'warehouse_items', timestamps: true })`. Đừng để Mongoose tự số-nhiều-hóa tên class.
- Đăng ký model trong module bằng `MongooseModule.forFeature([{ name: X.name, schema: XSchema }])`, rồi inject `@InjectModel(X.name) model: Model<X>`.
- Export type document: `export type XDocument = HydratedDocument<X>`.
- Mẫu chuẩn để copy: `apps/wms/src/stock/schemas/warehouse-item.schema.ts`, `apps/ecommerce/src/catalog/schemas/product-variant.schema.ts`.

## Map khái niệm Prisma → Mongoose (khi convert tiếp các model)

| Prisma | Mongoose |
|---|---|
| `@id @default(auto()) @map("_id") @db.ObjectId` | `_id` mặc định của Mongoose (không cần khai báo) |
| `String @db.ObjectId` (ref scalar) | `@Prop({ type: SchemaTypes.ObjectId })` hoặc `String` — vẫn là **id tham chiếu, KHÔNG dựng populate xuyên app** |
| `@unique` | `@Prop({ unique: true })` |
| `enum` Prisma | TS `enum` + `@Prop({ enum: MyEnum })` |
| `Json` | `@Prop({ type: Object })` / `MongooseSchema.Types.Mixed` |
| composite `type {}` (Address, AltUnit…) | sub-schema (`@Schema()` lồng) hoặc `@Prop` với type sub-document |
| `createdAt`/`updatedAt` | `@Schema({ timestamps: true })` |
| `db push` | tự sync khi chạy app |

> Các file `apps/*/prisma/schema.prisma` **vẫn còn, nhưng chỉ là bản đặc tả tham chiếu** để dịch dần sang Mongoose — không còn được Prisma đọc. Xóa dần khi từng domain đã convert xong.

## Liên kết dữ liệu (KHÔNG đổi so với trước)

- **Khóa sync xuyên app: `sku`** (`@Prop({ unique: true })` ở `WarehouseItem` và `ProductVariant`).
- **Ref xuyên app**: lưu ObjectId/string scalar (`orderId`, `fulfillWarehouseId`, `printJobId`…). **KHÔNG** `populate` xuyên app; hạn chế cả `ref/populate` nội bộ — ưu tiên "link bằng id, đồng bộ qua event".
- `availableQty` (Ecom) chỉ là **bản copy** do WMS sync; nguồn sự thật tồn là `StockBalance` bên WMS.

## Quy ước Audit (BẮT BUỘC — xem `docs/overview/data-ownership.md`)

| Nhóm | Field audit | Mongoose |
|---|---|---|
| **Master / catalog / config** | `createdBy`,`updatedBy`,`createdAt`,`updatedAt`,`deletedAt` (**soft-delete**) | `timestamps:true` + prop `deletedAt?: Date`; filter `deletedAt: null` khi query |
| **Chứng từ giao dịch** (PO, GRN, `orders`, `shipments`…) | `createdAt`,`updatedAt` + người tạo/duyệt. **Hủy bằng `status`, KHÔNG soft-delete** | `timestamps:true` |
| **Sổ cái append-only** (`stock_movements`,`payment_transactions`) | **CHỈ** `createdAt`+`createdBy` — **BẤT BIẾN** | `@Schema({ timestamps: { createdAt: true, updatedAt: false } })`, không cho update |
| **Bảng dòng `*Item`** | **không** audit | sub-document hoặc collection con |
| **Snapshot tồn** (`stock_balances`,`inventory_stocks`) | chỉ `updatedAt` | `timestamps:{createdAt:false,updatedAt:true}` |
| **Token** | `createdAt`+`revokedAt`/`usedAt` | prop tương ứng |

- Actor field (`createdBy`/`updatedBy`/`approvedBy`) là ObjectId trỏ `users` (nhân viên WMS). `designs`/`orders` do khách sở hữu → `customerId`.
- Khi thêm collection mới: xác định nhóm rồi áp đúng khối audit. Đừng tự thêm `deletedAt` cho chứng từ/sổ cái.

## MongoDB transaction

- Transaction Mongoose (`session.withTransaction`) cần **replica set** (Atlas có sẵn; local: `mongod --replSet rs0` + `rs.initiate()`).
- Nhắc lại: **không** transaction xuyên 2 DB. Phối hợp xuyên app đi qua event/saga (xem `architecture.md`).
