---
description: Lấy nội dung 1 GitHub issue và tự triển khai theo rule dự án
argument-hint: <issue-number-or-url>
---

Lấy issue GitHub và triển khai nó trong repo này.

Issue cần xử lý: **$ARGUMENTS**

## Quy trình

1. **Lấy nội dung issue**
   ```bash
   gh issue view $ARGUMENTS --json number,title,body,labels,comments,url
   ```
   Nếu `$ARGUMENTS` trống, hỏi user số issue hoặc URL. Đọc kỹ cả `body` lẫn `comments` — comment sau thường chỉnh sửa/thu hẹp yêu cầu gốc.

2. **Xác định loại việc** dựa trên labels + nội dung:
   - Có label `bug` / mô tả lỗi cụ thể → dùng skill `superpowers:systematic-debugging` trước khi sửa.
   - Feature / thay đổi hành vi → dùng skill `superpowers:brainstorming` nếu yêu cầu chưa rõ, rồi `superpowers:test-driven-development` khi code.
   - Việc lớn, nhiều bước → cân nhắc `superpowers:writing-plans` trước khi động code.

3. **Đối chiếu với rule dự án** — tuân thủ CLAUDE.md và `.claude/rules/*.md` (DB-per-app, event sync qua `libs/events`, `AppException` thay vì NestJS exception thô, DTO convention, v.v). Nếu issue yêu cầu điều mâu thuẫn với các rule bất biến (vd transaction xuyên DB), báo lại cho user thay vì tự ý làm.

4. **Triển khai**: code + test theo đúng convention hiện có trong repo (xem file tương tự để bắt chước style, comment tiếng Việt giải thích *vì sao*).

5. **Verify trước khi báo xong** — dùng skill `superpowers:verification-before-completion`: chạy `pnpm lint`, `pnpm test`, `pnpm build` liên quan đến phần đã đổi, xác nhận output thật sự pass, không chỉ giả định.

6. **Báo cáo kết quả** cho user, kèm số issue đã tham chiếu. **Không** tự động commit, push, tạo branch hay mở PR trừ khi user yêu cầu rõ trong lượt này.
