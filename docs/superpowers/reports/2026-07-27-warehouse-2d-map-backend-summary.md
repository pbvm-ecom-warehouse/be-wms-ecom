# Tóm tắt: Warehouse 2D Map — Backend (Task 1-7)

**Ngày:** 2026-07-27
**Repo:** `be` (worktree `warehouse-2d-map`, đã merge vào `develop` local — commit `2ce726f`)
**Scope:** Chỉ backend (Task 1-7/13). Frontend (Task 8-13, repo `fe-pbvm-warehouse`) để phiên sau.
**Phương pháp:** Subagent-Driven Development (SDD) — mỗi task 1 subagent implementer riêng + 1 review riêng, cuối cùng có whole-branch review.

---

## 1. Quyết định thiết kế chính

### 1.1. Đổi hướng giữa chừng: kích thước rack

- **Ban đầu định làm:** mỗi rack có kích thước riêng (`widthM/depthM/levelCount/bayCount` lưu trực tiếp trên từng `Rack`).
- **Đảo ngược theo yêu cầu:** kích thước rack phải **đồng bộ toàn app** — chỉ 1 kích thước chuẩn dùng chung cho mọi rack.
- **Giải pháp cuối:** tạo collection singleton mới `RackTemplate` (`widthM/depthM/levelCount/bayCount`), `Rack` **chỉ lưu vị trí** (`xM/yM/rotation/accessPointXM/accessPointYM`), không còn field kích thước nào.

### 1.2. Các lựa chọn khác (đã chốt qua hỏi đáp)

| Câu hỏi | Quyết định |
|---|---|
| Aisle/Gate có vào scope bản đồ không? | Có |
| Workflow chỉnh sửa layout | Sửa trực tiếp (direct-edit), không draft/publish |
| Rack elevation (nhìn chi tiết 1 rack) | Có, dùng dữ liệu tồn kho thật |
| RackTemplate lưu ở đâu | 1 singleton, rack không override riêng |

---

## 2. Chi tiết từng Task

### Task 1 — Zone: thêm toạ độ 2D
- `Zone` schema/DTO thêm `xM/yM/widthM/heightM/rotation`.
- Commit: `41a866d`.

### Task 2 — Rack: chỉ thêm vị trí (không kích thước)
- `Rack` schema/DTO thêm `xM/yM/rotation/accessPointXM/accessPointYM`.
- Xác nhận rõ ràng bằng test: Rack **không** có field kích thước.
- Commit: `703dbb6`.

### Task 2b — RackTemplate: singleton kích thước dùng chung
- Collection mới `rack_templates`: `widthM/depthM/levelCount/bayCount` + `updatedBy`.
- Lazy-init: nếu collection rỗng, tự tạo doc mặc định khi gọi `getRackTemplate()`.
- Default `levelCount`/`bayCount` = `1` (theo test brief, không theo ví dụ code mẫu = 3 vì 2 nguồn mâu thuẫn nhau).
- Commit: `e9711d1`.

### Task 3 — Aisle: entity lối đi mới
- CRUD đầy đủ, `AisleType` enum (`MAIN` | `RACK`), field `code/type/xM/yM/widthM/heightM`.
- Master-data pattern: soft-delete (`deletedAt`), timestamps.
- Commit: `2f68566`.

