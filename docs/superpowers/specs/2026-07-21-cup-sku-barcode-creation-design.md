# Tạo mặt hàng ly với SKU có ý nghĩa và barcode EAN-13 — Design Spec

**Ngày:** 2026-07-21  
**Scope:** WMS — tạo `CUP_BLANK`, danh mục thuộc tính SKU và barcode nội bộ  
**Trạng thái:** Approved, chờ implementation

---

## Mục tiêu

- Người dùng không nhập hoặc sửa SKU trực tiếp.
- SKU `CUP_BLANK` được sinh từ template theo loại mặt hàng:
  `CUP-{CUP_STYLE}-{MATERIAL}-{CAPACITY}-{COLOR}`.
- ADMIN quản lý các lựa chọn dùng để sinh SKU trong database; thêm lựa chọn mới
  không cần sửa FE.
- Mỗi mặt hàng mới nhận một barcode nội bộ EAN-13 dạng số, do BE sinh và bảo
  đảm duy nhất.
- Barcode của nhà sản xuất/NCC được lưu riêng dưới dạng mã thay thế và không
  được xung đột với bất kỳ barcode nào khác trong WMS.

Ví dụ:

```text
Kiểu ly: Ly nắp tim (HRT)
Chất liệu: PET (PET)
Dung tích: 500 ml (500)
Màu sắc: Trong suốt (CLR)

SKU:     CUP-HRT-PET-500-CLR
Barcode: 20xxxxxxxxxxC
```

`C` là chữ số checksum EAN-13.

---

## Phạm vi

### Trong scope

- Template và form tạo `CUP_BLANK`.
- Danh mục `CUP_STYLE`, `MATERIAL`, `CAPACITY`, `COLOR` do ADMIN quản lý.
- Gợi ý code khi ADMIN tạo lựa chọn; ADMIN phải xác nhận trước khi lưu.
- Preview và kiểm tra khả dụng của SKU.
- BE sinh lại SKU khi tạo, không tin SKU do client ghép.
- Sinh barcode EAN-13 nội bộ với prefix `20`.
- Đăng ký duy nhất barcode chính và barcode thay thế.
- Backfill registry từ barcode hiện có trước khi bật unique enforcement.
- Màn hình kết quả sau khi tạo để sao chép mã và in tem.

### Ngoài scope

- Template SKU chi tiết cho `MATERIAL` và `PACKAGING`; cần chốt thuộc tính
  nghiệp vụ riêng trước khi triển khai.
- Tạo thủ công `CUP_PRINTED`; loại này tiếp tục được tạo từ print job theo
  blank SKU và design code.
- Tạo hàng loạt bằng ma trận biến thể.
- Thiết kế nội dung/PDF tem in mới; FE chỉ gọi lại khả năng in tem hiện có hoặc
  để nút in ở trạng thái chưa khả dụng nếu endpoint in chưa tồn tại.
- Đồng bộ snapshot tồn sang Ecommerce; đây là issue kiến trúc riêng.

---

## Quy tắc nghiệp vụ

### 1. SKU

- SKU cuối cùng do BE sinh từ các option ID, không nhận chuỗi SKU làm nguồn sự
  thật từ FE.
- Template `CUP_BLANK` cố định trong phiên bản này:

```text
CUP-{CUP_STYLE}-{MATERIAL}-{CAPACITY}-{COLOR}
```

- Mỗi segment được chuẩn hóa thành chữ hoa và chỉ chứa `[A-Z0-9]`.
- SKU chỉ chứa `[A-Z0-9-]`, không có dấu cách, không có hai dấu `-` liên tiếp.
- SKU immutable sau khi tạo.
- SKU unique toàn bộ `warehouse_items`, kể cả item đã soft-delete.
- Preview từ FE chỉ phục vụ UX; endpoint create luôn tải lại option, ghép lại
  SKU và kiểm tra unique.
- Mongo duplicate key `11000` phải được map thành `STOCK_ITEM_SKU_CONFLICT` để
  xử lý race condition giữa hai request tạo đồng thời.

### 2. Danh mục thuộc tính

Các nhóm dùng cho `CUP_BLANK`:

| Key | Tên hiển thị | Ví dụ |
|---|---|---|
| `CUP_STYLE` | Kiểu ly | Ly tròn `RND`, Ly vuông `SQR`, Ly nắp tim `HRT` |
| `MATERIAL` | Chất liệu | PET `PET`, PLA `PLA` |
| `CAPACITY` | Dung tích | 350 ml `350`, 500 ml `500` |
| `COLOR` | Màu sắc | Trong suốt `CLR`, Đỏ `RED` |

