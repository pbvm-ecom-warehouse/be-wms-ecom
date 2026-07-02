# syntax=docker/dockerfile:1
# ============================================================
# 1 image dùng chung cho cả 3 app (wms / ecommerce / notification).
# docker-compose override `command` cho từng container.
# ============================================================

# ---- builder: full deps + build CẢ 3 app ----
# (nest build trống chỉ build wms → phải build từng app)
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec nest build wms \
 && pnpm exec nest build ecommerce \
 && pnpm exec nest build notification

# ---- deps: chỉ production deps (bỏ nest-cli/ts → image gọn) ----
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY package.json ./
# Mặc định chạy wms; compose override cho ecommerce/notification.
CMD ["node", "dist/apps/wms/main"]
