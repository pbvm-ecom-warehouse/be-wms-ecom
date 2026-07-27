# Warehouse 2D Map & Put-away Suggestion — Phân tích & Phương án

Status: CHỐT SCOPE — tất cả câu hỏi thiết kế đã có quyết định (mục 4a, 4b, 4c), sẵn sàng viết implementation plan
Phạm vi: `be/apps/wms` (location, put-away-suggestion) + `fe-pbvm-warehouse` (warehouse-layout, warehouse-navigation, warehouse-structure)

## 1. Bối cảnh — tại sao viết doc này

User muốn làm tính năng kho có vị trí theo **zone / rack / shelf**, hiển thị dạng **sơ đồ 2D**, và có **gợi ý vị trí đặt hàng (put-away suggestion)** dựa trên sơ đồ đó. Trước khi code, cần khảo sát kỹ hiện trạng vì repo đã có nhiều phần liên quan được viết trước — tránh làm lại hoặc làm trùng.

## 2. Hiện trạng thực tế (đã khảo sát code, không suy đoán)

### 2.1 Backend (`be/apps/wms/src/location`) — LIVE, có API thật

Model phân cấp `Zone → Rack → Shelf`, mỗi tầng là 1 collection Mongoose riêng:

- **`Zone`** (`zones`): `name`, `code` (unique khi chưa xoá). Không có toạ độ, không kích thước.
- **`Rack`** (`racks`): `zoneId`, `name`, `code` (unique trong zone). Không có toạ độ, không kích thước, không số tầng/số khoang.
- **`Shelf`** (`shelves`): `rackId`, `level` (số tầng), `code` (barcode vị trí, unique toàn hệ thống), `innerDepth/innerWidth/innerHeight` (kích thước bên trong để tính thể tích chứa), `fillFactor` (override tỉ lệ lấp đầy mặc định), `isStaging` (đánh dấu shelf khu nhận hàng tạm, unique toàn hệ thống).

`LocationController`/`LocationService`/`LocationRepository`: CRUD đầy đủ 3 tầng, role `MANAGER`, soft-delete (đúng nhóm "master/catalog" theo `data-and-mongoose.md`).

**Kết luận quan trọng: BE hoàn toàn không có khái niệm toạ độ (x/y), kích thước bố trí (width/height/depth ngoài), rotation, aisle (lối đi), gate (cổng) hay "bản đồ kho".** Đây thuần là danh mục phân cấp dùng để định danh vị trí (barcode), không phải bản đồ không gian.

### 2.2 Backend — Put-away Suggestion (`be/apps/wms/src/put-away-suggestion`) — LIVE, có API thật

`PutAwaySuggestionService.suggest(sku, qty)`:
1. Lấy kích thước item (`depth/width/height`) — nếu thiếu, trả `warning: ITEM_NO_DIMENSIONS`.
2. Lọc các shelf có kích thước trong (`innerDepth/innerWidth/innerHeight`) đủ chứa item theo 3 chiều (sort giảm dần rồi so từng cặp — không xét xoay 3D thực sự, chỉ so 3 cạnh đã sort).
3. Tính `free = usableVolume * fillFactor - occupied` (thể tích trống theo % lấp đầy cho phép), `capacity = floor(free / unitVolume)`.
4. Ưu tiên: (a) 1 shelf đơn đủ chứa toàn bộ `qty`, ưu tiên shelf **đã có cùng SKU**, rồi đến **best-fit** (free nhỏ nhất trong các đủ chứa); (b) nếu không có shelf đơn nào đủ, **gộp nhiều shelf** theo `capacity` giảm dần tới khi đủ `qty`.

**Đặc điểm quan trọng: thuật toán này thuần theo THỂ TÍCH, hoàn toàn không biết vị trí không gian.** Không có khái niệm "gần cửa nhập", "cùng khu vực", "khoảng cách di chuyển ngắn nhất" — vì làm gì có toạ độ để tính khoảng cách.

### 2.3 Frontend `/locations` (LIVE — route đang chạy thật)

