# Rule: Exception handling — dùng AppException, không throw NestJS exception thô

## Quy tắc bắt buộc

**Service** (bất kỳ file `*.service.ts`) **PHẢI dùng `AppException`** từ `@app/common`.
Không được throw `BadRequestException`, `NotFoundException`, `UnauthorizedException`, `ConflictException`, `ForbiddenException` trực tiếp trong service.

```ts
// ❌ Sai — FE nhận code không ổn định (map từ HTTP status)
throw new UnauthorizedException('Sai email hoặc mật khẩu');

// ✅ Đúng — FE nhận code ổn định để switch-case
throw new AppException('AUTH_INVALID_CREDENTIALS');

// ✅ Đúng — override message khi ngữ cảnh khác default
throw new AppException('AUTH_INVALID_CREDENTIALS', 'Mật khẩu cũ không đúng');
```

**Filter, guard, strategy** (`*.filter.ts`, `*.guard.ts`, `*.strategy.ts`) được phép dùng NestJS exception — chúng là infrastructure, `AllExceptionsFilter` sẽ wrap lại.

## Catalog 2 tầng

### Tầng 1 — Cross-cutting (`libs/common/src/errors/error-codes.ts`)
Codes dùng chung mọi app: UNAUTHENTICATED, NOT_FOUND, VALIDATION_FAILED, CONFLICT, RATE_LIMITED, INTERNAL + tất cả AUTH_* codes.

### Tầng 2 — App-domain
- Ecommerce: `apps/ecommerce/src/common/error-codes.ts` → `ECOM_ERRORS`
- WMS: `apps/wms/src/common/error-codes.ts` → `WMS_ERRORS`

Lý do tách: giữ `libs/common` không biết về business domain của từng app.

## Khi thêm code mới

1. **Xác định tầng**: cross-cutting (auth/rate-limit/validation) → `libs/common`; domain cụ thể → `apps/<app>/src/common/error-codes.ts`
2. **Thêm vào catalog**: `CODE: { status: HttpStatus.XXX, message: 'Tiếng Việt' }`
3. **Dùng trong service**: `throw new AppException('CODE')` hoặc `throw new AppException('CODE', 'override message')`

Override message chỉ khi cùng một code nhưng ngữ cảnh cần message khác nhau (vd `AUTH_INVALID_CREDENTIALS` dùng cho cả login lẫn change-password nhưng message khác).

## Output chuẩn (do AllExceptionsFilter tạo)

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Sai email hoặc mật khẩu"
  },
  "meta": {
    "requestId": "...",
    "timestamp": "...",
    "path": "/api/shop/auth/login"
  }
}
```

FE switch theo `error.code` — ổn định qua mọi lần refactor message.
