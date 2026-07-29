# DB Analytics RAG — Design (Giai đoạn 2)

## Bối cảnh & mục tiêu

Giai đoạn 1 ([sop-knowledge-rag-design.md](2026-07-29-sop-knowledge-rag-design.md)) đã xây RAG vector search cho SOP tĩnh. Giai đoạn này giải quyết nhu cầu khác: nhân viên/manager hỏi câu hỏi **thống kê cần số liệu chính xác** (doanh thu, top SKU, tồn kho, số đơn theo trạng thái, nhập/xuất kho) — thứ mà vector search không đảm bảo được vì nó tìm đoạn văn giống nhất chứ không tính toán.

**Quyết định kiến trúc cốt lõi**: đây không phải RAG (retrieval-augmented generation trên tài liệu), mà là **text-to-function-call** — LLM chỉ chọn 1 trong số hàm Python cố định sẵn kèm tham số, không tự sinh MongoDB pipeline tùy ý. Điều này loại bỏ rủi ro LLM viết sai cú pháp, truy vấn chậm không index, hoặc truy cập ngoài phạm vi cho phép.

## Ràng buộc kiến trúc kế thừa từ hệ thống chính

Dự án `be/` (NestJS) có 4 luật bất biến (xem `be/CLAUDE.md`): mỗi app 1 DB riêng, không đọc chéo, đồng bộ chỉ qua event. Service phân tích này **không phải** một trong 2 app NestJS — nó là một lớp đọc-only bên ngoài, nên việc nó tự kết nối cả `wms_db` lẫn `ecom_db` **không vi phạm** nguyên tắc "app A không đọc DB của app B", vì không có app nghiệp vụ nào tự đọc chéo app kia ở đây.

Ràng buộc vẫn phải giữ:
- Chỉ đọc (`find`/`aggregate`), không bao giờ ghi vào `wms_db`/`ecom_db`.
- Không join xuyên 2 DB trong 1 pipeline Mongo (Mongo không hỗ trợ join xuyên cluster/DB khác instance dù cùng cluster) — mỗi hàm chỉ query 1 DB; nếu cần dữ liệu từ cả 2, gộp kết quả ở tầng ứng dụng Python (không xảy ra ở giai đoạn này vì không có câu hỏi nào cần join xuyên DB).

## Phạm vi giai đoạn 2

5 hàm thống kê cố định, chia theo domain:

### Ecommerce (`ecom_db`)

1. **`doanh_thu_theo_khoang(tu_ngay, den_ngay)`**
   - Input: `tu_ngay: date`, `den_ngay: date` (inclusive).
   - Query: `orders` collection, `$match` theo `createdAt` trong khoảng, `orderStatus != CANCELLED`; `$group` tổng `total`, đếm số đơn.
   - Output: `{ tong_doanh_thu: number, so_don: number, tu_ngay, den_ngay }`.

2. **`top_sku_ban_chay(tu_ngay, den_ngay, top_n=5)`**
   - Query: `orders` collection, `$match` theo khoảng thời gian + `orderStatus != CANCELLED`, `$unwind items`, `$group` theo `items.sku` tổng `quantity` và `quantity * unitPrice`, `$sort` giảm dần theo số lượng, `$limit top_n`.
   - Output: danh sách `{ sku, ten_sp (items.name), so_luong_ban, doanh_thu }`.

3. **`so_don_theo_trang_thai(tu_ngay, den_ngay)`**
   - Query: `orders`, `$match` theo khoảng thời gian, `$group` theo `orderStatus` đếm số lượng.
   - Output: `{ PLACED: n, CONFIRMED: n, CANCELLED: n, CLOSED: n }`.

### WMS (`wms_db`)

4. **`ton_kho(sku=None)`**
   - Nếu có `sku`: join `warehouse_items` (tìm theo `sku`, lấy `_id`) → `stock_balances` (`itemId`) → trả `onHand`, `reserved`, `expired`, `available = onHand - reserved - expired`.
   - Nếu không có `sku` (gọi không tham số): trả danh sách SKU có `available < minQuantity` (đã set `minQuantity`, join `warehouse_items` ↔ `stock_balances`) — "sắp hết hàng".
   - Output tương ứng 1 trong 2 dạng trên, kèm cờ `mode: "single_sku" | "low_stock_list"`.

5. **`thong_ke_nhap_xuat_kho(tu_ngay, den_ngay)`**
   - Nhập: đếm `goods_receipt_notes` có `status = APPROVED` và `approvedAt` trong khoảng.
   - Xuất: đếm `goods_issues` có `status = CONFIRMED` và `createdAt` trong khoảng (goods_issues không có trường ngày xác nhận riêng, dùng `createdAt` làm mốc — chấp nhận sai số nhỏ giữa tạo phiếu và xác nhận xong).
   - Output: `{ so_phieu_nhap: number, so_phieu_xuat: number, tu_ngay, den_ngay }`.