Quy tắc option:

- ADMIN được tạo, đổi tên, thay `sortOrder` và bật/tắt option.
- `code` unique trong cùng một nhóm.
- Không xóa vật lý option đã được dùng.
- Không sửa `code` sau khi option đã được dùng tạo WarehouseItem.
- Option inactive không xuất hiện trong form tạo mới, nhưng item cũ vẫn hiển
  thị snapshot tên/code đã lưu.
- Gợi ý code là hỗ trợ nhập liệu, không tự lưu. ADMIN luôn phải xác nhận.
- Thuật toán gợi ý không dịch ngôn ngữ: bỏ dấu, viết hoa; nhiều từ lấy chữ cái
  đầu (tối đa 6), một từ lấy tối đa 6 ký tự đầu. Ví dụ `Ly nắp tim` gợi ý
  `LNT`; ADMIN có thể đổi thành `HRT` trước khi lưu.

WarehouseItem lưu cả tham chiếu option và snapshot để lịch sử không đổi khi
ADMIN đổi tên hiển thị:

```json
{
  "key": "CUP_STYLE",
  "optionId": "64b7f1d2c3a4e5f607182930",
  "name": "Kiểu ly",
  "value": "Ly nắp tim",
  "code": "HRT"
}
```

Collection option:

```text
item_attribute_options
  key         CUP_STYLE | MATERIAL | CAPACITY | COLOR
  name        String
  code        String
  isActive    Boolean
  sortOrder   Number
  createdBy   ObjectId
  updatedBy   ObjectId
  deletedAt   Date | null
```

Index unique `{ key: 1, code: 1 }`. Các key/template hợp lệ được định nghĩa ở
BE trong phiên bản này; ADMIN quản lý option value, không tự sửa cấu trúc
template.

### 3. Barcode

- Barcode chính do BE sinh sau khi đã xác định SKU, client không được gửi
  barcode chính khi tạo `CUP_BLANK`.
- Dùng EAN-13 restricted distribution với prefix nội bộ `20`.
- Cấu trúc: prefix 2 chữ số + sequence 10 chữ số + checksum 1 chữ số.
- Sequence được cấp bằng atomic counter để request đồng thời không nhận cùng
  barcode. Cho phép có khoảng trống sequence nếu transaction/request thất bại;
  không tái sử dụng số đã cấp.
- Checksum tính theo chuẩn EAN-13 và được kiểm tra lại trước khi lưu.
- Mỗi mã quét chỉ thuộc đúng một WarehouseItem, bất kể nó là barcode chính hay
  `altBarcode`.
- Mã thay thế được trim, chỉ nhận chuỗi không rỗng, loại trùng trong request và
  kiểm tra xung đột toàn hệ thống.

Để bảo đảm unique xuyên giữa barcode chính và mảng mã thay thế, dùng registry
riêng thay vì chỉ index `warehouse_items.barcode`:

```text
barcode_registry
  code       String unique
  itemId     ObjectId
  kind       PRIMARY | ALTERNATE
  createdAt  Date
```

Atomic counter dùng collection:

```text
barcode_counters
  prefix     String unique
  sequence   Number
```

BE dùng atomic `findOneAndUpdate` với `$inc: { sequence: 1 }` và option
`{ upsert: true, new: true }` để cấp sequence. Counter được cấp trước
transaction tạo item nên số đã cấp không được tái sử dụng nếu bước sau thất
bại.

Việc tạo WarehouseItem và đăng ký toàn bộ barcode chạy trong cùng MongoDB
transaction. Duplicate key được map thành lỗi barcode conflict có thông tin mã
bị trùng.

`findItemByBarcode` chuyển sang resolve qua registry để một mã quét luôn có đúng
một owner. Update `altBarcodes` phải diff mã cũ/mới và cập nhật registry trong
cùng transaction với WarehouseItem.

Trước khi bật registry, cung cấp script backfill đọc `barcode` và
`altBarcodes` của mọi WarehouseItem, kể cả soft-delete. Script chạy dry-run để
báo mã rỗng/trùng và item liên quan; chỉ ghi registry khi không còn collision.
Không tự chọn một item thắng khi dữ liệu cũ bị trùng.

---

## Thiết kế API BE

### API đọc template cho form

```http
GET /api/wms/stock/item-types/CUP_BLANK/sku-template
```