`app/(dashboard)/locations/page.tsx` → `LocationStructureClient` (644 dòng): giao diện dạng bảng/cây quản lý Zone/Rack/Shelf CRUD thuần, khớp 1-1 với API BE ở 2.1. Không có sơ đồ.

### 2.4 Frontend `warehouse-layout` + `warehouse-navigation` — ĐÃ VIẾT SẴN NHƯNG CHƯA NỐI ROUTE (dead code có test)

Đây là phần dễ gây hiểu lầm nhất — cần nêu rõ vì AI hoặc dev mới có thể tưởng đã xong:

- **`WarehouseFloorPlan`** (`warehouse-layout/components/warehouse-floor-plan.tsx`, 615 dòng): sơ đồ 2D vẽ bằng SVG thuần (không dùng canvas/three.js). Render `zones`, `racks` (chia theo `bayCount`), `aisles` (lối đi chính/lối giữa kệ), `gates` (cổng). Hỗ trợ **kéo-thả** (`onMoveElement`), **resize** (`onResizeElement`), snap-to-grid, chọn phần tử (`onSelect`), vẽ route (`polyline` có mũi tên) khi có `WarehouseRoute`.
- **`WarehouseLayoutInspector`**: panel thuộc tính bên phải khi chọn 1 phần tử (đổi code/tên/toạ độ/kích thước/xoay/xoá) — gọi callback `onPatch`/`onDelete`/`onRotate` ra ngoài, không tự gọi API.
- **`RackConfigurationDialog`**: đồng bộ cấu hình vật lý (kích thước, số tầng, số khoang, rotation) từ 1 rack mẫu sang các rack khác trong zone hoặc toàn kho — cũng chỉ gọi callback `onApply` ra ngoài.
- **`WarehouseArchitectureScene`** (`warehouse-navigation/components/`): kết hợp `WarehouseFloorPlan` (chế độ "map") với **rack elevation view** (chế độ "rack" — xem chi tiết từng tầng shelf dạng "mặt cắt đứng kỹ thuật", hiển thị box từng lô hàng theo `ShelfContentItem` với `placement` tương đối x/y/width/height/z/rotation). Có badge "Đề xuất" đánh dấu shelf nào trong `PutawaySuggestion`.

**Vấn đề cốt lõi đã xác minh bằng grep toàn repo:**
- Type `WarehouseLayout` (canvas, zones, racks, aisles, gates, `status: DRAFT|PUBLISHED`, `revision`) **chỉ tồn tại ở `fe-pbvm-warehouse/src/types/api.ts`** — không có service nào (`*.service.ts`) gọi BE để GET/PUT layout này. Component nhận `layout` như prop từ component cha — nhưng **không có page nào trong `src/app` render `WarehouseArchitectureScene` hay `WarehouseFloorPlan`**. Chỉ tồn tại trong test file (`warehouse-navigation-components.test.tsx`, `warehouse-layout.test.ts`) truyền `layout` giả trực tiếp.
- BE không có bất kỳ entity nào chứa `xM/yM/widthM/heightM/rotation` cho zone/rack, không có `Aisle`/`Gate` collection.

→ **Kết luận: đây là 1 lần build UI "đi trước" (front-loaded), rất chi tiết và chất lượng, nhưng thiếu tầng dữ liệu + API thật, và chưa lắp vào route nào để user dùng được.** Không phải code chết vô dụng — là phần "vỏ" UI đã sẵn, thiếu "lõi" dữ liệu.

### 2.5 Put-away Task (`be/apps/wms/src/put-away`) — LIVE

`PutAwayTask` sinh tự động khi GRN confirmed, mỗi dòng (`PutAwayItem`) theo dõi `remainingQty`. **Cố ý không có `shelfId` cố định** trên item — vị trí thực tế tra qua `StockMovement` hoặc `InventoryStock`, vì 1 dòng có thể xếp vào nhiều shelf qua nhiều lần quét. Đây là quyết định thiết kế đã có sẵn, cần tôn trọng khi mở rộng.

## 3. Khoảng cách giữa "đã có" và "user muốn" (2D map + gợi ý theo sơ đồ)