### Task 4 — Gate: entity cổng mới
- CRUD đầy đủ, field `code/label/xM/yM`.
- Commit: `6810d6a` (+ fix `9bfec81`, xem sự cố #4 bên dưới).

### Task 5 — Endpoint `GET /location/layout`
- Ráp 5 nguồn dữ liệu (`zones/racks/aisles/gates/rackTemplate`) qua `Promise.all` thành 1 response.
- `LayoutResponseDto`: mảng cho zone/rack/aisle/gate, object đơn cho `rackTemplate` (vì là singleton).
- Route đặt trước `:id` để tránh xung đột path.
- Commit: `7106c66`.

### Task 6 — Put-away suggestion: nâng cấp sang weighted scoring
- Thay thuật toán cũ (same-SKU rồi mới đến best-fit tuần tự) bằng công thức điểm số:
  `score = same_sku_bonus(1000 nếu có cùng SKU) + distance_score(khoảng cách tới staging, tối đa 100) − free/1000 (phạt shelf trống nhiều)`.
- Khoảng cách tính bằng Euclid giữa tâm rack (vị trí rack + kích thước RackTemplate/2).
- Method mới: `LocationRepository.findRackCentersByShelfId()`.
- Commit: `d0ba96e`.

### Task 7 — Endpoint `GET /location/shelves/:id/contents`
- Trả nội dung tồn kho thật của 1 shelf (rack elevation): `id/sku/itemName/unit/quantity/lotNumber/expiryDate`.
- `StockRepository.findInventoryByShelfId()`: MongoDB aggregate `$lookup` warehouse_items + lots, `$unwind` với `preserveNullAndEmptyArrays: true` (vì lô hàng không phải lúc nào cũng có `lotId`).
- `LocationModule` import thêm `StockModule` — xác nhận không tạo circular dependency.
- Commit: `c5476de`.

---

## 3. Sự cố trong quá trình làm (5 incident)

| # | Task | Mô tả | Xử lý |
|---|---|---|---|
| 1 | Task 1 | Implementer commit nhầm vào checkout gốc `develop` thay vì worktree | Cherry-pick sang worktree, reset `develop` về sạch (chưa push, an toàn) |
| 2 | Task 2b | Lặp lại lỗi tương tự #1, nhưng lần này **đã push lên `origin/develop` thật**, đồng nghiệp đã pull và build tiếp lên trên | User quyết định: **không rewrite lịch sử**. Fast-forward `develop` local theo remote, merge vào worktree — git tự nhận diện patch trùng, merge sạch |
| 3 | Task 3 | Implementer bị dừng do giới hạn phiên làm việc (không phải lỗi) sau khi code xong nhưng chưa commit | Resume lại đúng agent đó để tự commit |
| 4 | Task 4 (nghiêm trọng nhất) | Implementer viết code ở checkout gốc trước rồi copy sang worktree, dùng baseline cũ thiếu Task 2b+3 → **xoá mất toàn bộ RackTemplate + Aisle** đã làm trước đó | Dispatch fix chỉ rõ commit tham chiếu để khôi phục đúng, cấm cách làm "viết ở nơi khác rồi copy". Khôi phục thành công, review lại sạch |
| 5 | Task 7 | Phiên trước bị ngắt giữa chừng (process bị dừng ngoài ý muốn), implementer đã viết đủ code nhưng chưa test/report/commit | Verify trực tiếp bằng git, resume đúng agent để hoàn thiện |

**Bài học chung:** implementer thỉnh thoảng vi phạm cô lập worktree (commit nhầm chỗ, hoặc viết-rồi-copy dẫn tới mất dữ liệu do baseline cũ). Đã tăng cường prompt yêu cầu xác nhận `pwd`/`git branch --show-current` ở đầu task VÀ ngay trước mỗi lệnh commit.

---

## 4. Các finding được chấp nhận làm nợ kỹ thuật (không sửa trong phiên này)

1. **Lỗi môi trường Jest/ESM (pre-existing, không liên quan plan):** mọi file test import `@app/common` (qua `firebase-admin` → `jwks-rsa` → `jose`, package ESM Jest không parse được) đều fail khi chạy — ảnh hưởng ~29 test suite trong toàn bộ `apps/wms`, bao gồm `location.service.spec.ts` và `put-away-suggestion.service.spec.ts`. Đã xác nhận tồn tại từ trước plan này (test trên baseline `develop` cũ cũng lỗi y hệt). Logic được verify bằng đọc code, không phải bằng chạy test thật.
2. **Công thức scoring (Task 6) có giới hạn lý thuyết:** số hạng `−free/1000` không có trần, về lý thuyết shelf cực lớn (>1m³ chỗ trống) có thể phá vỡ nguyên tắc "same-SKU luôn ưu tiên tuyệt đối". Rủi ro không thực tế với kích thước shelf thật. User quyết định chấp nhận làm hạn chế thiết kế v1.
3. Vài finding Minor khác (dead error-code chưa dùng tới `RACK_TEMPLATE_NOT_FOUND`/`INVALID`, vài spec file lỗi kiểu dưới `tsc --noEmit` do cách dùng Mongoose `getDefault()`/enum `as const` — cùng loại nhiễu đã có sẵn trong nhiều spec khác của repo, không phải chuẩn mới bị phá).

---

## 5. Review cuối nhánh (whole-branch review)

Sau khi Task 1-7 pass review riêng lẻ, dispatch 1 review tổng thể toàn bộ diff (10 commit, model mạnh nhất). Kết quả: **Approved with minor follow-ups**, phát hiện 2 finding Important cần sửa trước khi merge:

1. **`combineShelves` sort sai hướng:** hàm gộp nhiều shelf (khi 1 shelf không đủ chỗ) đang dùng công thức `score()` có phạt shelf trống nhiều (`−free/1000`) — nhưng path này cần ưu tiên NGƯỢC LẠI (nhiều chỗ trống hơn để dùng ít shelf nhất). Đây là bug hành vi thật, khác với finding lý thuyết đã chấp nhận ở Task 6.
   - **Fix:** tách `score()` thành `sameSkuBonus()`/`distanceScore()` dùng chung, thêm comparator riêng `compareForCombine()` cho path gộp (same-SKU → distance → capacity DESC), giữ nguyên `rankSingleShelf` dùng best-fit như cũ.
2. **`findRackCentersByShelfId` thiếu filter soft-delete:** không nhất quán với các method khác trong cùng file (mọi query khác đều lọc `deletedAt: null`).
   - **Fix:** thêm filter soft-delete vào 2 query (shelf, rack).

Fix wave 1 lần (commit `eca40a7`), re-review scoped xác nhận cả 2 finding ADDRESSED, có test mới verify hướng sort đúng (kiểm chứng 2 chiều bằng git stash: fail ở code cũ, pass ở code mới). Phát hiện 1 lỗi format cosmetic (prettier) — tự sửa bằng `eslint --fix` (commit `88b216e`), không cần vòng review thêm.

---

## 6. Merge vào develop

- **Branch:** `warehouse-2d-map` (base ban đầu `develop@34e36f8`, phân kỳ với `main` từ `41a866d`).
- **Merge base cuối cùng:** `develop` đã có thêm commit mới từ đồng nghiệp (`b787c7f`) trước khi merge — đã pull về trước khi merge.
- **Merge:** local, sạch, không conflict (commit merge `2ce726f`).
- **Verify sau merge:** `tsc --noEmit` sạch, test suite kết quả giống hệt trước merge (29 suite fail do lỗi môi trường pre-existing đã biết, 2 test fail pre-existing không liên quan plan, không có regression mới).
- **Chưa push lên origin** — chỉ merge local theo yêu cầu, worktree đã được dọn (`git worktree remove` + `git branch -d warehouse-2d-map`).

---

## 7. Danh sách commit trên nhánh (theo thứ tự)

```
41a866d feat(wms): thêm toạ độ/kích thước 2D vào Zone schema
703dbb6 feat(wms): thêm vị trí (xM/yM/rotation/accessPoint) vào Rack schema
e9711d1 feat(wms): thêm RackTemplate singleton — kích thước rack dùng chung
2f68566 feat(wms): thêm entity Aisle (lối đi) với CRUD đầy đủ
6810d6a feat(wms): thêm entity Gate (cổng) với CRUD đầy đủ
9bfec81 fix(wms): khôi phục RackTemplate + Aisle (bị xoá vô tình)
7106c66 feat(wms): thêm endpoint GET /location/layout ráp zone/rack/aisle/gate
d0ba96e feat(wms): nâng cấp put-away suggestion sang weighted scoring
c5476de feat(wms): thêm endpoint GET /location/shelves/:id/contents cho rack elevation
eca40a7 fix(wms): sửa 2 finding Important từ whole-branch review
88b216e style(wms): fix prettier formatting nit từ fix wave
2ce726f Merge branch 'warehouse-2d-map' into develop
```

---

## 8. Còn lại (chưa làm trong phiên này)

- **Task 8-13 (frontend, repo `fe-pbvm-warehouse`):** vẽ bản đồ 2D, UI chỉnh sửa zone/rack/aisle/gate, hiển thị rack elevation, tích hợp gợi ý put-away — để phiên sau, cần tạo worktree riêng trong repo frontend.
- **Nợ kỹ thuật môi trường (không thuộc scope plan):** sửa cấu hình Jest để hỗ trợ ESM package `jose` (transformIgnorePatterns hoặc mock `firebase-admin`), hiện chặn ~29 test suite chạy được trong `apps/wms`.
- **Chưa push `develop` lên origin** — quyết định push khi nào là của người dùng.
