# Rule: Kiến trúc tổng thể (DB-per-app + event sync)

## Mô hình

```
        ┌─────────────┐   event (BullMQ/Redis)   ┌──────────────┐
        │   apps/wms  │  ───────────────────────▶ │ apps/ecommerce│
        │   → wms_db  │  ◀─────────────────────── │   → ecom_db   │
        └─────────────┘                            └──────────────┘
                │                                          │
                └──────────► apps/notification ◀───────────┘
                              (consumer thông báo)

  libs/events  = hợp đồng (contract) event giữa các app — import ở mọi nơi
```

- **NestJS monorepo mode**: `nest-cli.json` khai báo nhiều `projects`. App có `type: application`, lib có `type: library`. `apps/wms` là root project mặc định (`nest start` không kèm tên = chạy wms).
- Mỗi app có `main.ts` riêng, bootstrap NestFactory riêng, build độc lập (`nest build <app>`).

## Vì sao tách DB + event (không phải 1 DB / không gọi REST chéo)

WMS và Ecommerce nhìn cùng một sản phẩm theo 2 góc khác nhau (WMS: sku/vị trí kho/số lượng; Ecom: tên/ảnh/giá/SEO). Tách DB để mỗi app sở hữu trọn domain của mình, đổi schema không ảnh hưởng app kia. Liên kết **duy nhất** giữa 2 bên là `sku`.

## ⚠️ Lệch có chủ đích so với docs — theo CODE

`docs/overview/data-ownership.md` viết: *"cùng cluster nên transaction atomic xuyên 2 DB vẫn làm được… không phải dùng Saga."*

**Dự án KHÔNG đi theo hướng đó.** Quyết định thực tế (phản ánh trong code):

- **Không transaction xuyên DB, không đọc chéo DB.** Hai connection Mongoose tách biệt hoàn toàn.
- **Reserve tồn lúc checkout làm bằng SAGA bất đồng bộ qua event**, không phải transaction xuyên DB:
  `STOCK_RESERVE_REQUESTED` (Ecom→WMS) → `STOCK_RESERVED` / `STOCK_RESERVE_FAILED` (WMS→Ecom) → nếu fail thì Ecom hủy đơn; hủy đơn thì `STOCK_RELEASE_REQUESTED` (Ecom→WMS) bù lại.

Khi code mâu thuẫn với docs về điểm này → **theo code + theo rule này**. Đừng đề xuất transaction xuyên DB.

## Đường đồng bộ tồn kho (`availableQty` bên Ecom là BẢN COPY)

`available = StockBalance.onHand − reserved − expired` (tổng gộp **mọi kho** của 1 sku). Có 2 đường cập nhật, không trùng đếm:

- **Đường 1 — biến động phía WMS** (nhập kho/kiểm/chuyển/in/hết hạn): WMS phát `stock.changed`/`stock.expired` (delta + hoặc −), Ecom consumer cộng dồn `ProductVariant.availableQty`.
- **Đường 2 — reserve/release lúc checkout/hủy** (Ecom khởi xướng): Ecom tự trừ/cộng `availableQty` ngay trong transaction của mình, **không** đi qua event đường 1 (tránh trừ 2 lần). Phối hợp với WMS qua saga reserve ở trên.

> Lúc PICKER xuất kho thật: `onHand −= n` và `reserved −= n` → `available` **không đổi** → **không** bắn `stock.changed`.

## Khi thêm app mới

1. Thêm project vào `nest-cli.json`. 2. Tạo `apps/<app>/src/main.ts`; nếu cần DB thì import `DatabaseModule.forApp('<APP>_DATABASE_URL')` ở root module. 3. Import `EventsModule` ở root module để nối BullMQ. 4. Thêm script `start:<app>` vào `package.json` và biến `<APP>_DATABASE_URL` vào `.env` + schema env.