| Việc user muốn | Đã có sẵn phần nào | Còn thiếu |
|---|---|---|
| Zone/Rack/Shelf có cấu trúc | ✅ BE model + CRUD đầy đủ | Toạ độ x/y, kích thước bố trí, rotation |
| Sơ đồ 2D trực quan | ✅ UI vẽ SVG rất đầy đủ (floor plan + rack elevation) | Toàn bộ tầng dữ liệu + API để nuôi UI này; chưa lắp route |
| Gợi ý vị trí đặt hàng | ✅ Thuật toán theo thể tích (bin-packing đơn giản) | Không biết khoảng cách/vị trí không gian → không thể ưu tiên "gần nhất", "cùng khu ưu tiên" |
| Aisle (lối đi), Gate (cổng) | ✅ Type + UI vẽ | Chưa có entity BE tương ứng |

## 4a. Thuật toán gợi ý vị trí — AI hay thuật toán cổ điển? (ĐÃ CHỐT)

**Quyết định: KHÔNG dùng AI/ML. Dùng weighted multi-criteria scoring (thuật toán cổ điển, xác định).**

Lý do loại AI/ML:
- **Cold-start**: kho mới, chưa có đủ dữ liệu lịch sử để train.
- **Bài toán không mơ hồ**: đầu vào (kích thước item, thể tích trống, toạ độ, tần suất xuất) đều đo được trực tiếp — không cần "học" quan hệ ẩn.
- **Cần giải thích được**: MANAGER/RECEIVER phải hiểu *tại sao* hệ thống gợi ý shelf này — AI dạng hộp đen vi phạm nguyên tắc minh bạch vận hành kho.
- **Chi phí không tương xứng**: train/retrain/theo dõi drift là overhead không cần thiết ở quy mô 1 kho.

Thuật toán chọn: **weighted scoring**, mở rộng trực tiếp từ `PutAwaySuggestionService` hiện có — không thay thế, chỉ cộng thêm tiêu chí khoảng cách vào bước ranking:

```
score = same_sku_bonus + distance_score + best_fit_score
```

- `same_sku_bonus`: giữ nguyên logic hiện tại (ưu tiên tuyệt đối nếu có shelf cùng SKU đủ chứa).
- `distance_score`: khoảng cách Euclid từ tâm rack (tính từ toạ độ `xM/yM` + `widthM/depthM` sắp thêm ở Zone/Rack) tới điểm nhập hàng tham chiếu (staging shelf — đã có `isStaging` unique toàn hệ thống, dùng làm điểm gốc "0" tự nhiên, không cần thêm khái niệm "gate" cho v1 thuật toán).
- `best_fit_score`: giữ nguyên logic hiện tại (free space nhỏ nhất trong các shelf đủ chứa).

Đây là cách các WMS thương mại (SAP EWM, Manhattan Associates) làm slotting — không phải giản lược, mà là đúng chuẩn ngành cho bài toán này. Đường nâng cấp tương lai nếu cần (không phải v1): ABC slotting theo tần suất xuất kho (`StockMovement` đã có sẵn dữ liệu để aggregate), hoặc Dijkstra/A* trên đồ thị aisle nếu Euclid không đủ chính xác do layout kho phức tạp (nhiều vật cản/đường vòng).

## 4b. Kích thước rack — mỗi rack khác nhau hay chung 1 chuẩn? (ĐÃ CHỐT — CẬP NHẬT 2026-07-27, đảo ngược quyết định trước)

**Quyết định cuối: TẤT CẢ rack dùng chung 1 template kích thước chuẩn toàn app.** Đảo ngược so với quyết định trước đó trong doc này (mục này ghi lại lý do để tránh nhầm lẫn khi đọc lại lịch sử).