## Kiến trúc kỹ thuật

App Python độc lập thứ hai, cấu trúc song song với `sop-rag/`, KHÔNG dùng chung code (không import lẫn nhau) — mỗi service độc lập hoàn toàn, tránh coupling giữa 2 mối quan tâm khác nhau (semantic search vs structured query).

```
db-analytics/
  requirements.txt
  .env.example
  .gitignore
  README.md
  tools/
    __init__.py
    ecom_tools.py        # 3 hàm thống kê ecom_db
    wms_tools.py          # 2 hàm thống kê wms_db
  app/
    __init__.py
    config.py             # Settings: WMS_MONGODB_URI, ECOM_MONGODB_URI, GOOGLE_API_KEY, CHAT_MODEL
    function_schemas.py    # khai báo 5 tool cho Gemini function-calling (tên, mô tả, tham số)
    agent.py                # answer_question(question) -> gọi Gemini với tools, chấp hành tool call, trả kết quả
    main.py                  # FastAPI POST /ask
  tests/
    test_ecom_tools.py
    test_wms_tools.py
    test_agent.py
    test_main.py
```

### Luồng xử lý 1 câu hỏi

1. `POST /ask {question}` nhận câu hỏi tiếng Việt.
2. `agent.answer_question` gọi Gemini (`generateContent` với `tools=[...]` khai báo 5 hàm trong `function_schemas.py`).
3. Gemini trả về **function call** (tên hàm + tham số được trích từ câu hỏi, vd `top_sku_ban_chay(tu_ngay="2026-07-01", den_ngay="2026-07-29", top_n=5)`).
4. Code Python thực thi đúng hàm tương ứng trong `tools/ecom_tools.py` hoặc `tools/wms_tools.py` — đây là bước duy nhất chạm Mongo, dùng aggregation pipeline viết sẵn (không phải LLM sinh).
5. Kết quả (JSON số liệu thật) được đưa lại cho Gemini để diễn giải thành câu trả lời tự nhiên tiếng Việt.
6. Response trả cả `answer` (câu trả lời tự nhiên) và `data` (JSON số liệu thô) để nhân viên có thể đối chiếu.

### Xử lý trường hợp không khớp hàm nào

Nếu Gemini không chọn được hàm nào phù hợp (câu hỏi ngoài phạm vi 5 hàm, ví dụ hỏi về SOP hoặc chuyện không liên quan số liệu) → trả lời cố định: "Câu hỏi này ngoài phạm vi thống kê được hỗ trợ hiện tại." — không đoán mò, không tự bịa số liệu.

### Xử lý lỗi

- Tham số ngày tháng không parse được → trả lỗi rõ ràng (400), không âm thầm dùng giá trị mặc định sai.
- Lỗi kết nối Mongo → 500 kèm log, không che giấu.
- Gemini rate-limit (429) → 503, không tự động retry vô hạn (giống giai đoạn 1).

## Ngoài phạm vi

- Không hỗ trợ câu hỏi tự do ngoài 5 hàm định nghĩa sẵn (không tự sinh aggregation pipeline).
- Không ghi dữ liệu — service chỉ đọc.
- Không cần cache kết quả ở giai đoạn này (traffic nội bộ thấp).
- Không auth (giống giai đoạn 1, deferred).
- Không join xuyên `wms_db`/`ecom_db` trong 1 câu hỏi (không có yêu cầu nào ở giai đoạn này cần điều đó).

## Testing

- Mỗi hàm trong `ecom_tools.py`/`wms_tools.py` có test riêng, dùng `mongomock` hoặc dữ liệu giả lập tối thiểu để verify pipeline đúng logic (không cần Atlas thật cho unit test).
- `agent.py` test bằng cách mock Gemini function-calling response, verify đúng hàm được gọi với đúng tham số.
- `main.py` test qua FastAPI TestClient, mock `agent.answer_question`.
- Kiểm thử thủ công cuối cùng: chạy với Atlas thật, hỏi vài câu mẫu tương ứng 5 hàm, đối chiếu số liệu trả về với truy vấn Mongo Compass/mongosh thủ công để xác nhận đúng.

## Hướng mở rộng sau (không làm trong giai đoạn này)

- Thêm hàm mới khi có nhu cầu thống kê khác (tuân theo cùng pattern function-calling).
- Auth JWT (giống hướng mở rộng của giai đoạn 1).
- Nếu sau này cần câu hỏi phức tạp hơn 5 hàm cố định, cân nhắc lại việc cho LLM sinh pipeline có kiểm soát (whitelist field, giới hạn thời gian query) — chưa cần thiết ở quy mô hiện tại.
