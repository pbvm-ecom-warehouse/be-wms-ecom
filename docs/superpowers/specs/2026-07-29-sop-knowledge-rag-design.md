# SOP Knowledge RAG — Design (Giai đoạn 1)

## Bối cảnh & mục tiêu

Hệ thống wms-ecom hiện có 2 app NestJS (`apps/wms`, `apps/ecommerce`) với DB Mongo riêng biệt, đồng bộ qua event. Nhân viên nội bộ (kho, CSKH) cần một kênh tra cứu nhanh các quy trình/SOP vận hành (nhập/xuất kho, xử lý đổi trả, chính sách...) mà không phải lục tài liệu Word/PDF thủ công.

Đây là **giai đoạn 1** của mục tiêu RAG lớn hơn. Giai đoạn 2 (không nằm trong spec này) sẽ là text-to-query/aggregation cho câu hỏi thống kê chính xác (doanh thu, top SKU...) dành cho manager/admin — bản chất khác hẳn (cần độ chính xác số liệu, không phù hợp vector search) nên tách riêng thiết kế sau.

**Phạm vi giai đoạn 1**: RAG vector search cổ điển trên tài liệu SOP tĩnh, phục vụ nhân viên nội bộ hỏi-đáp quy trình.

## Ngoài phạm vi

- Tra cứu dữ liệu sống (tồn kho, đơn hàng cụ thể) — không thuộc RAG này.
- Thống kê/aggregation cho manager — giai đoạn 2, thiết kế riêng.
- Auth/JWT integration với WMS — để sau khi pipeline chạy ổn.
- Tự động đồng bộ khi SOP thay đổi (sync pipeline) — không cần vì SOP ít (<50 file) và ít đổi.
- UI/chatbot widget — chỉ làm API, gắn UI ở đâu tính sau.

## Kiến trúc

App Python hoàn toàn độc lập, nằm ngoài monorepo NestJS (`be/`), không phụ thuộc và không được gọi bởi NestJS.

```
sop-rag/
  ingest.py                # script ingest chạy tay
  app/
    main.py                # FastAPI: POST /ask
    retriever.py            # LangChain retriever trên Atlas Vector Search
    generator.py             # LangChain RAG chain + Gemini chat model
    config.py                # env vars
  docs/                     # thư mục thả file SOP nguồn (.md/.docx/.pdf)
  requirements.txt
```

### Vector store

MongoDB Atlas (cùng cluster đang dùng cho `wms_db`/`ecom_db`), nhưng **database/collection mới, tách biệt** — ví dụ `knowledge_db.sop_chunks` — để tôn trọng nguyên tắc DB-per-app hiện có trong dự án (không trộn dữ liệu RAG vào DB nghiệp vụ). Cần tạo một Atlas Search Index kiểu `vectorSearch` trên field embedding của collection này (qua Atlas UI hoặc Admin API, làm thủ công 1 lần).

### Ingest pipeline (chạy tay)

1. Nhân viên/dev thả file SOP (.md/.docx/.pdf) vào `sop-rag/docs/`.
2. Chạy `python ingest.py`:
   - Load file bằng loader tương ứng của `langchain_community.document_loaders` (`UnstructuredMarkdownLoader`, `Docx2txtLoader`, `PyPDFLoader`).
   - Chunk bằng `RecursiveCharacterTextSplitter`.
   - Embed từng chunk bằng `GoogleGenerativeAIEmbeddings` (model `text-embedding-004`).
   - Ghi vào Atlas qua `MongoDBAtlasVectorSearch.from_documents`, kèm metadata tối thiểu: tên file nguồn + vị trí chunk (để trích dẫn nguồn khi trả lời).
3. Không có bước xóa/update tự động — nếu sửa 1 file SOP, xóa chunks cũ theo metadata filename rồi ingest lại (thao tác thủ công, ghi trong README của `sop-rag/`).

### API: retrieval + generation

`POST /ask { "question": string }` (FastAPI, không auth ở giai đoạn này):

1. Retriever (`MongoDBAtlasVectorSearch.as_retriever`) lấy top-k chunk liên quan nhất theo similarity.
2. Nếu similarity score cao nhất dưới ngưỡng cấu hình được → trả thẳng `"Không tìm thấy thông tin liên quan trong tài liệu."`, không gọi LLM (tránh hallucination).
3. Ngược lại, ghép các chunk vào prompt cùng câu hỏi, gọi `ChatGoogleGenerativeAI` (`gemini-2.0-flash`, free tier) sinh câu trả lời.
4. Response trả về: câu trả lời + danh sách nguồn (tên file, có thể kèm đoạn trích) để nhân viên có thể tự kiểm chứng.

### Xử lý lỗi

- Gemini free tier rate-limit (HTTP 429) → trả lỗi rõ ràng cho client (503 kèm message), không tự động retry vô hạn.
- Không tìm thấy chunk liên quan → trả lời "không tìm thấy" như trên, không để LLM tự bịa.
- Lỗi kết nối Atlas → trả 500 kèm log, không che giấu.

## Stack kỹ thuật

- Python + FastAPI
- LangChain (`langchain`, `langchain-google-genai`, `langchain-mongodb`, `langchain-community`)
- Google Gemini: `text-embedding-004` (embedding) + `gemini-2.0-flash` (chat), free tier
- MongoDB Atlas Vector Search (cluster hiện có, DB mới `knowledge_db`)

## Testing

Không cần bộ test tự động ở quy mô này. Kiểm chứng thủ công: chuẩn bị vài câu hỏi mẫu tương ứng nội dung SOP thật đã ingest, kiểm tra câu trả lời đúng nội dung và trích đúng nguồn. Thử thêm 1-2 câu hỏi ngoài phạm vi tài liệu để xác nhận hệ thống trả lời "không tìm thấy" thay vì bịa.

## Hướng mở rộng sau (không làm trong giai đoạn này)

- Thêm xác thực JWT (verify độc lập bằng `WMS_JWT_SECRET`, theo đúng mô hình Ecommerce admin route đã validate token WMS tại chỗ mà không gọi ngược NestJS).
- Text-to-query/aggregation cho câu hỏi thống kê manager (giai đoạn 2, spec riêng).
- Tự động re-index khi SOP thay đổi, nếu số lượng tài liệu tăng đáng kể.
