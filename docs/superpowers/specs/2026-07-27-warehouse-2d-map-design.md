# Warehouse 2D Map & Put-away Suggestion — Phân tích & Phương án

Status: DRAFT — đang phân tích, 1 quyết định đã chốt (mục 4a), còn lại chờ xác nhận
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

## 4b. Câu hỏi thiết kế còn lại — cần quyết định trước khi viết implementation plan

1. **Phạm vi "map"**: chỉ cần sơ đồ 2D layout tĩnh (zone/rack đặt ở đâu trong kho) để nhìn trực quan, hay cần mô hình hoá cả lối đi (aisle)/cổng (gate) để sau này tính khoảng cách di chuyển thực sự (ví dụ Dijkstra/A* trên đồ thị aisle)? *(Lưu ý: thuật toán v1 ở mục 4a dùng staging shelf làm điểm gốc, không bắt buộc phải có gate/aisle ngay — có thể hoãn nếu chỉ cần floor plan trực quan trước.)*
2. **1 kho hay nhiều kho**: `data-and-mongoose.md` và `ShelfSchema` ghi chú "App = 1 kho duy nhất" (ràng buộc unique `isStaging` toàn hệ thống, không scope theo `warehouseId`). Vậy `WarehouseLayout` chỉ cần là **1 bản duy nhất** (singleton), không cần multi-warehouse, multi-canvas.
3. **Ai chỉnh sơ đồ**: MANAGER/ADMIN vẽ/kéo-thả zone/rack 1 lần khi setup kho (ít thay đổi), hay cần workflow DRAFT→PUBLISH như FE đã thiết kế sẵn (`WarehouseLayoutStatus`)?
4. **Rack elevation (mặt cắt đứng từng kệ) có nằm trong scope đợt này không**, hay chỉ làm floor plan 2D (map tổng thể) trước, rack elevation để sau?

## 5. Phương án

### Phương án A — Nối dữ liệu thật cho UI đã có sẵn (khuyến nghị)

Tận dụng toàn bộ UI floor-plan/inspector/rack-elevation đã viết (chất lượng tốt, đã có test), chỉ xây tầng dữ liệu BE + service FE còn thiếu:

**BE:**
- Thêm field toạ độ/kích thước vào `Zone` (`xM,yM,widthM,heightM,rotation`) và `Rack` (`xM,yM,widthM,depthM,rotation,levelCount,bayCount,accessPoint`) — mở rộng schema hiện có, không phá cấu trúc Zone→Rack→Shelf.
- Thêm 2 collection mới nhỏ: `Aisle` (lối đi) và `Gate` (cổng) — hoặc gộp làm 1 document `WarehouseLayoutMeta` singleton chứa `canvas` + `aisles[]` + `gates[]` (đơn giản hơn vì đây là "khung nền" ít thay đổi, không cần CRUD riêng lẻ theo phân trang).
- Endpoint mới: `GET /location/layout` (ráp Zone+Rack+aisles+gates thành `WarehouseLayout`), `PUT /location/layout` (lưu toạ độ hàng loạt — MANAGER only). Không cần DRAFT/PUBLISH ở v1 nếu user xác nhận câu hỏi #3 là "chỉnh trực tiếp".
- Mở rộng `PutAwaySuggestionService` sang **weighted scoring** (đã chốt ở mục 4a): thay lọc-rồi-sort tuần tự bằng công thức điểm `score = same_sku_bonus + distance_score + best_fit_score`, dùng staging shelf làm điểm gốc tính khoảng cách Euclid. Không cần AI/ML — thuật toán xác định, giải thích được, tận dụng toạ độ x/y sắp thêm.

**FE:**
- Thêm `warehouse-layout.service.ts` gọi 2 endpoint trên (hiện chưa tồn tại).
- Thêm page mới (ví dụ `/locations/map` hoặc tab trong `/locations`) render `WarehouseArchitectureScene`/`WarehouseFloorPlan` với data thật thay vì prop rỗng.
- Sửa `WarehouseLayoutInspector`/`RackConfigurationDialog` để `onPatch`/`onApply` thực sự gọi `PUT /location/layout` (hiện chỉ là callback treo).

**Ưu điểm**: không lãng phí UI đã làm kỹ, thời gian tập trung vào lõi dữ liệu + kết nối — phần rủi ro/công sức lớn nhất (UI 2D tương tác) coi như đã xong.
**Rủi ro**: cần đọc hiểu kỹ code UI cũ (đã làm ở trên) để không đoán sai field; nếu UI cũ có bug tiềm ẩn (chưa từng chạy thật) sẽ lộ ra khi nối API thật.

### Phương án B — Thiết kế lại từ đầu

Bỏ qua `warehouse-layout`/`warehouse-navigation` hiện có, thiết kế schema + UI map mới theo ý tưởng khác (ví dụ dùng canvas/Konva thay SVG, hoặc mô hình dữ liệu khác).

**Ưu điểm**: tự do thiết kế, không bị ràng buộc bởi quyết định cũ (vd SVG viewBox theo mét, snap-to-grid cố định).
**Nhược điểm**: bỏ phí ~1200 dòng UI đã viết + test đã có; user chưa nêu lý do gì để không dùng lại (schema hiện tại — Zone/Rack/Shelf + canvas toạ độ mét — là mô hình chuẩn phổ biến cho warehouse floor plan, không có vấn đề rõ ràng).

### Khuyến nghị

**Phương án A.** Lý do: UI hiện có đã đúng chuẩn (zone/rack/aisle/gate, kéo-thả, resize, snap-to-grid, rack elevation) và khớp tự nhiên với model Zone→Rack→Shelf đã có ở BE — chỉ thiếu đúng 1 lớp toạ độ. Không có tín hiệu nào cho thấy thiết kế cũ sai hướng, chỉ là dang dở.

## 6. Việc CHƯA quyết định (cần user trả lời trước khi viết implementation plan)

- ~~Thuật toán gợi ý vị trí~~ → **ĐÃ CHỐT** (mục 4a): weighted scoring, không AI/ML.
- Trả lời 4 câu hỏi còn lại ở mục 4b.
- Xác nhận chọn Phương án A hay B (đã có khuyến nghị A).
- Xác nhận có cần workflow DRAFT/PUBLISH layout hay chỉnh trực tiếp (ảnh hưởng thiết kế API + schema).
- Xác nhận rack elevation (mặt cắt đứng, box placement từng lô hàng) có trong scope đợt 1 hay để đợt sau (chỉ làm floor plan 2D tổng thể trước).
