# Swagger Auth Test Guide

## URLs

- WMS Swagger: `http://localhost:3001/api/wms/docs`
- Ecommerce Swagger: `http://localhost:3002/api/shop/docs`

Swagger da bat:

- Try it out mac dinh
- Giu Bearer token sau khi authorize/reload
- Hien request duration

## Chay server

Tu folder `be-wms-ecom`:

```powershell
pnpm start:wms
pnpm start:ecom
```

Neu Windows bao loi `EPERM unlink dist/...`, dong cac process Nest/Node dang chay hoac xoa thu muc `dist` bang terminal co quyen phu hop, roi chay lai.

## WMS flow nhanh

1. Mo `POST /api/wms/auth/bootstrap-admin` neu DB chua co user.
2. Goi `POST /api/wms/auth/login`, copy `accessToken` va `refreshToken`.
3. Bam nut `Authorize` tren Swagger, nhap:

```text
Bearer <accessToken>
```

4. Test cac route can token:
   - `GET /api/wms/auth/me`
   - `POST /api/wms/auth/users`
   - `PATCH /api/wms/auth/users/{id}/roles`
   - `POST /api/wms/auth/users/{id}/lock`
   - `POST /api/wms/auth/users/{id}/unlock`
   - `POST /api/wms/auth/users/{id}/reset-password`
   - `POST /api/wms/auth/change-password`
5. Test refresh rotation:
   - Goi `POST /api/wms/auth/refresh` voi refresh token hien tai.
   - Dung lai refresh token cu se fail.

## Ecommerce customer flow nhanh

1. Goi `POST /api/shop/auth/register`, copy `accessToken` va `refreshToken`.
2. Bam `Authorize`, nhap:

```text
Bearer <accessToken>
```

3. Test route customer:
   - `GET /api/shop/auth/me`
   - `POST /api/shop/auth/resend-verify-email`
   - `POST /api/shop/auth/change-password`
   - `GET /api/shop/auth/addresses`
   - `POST /api/shop/auth/addresses`
   - `PATCH /api/shop/auth/addresses/{id}`
   - `POST /api/shop/auth/addresses/{id}/default`
   - `DELETE /api/shop/auth/addresses/{id}`
4. Test email token flow:
   - `POST /api/shop/auth/verify-email` can token tu notification event.
   - `POST /api/shop/auth/forgot-password` luon tra message trung tinh.
   - `POST /api/shop/auth/reset-password` can reset token tu notification event.

## Luu y Notification token

Auth service khong gui email truc tiep. Token verify/reset duoc dua sang queue `notification-queue` qua event:

- `customer.verify_requested`
- `customer.password_reset_requested`

Khi notification app/consoler chua hien thi token, co the xem job Redis hoac collection `customer_auth_tokens` chi co hash, khong co plaintext token. Muon test end-to-end that su can lay token plaintext tu notification consumer/log.