Response chứa prefix, thứ tự field và các option active:

```json
{
  "type": "CUP_BLANK",
  "prefix": "CUP",
  "fields": [
    { "key": "CUP_STYLE", "label": "Kiểu ly", "required": true, "options": [] },
    { "key": "MATERIAL", "label": "Chất liệu", "required": true, "options": [] },
    { "key": "CAPACITY", "label": "Dung tích", "required": true, "options": [] },
    { "key": "COLOR", "label": "Màu sắc", "required": true, "options": [] }
  ]
}
```

### API preview SKU

```http
POST /api/wms/stock/items/sku-preview
```

```json
{
  "type": "CUP_BLANK",
  "attributeOptionIds": {
    "CUP_STYLE": "64b7f1d2c3a4e5f607182930",
    "MATERIAL": "64b7f1d2c3a4e5f607182931",
    "CAPACITY": "64b7f1d2c3a4e5f607182932",
    "COLOR": "64b7f1d2c3a4e5f607182933"
  }
}
```

Response:

```json
{
  "sku": "CUP-HRT-PET-500-CLR",
  "available": true
}
```

Endpoint preview không reserve SKU. Race condition cuối cùng vẫn được xử lý ở
endpoint create bằng unique index.

### API tạo WarehouseItem

`POST /api/wms/stock/items` với `type=CUP_BLANK` nhận:

```json
{
  "name": "Ly PET nắp tim 500 ml trong suốt",
  "type": "CUP_BLANK",
  "unit": "cái",
  "attributeOptionIds": {
    "CUP_STYLE": "64b7f1d2c3a4e5f607182930",
    "MATERIAL": "64b7f1d2c3a4e5f607182931",
    "CAPACITY": "64b7f1d2c3a4e5f607182932",
    "COLOR": "64b7f1d2c3a4e5f607182933"
  },
  "altBarcodes": ["8938501234567"],
  "isPerishable": false,
  "minQuantity": 10,
  "depth": 10,
  "width": 8,
  "height": 12
}
```

Response trả SKU và barcode cuối cùng do BE sinh. Với các item type chưa được
chuyển sang template, contract cũ được giữ để không phá các luồng hiện tại.

### API quản trị option

```http
GET    /api/wms/stock/attribute-options?key=CUP_STYLE&includeInactive=true
POST   /api/wms/stock/attribute-options/code-suggestion
POST   /api/wms/stock/attribute-options
PATCH  /api/wms/stock/attribute-options/:id
```

- Chỉ ADMIN được tạo/cập nhật.
- MANAGER được đọc các option active để tạo mặt hàng.
- PATCH không cho đổi `code` nếu option đã được dùng.

### Error contract

| Code | Khi nào |
|---|---|
| `STOCK_SKU_TEMPLATE_NOT_FOUND` | Type chưa có template ở endpoint template/preview |
| `STOCK_ATTRIBUTE_OPTION_NOT_FOUND` | Option không tồn tại hoặc không đúng group |
| `STOCK_ATTRIBUTE_OPTION_INACTIVE` | Dùng option inactive để tạo item mới |
| `STOCK_ATTRIBUTE_CODE_CONFLICT` | Code trùng trong một group |
| `STOCK_ATTRIBUTE_CODE_IMMUTABLE` | Sửa code đã được sử dụng |
| `STOCK_ITEM_SKU_CONFLICT` | SKU cuối cùng đã tồn tại/race duplicate key |
| `STOCK_ITEM_BARCODE_CONFLICT` | Barcode chính hoặc thay thế đã thuộc item khác |

---

## Thiết kế giao diện FE

### Form một trang

Giữ form một trang thay vì wizard để thao tác tạo một mặt hàng nhanh. Khi chọn
`CUP_BLANK`, FE gọi template API và render field theo thứ tự BE trả về.

```text
Thông tin cơ bản
  Loại mặt hàng *   Tên nội bộ *   Đơn vị cơ sở *

Cấu hình SKU
  Kiểu ly *    Chất liệu *    Dung tích *    Màu sắc *
  Ly nắp tim   PET             500 ml         Trong suốt

  SKU được tạo
  CUP-HRT-PET-500-CLR                         ✓ Có thể sử dụng

Mã vạch
  Barcode nội bộ: Hệ thống tự sinh EAN-13 sau khi tạo
  Mã NCC/nhà sản xuất: [Quét hoặc nhập mã] [+ Thêm mã]

Thông tin kho
  Hạn sử dụng, ngưỡng tồn, chiều sâu, chiều rộng, chiều cao

                                      [Hủy] [Tạo mặt hàng]
```