- Thêm 1 document **singleton** `RackTemplate` chứa `widthM`, `depthM`, `levelCount`, `bayCount`.
- `Rack` document **không còn lưu kích thước riêng** — chỉ giữ vị trí (`xM`, `yM`, `rotation`) + định danh (`zoneId`, `code`, `name`). Kích thước luôn đọc từ `RackTemplate` chung, không có ngoại lệ per-rack.
- Sửa `RackTemplate` = đổi kích thước cho **toàn bộ rack cùng lúc** — khớp đúng ý "kệ đồng bộ toàn app" của user.
- Hệ quả UI: `RackConfigurationDialog` (đồng bộ kích thước từ 1 rack mẫu sang rack khác) **không còn cần thiết** — vì mọi rack đã luôn đồng bộ kích thước theo template, không có gì để "đồng bộ" nữa. Component này sẽ được bỏ khỏi luồng chính (xem plan triển khai).
- Tạo rack mới: chỉ cần vị trí + code/name, kích thước tự động lấy từ `RackTemplate` hiện hành — không nhập tay từng rack.

→ Cần thêm 1 collection nhỏ mới `RackTemplate` (khác với quyết định "không cần thêm bảng" trước đó).

## 4c. Các câu hỏi thiết kế còn lại (ĐÃ CHỐT)

1. **Phạm vi map — có aisle/gate không**: **CÓ, làm luôn đợt này.** Map sẽ đầy đủ zone + rack + aisle (lối đi) + gate (cổng), không chỉ zone/rack tối giản. UI đã vẽ sẵn cả 3 loại phần tử này, làm luôn tránh phải quay lại sau.
2. **1 kho hay nhiều kho**: xác nhận **singleton** — đúng như ghi chú trong `data-and-mongoose.md`/`ShelfSchema` ("App = 1 kho duy nhất"). `WarehouseLayout` chỉ có **1 bản duy nhất**, không multi-warehouse/multi-canvas.
3. **Draft/Publish hay chỉnh trực tiếp**: **Chỉnh trực tiếp, áp dụng ngay.** Không cần trạng thái `DRAFT`/`PUBLISHED`, không cần workflow duyệt. Đơn giản hoá: `WarehouseLayoutStatus` trong type FE hiện có có thể bỏ hoặc giữ nhưng luôn `PUBLISHED` (không dùng `DRAFT` ở BE).
4. **Rack elevation**: **CÓ, làm luôn cùng đợt với floor plan.** `WarehouseArchitectureScene` (chế độ "rack" — xem chi tiết từng tầng + vị trí lô hàng) sẽ được nối dữ liệu thật song song với floor plan, không tách đợt sau.

**Kết luận: scope đợt này = TRỌN VẸN** — floor plan 2D (zone/rack/aisle/gate, kéo-thả, resize, kích thước rack dùng chung 1 template chuẩn) + rack elevation (chi tiết từng tầng/lô hàng) + put-away suggestion nâng cấp weighted scoring, tất cả chỉnh trực tiếp không qua draft/publish, singleton 1 kho.

## 5. Phương án

### Phương án A — Nối dữ liệu thật cho UI đã có sẵn (khuyến nghị)

Tận dụng toàn bộ UI floor-plan/inspector/rack-elevation đã viết (chất lượng tốt, đã có test), chỉ xây tầng dữ liệu BE + service FE còn thiếu:

**BE:**
- Thêm field toạ độ vào `Zone` (`xM,yM,widthM,heightM,rotation`) — không đổi so với trước.
- `Rack` chỉ thêm **vị trí** (`xM,yM,rotation,accessPoint`) — **không** thêm `widthM/depthM/levelCount/bayCount` vào từng document Rack (đảo ngược so với thiết kế trước).
- Thêm collection singleton mới `RackTemplate` (`widthM, depthM, levelCount, bayCount`) — nguồn sự thật DUY NHẤT cho kích thước mọi rack. Sửa template = đổi kích thước toàn bộ rack cùng lúc.
- Thêm 2 collection mới nhỏ: `Aisle` (lối đi) và `Gate` (cổng).
- Endpoint mới: `GET /location/layout` (ráp Zone+Rack(kèm kích thước từ template)+Aisle+Gate thành `WarehouseLayout`), `GET/PUT /location/rack-template` (đọc/sửa template chung — MANAGER only). Chỉnh trực tiếp, áp dụng ngay — không có DRAFT/PUBLISH (đã chốt mục 4c #3).
- Mở rộng `PutAwaySuggestionService` sang **weighted scoring** (đã chốt ở mục 4a): thay lọc-rồi-sort tuần tự bằng công thức điểm `score = same_sku_bonus + distance_score + best_fit_score`, dùng staging shelf làm điểm gốc tính khoảng cách Euclid. Khoảng cách tính từ tâm rack = vị trí rack (`xM/yM`) + kích thước từ `RackTemplate` (không đổi công thức, chỉ đổi nguồn đọc `widthM/depthM`).

**FE:**
- Thêm `warehouse-layout.service.ts` gọi các endpoint trên (hiện chưa tồn tại).
- Thêm page mới (ví dụ `/locations/map` hoặc tab trong `/locations`) render `WarehouseArchitectureScene`/`WarehouseFloorPlan` với data thật thay vì prop rỗng.
- Sửa `WarehouseLayoutInspector` để `onPatch` gọi API thật cho vị trí zone/rack/aisle/gate. **Bỏ `RackConfigurationDialog` khỏi luồng chính** — không còn ý nghĩa "đồng bộ từ 1 rack mẫu" khi mọi rack đã luôn đồng bộ theo template; thay bằng 1 form sửa `RackTemplate` chung (áp dụng toàn app ngay lập tức).

**Ưu điểm**: không lãng phí UI đã làm kỹ, thời gian tập trung vào lõi dữ liệu + kết nối — phần rủi ro/công sức lớn nhất (UI 2D tương tác) coi như đã xong.
**Rủi ro**: cần đọc hiểu kỹ code UI cũ (đã làm ở trên) để không đoán sai field; nếu UI cũ có bug tiềm ẩn (chưa từng chạy thật) sẽ lộ ra khi nối API thật.

### Phương án B — Thiết kế lại từ đầu

Bỏ qua `warehouse-layout`/`warehouse-navigation` hiện có, thiết kế schema + UI map mới theo ý tưởng khác (ví dụ dùng canvas/Konva thay SVG, hoặc mô hình dữ liệu khác).

**Ưu điểm**: tự do thiết kế, không bị ràng buộc bởi quyết định cũ (vd SVG viewBox theo mét, snap-to-grid cố định).
**Nhược điểm**: bỏ phí ~1200 dòng UI đã viết + test đã có; user chưa nêu lý do gì để không dùng lại (schema hiện tại — Zone/Rack/Shelf + canvas toạ độ mét — là mô hình chuẩn phổ biến cho warehouse floor plan, không có vấn đề rõ ràng).

### Khuyến nghị

**Phương án A.** Lý do: UI hiện có đã đúng chuẩn (zone/rack/aisle/gate, kéo-thả, resize, snap-to-grid, rack elevation) và khớp tự nhiên với model Zone→Rack→Shelf đã có ở BE — chỉ thiếu đúng 1 lớp toạ độ. Không có tín hiệu nào cho thấy thiết kế cũ sai hướng, chỉ là dang dở.

## 6. Checklist quyết định — TẤT CẢ ĐÃ CHỐT

- [x] Thuật toán gợi ý vị trí → weighted scoring, không AI/ML (mục 4a).
- [x] Kích thước rack → **1 template chuẩn dùng chung toàn app** (`RackTemplate` singleton), rack không lưu kích thước riêng (mục 4b, cập nhật 2026-07-27).
- [x] Phương án triển khai → **Phương án A** (nối dữ liệu thật cho UI đã có).
- [x] Aisle/Gate → có, làm luôn đợt này (mục 4c #1).
- [x] Số lượng kho → singleton, 1 kho duy nhất (mục 4c #2).
- [x] Draft/Publish → không, chỉnh trực tiếp áp dụng ngay (mục 4c #3).
- [x] Rack elevation → có, làm luôn cùng đợt (mục 4c #4).

→ Bước tiếp theo: viết implementation plan chi tiết (BE schema/migration/API, FE service/route wiring) qua skill `writing-plans`.
