# .codex/rules

Bộ rules giải thích kiến trúc dự án để Codex (và người mới) làm việc đúng quy ước. Codex **không** tự inline như `@import` của Claude Code — `../../AGENTS.md` liệt kê và yêu cầu đọc các file dưới đây trước khi sửa code thuộc chủ đề tương ứng.

| File | Nội dung |
|---|---|
| `architecture.md` | Bức tranh lớn: monorepo, DB-per-app, đồng bộ bằng event, saga reserve, và điểm **lệch có chủ đích** so với docs |
| `data-and-mongoose.md` | Mongoose per-app (`@nestjs/mongoose`), `DatabaseModule.forApp`, định nghĩa schema, map Prisma→Mongoose, liên kết bằng `sku`/id, quy ước audit |
| `events.md` | Cách thêm/produce/consume event qua `libs/events`, payload tối thiểu, idempotency, saga reserve |
| `auth-and-modules.md` | Auth tách biệt + secret riêng, cấu trúc module NestJS, routing prefix, trạng thái notification app |

Nguồn tài liệu gốc: `../../../docs/overview/` (`data-ownership.md`, `erd.dbml`, `main-flow.md`, `nestjs-monorepo.md`). **Khi docs mâu thuẫn với code về cơ chế đồng bộ (transaction xuyên DB vs event/saga) → theo code + theo `architecture.md`.**