### Hành vi

- SKU là preview read-only, không có nút mở khóa hay sửa thủ công.
- Thay option làm cập nhật preview ngay trên client từ `code` đã tải.
- Sau khi người dùng ngừng thay đổi 300–500 ms, FE gọi preview API để kiểm tra
  lại SKU và trạng thái unique.
- Disable nút tạo khi thiếu field, preview chưa hợp lệ hoặc SKU đã tồn tại.
- `altBarcodes` hỗ trợ nhập hoặc nhận chuỗi từ máy quét, loại trùng ngay trong
  form nhưng vẫn hiển thị lỗi conflict trả về từ BE.
- Không hiển thị barcode nội bộ giả trước khi lưu.
- Sau khi tạo thành công, giữ panel kết quả trên màn hình:

```text
Tạo mặt hàng thành công
SKU: CUP-HRT-PET-500-CLR          [Sao chép]
Barcode: 2000000001234            [Sao chép] [In tem]
                                  [Tạo mặt hàng tiếp]
```

### Màn hình ADMIN quản lý option

- Tabs theo group: Kiểu ly, Chất liệu, Dung tích, Màu sắc.
- Danh sách có tên, code, trạng thái và thứ tự.
- Form thêm mới tự gọi/gợi ý code khi nhập tên; ADMIN phải xác nhận code.
- Khi option đã được dùng, field code read-only và giải thích lý do.
- Xóa được thay bằng bật/tắt trạng thái.

---

## Data flow

```text
FE chọn CUP_BLANK
  → GET template + option active
  → Người dùng chọn 4 option
  → FE ghép preview read-only
  → POST sku-preview (debounce)
  → Người dùng submit option IDs
  → BE tải và validate option
  → BE ghép SKU cuối cùng
  → BE cấp sequence + tính EAN-13
  → Transaction: create WarehouseItem + barcode registry
  → FE hiển thị SKU/barcode thật và hành động in tem
```

---

## Kiểm thử và tiêu chí nghiệm thu

### BE

- Unit test code suggestion, SKU builder và EAN-13 checksum.
- SKU builder không phụ thuộc thứ tự key trong request.
- Reject thiếu option, sai group, option inactive và option không tồn tại.
- Preview và create trả cùng SKU với cùng option.
- Không tin/không dùng SKU do client tự gửi cho `CUP_BLANK`.
- Hai request đồng thời cho cùng tổ hợp: một thành công, một nhận
  `STOCK_ITEM_SKU_CONFLICT`, không có lỗi 500.
- Hai request đồng thời khác SKU nhận hai barcode khác nhau.
- Barcode có đúng 13 chữ số, prefix `20` và checksum hợp lệ.
- Chặn xung đột primary-primary, primary-alternate và alternate-alternate.
- Backfill dry-run báo đầy đủ collision dữ liệu cũ và không ghi dở registry.
- Sau backfill sạch, quét mã resolve item qua registry.
- Update alt barcode cập nhật WarehouseItem và registry atomically.
- Không cho sửa code option đã được dùng; vẫn cho đổi tên hoặc deactivate.
- Existing tests của stock/put-away/goods-issue/print-job vẫn pass.

### FE

- Chọn `CUP_BLANK` tải đúng bốn field theo template.
- SKU thay đổi đúng khi đổi từng option và không thể chỉnh trực tiếp.
- Preview được debounce, không gọi API cho tổ hợp chưa đầy đủ.
- Trạng thái SKU trùng disable submit và hiển thị thông báo rõ ràng.
- Không hiển thị barcode nội bộ trước khi create thành công.
- Xử lý đúng lỗi SKU/barcode conflict từ BE, kể cả race sau preview.
- ADMIN tạo option với code gợi ý nhưng phải xác nhận trước khi lưu.
- Option inactive không xuất hiện trong form tạo mới.

---

## Chia issue

1. **BE:** danh mục option, SKU builder cho `CUP_BLANK`, preview API, EAN-13
   atomic counter và barcode registry.
2. **FE Warehouse:** form tạo `CUP_BLANK` theo template, preview SKU read-only,
   alt barcode, kết quả barcode và màn hình ADMIN quản lý option.

Hai issue liên kết qua API contract trong tài liệu này. FE có thể dựng UI với
mock response trước, nhưng chỉ hoàn tất integration sau khi BE cung cấp các
endpoint template, preview, create và option management.
