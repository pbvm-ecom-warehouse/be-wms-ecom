import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Mỗi app có 1 schema + 1 logical DB riêng (cùng cluster MongoDB).
// Chọn schema cụ thể qua cờ --schema khi chạy CLI (xem script trong package.json):
//   pnpm prisma:wms:generate / pnpm prisma:ecom:generate
//   pnpm prisma:wms:push     / pnpm prisma:ecom:push
// MongoDB không dùng migrations — dùng `db push`. Url lấy từ env trong từng schema.
// `schema` dưới đây chỉ là mặc định khi không truyền --schema.
export default defineConfig({
  schema: 'apps/wms/prisma/schema.prisma',
});
