# Swagger / OpenAPI Setup — Design Spec

**Ngày:** 2026-06-15  
**Scope:** Dev tooling — thêm Swagger UI cho WMS + Ecommerce API  
**Trạng thái:** Approved, chờ implementation

---

## Mục tiêu

Thêm Swagger/OpenAPI docs cho 2 app có endpoint thật (WMS + Ecommerce).  
Notification app bỏ qua (còn là stub, chưa có endpoint thật).  
Docs **chỉ bật ở dev** (`NODE_ENV !== 'production'`) — không lộ trên prod.

---

## Kiến trúc

### Package cần cài
```
pnpm add @nestjs/swagger
```
`class-transformer` và `class-validator` đã có — Swagger dùng reflection qua chúng.

### File thay đổi

| File | Loại thay đổi |
|---|---|
| `libs/common/src/bootstrap/setup-swagger.ts` | Tạo mới — helper dùng chung |
| `libs/common/src/index.ts` | Re-export `setupSwagger` |
| `apps/wms/src/main.ts` | Gọi `setupSwagger()` |
| `apps/ecommerce/src/main.ts` | Gọi `setupSwagger()` |
| `apps/wms/src/auth/dto/auth.dto.ts` | Thêm `@ApiProperty()` |
| `apps/ecommerce/src/auth/dto/auth.dto.ts` | Thêm `@ApiProperty()` |
| `apps/wms/src/auth/auth.controller.ts` | Thêm `@ApiTags`, `@ApiOperation`, `@ApiResponse` |
| `apps/ecommerce/src/auth/auth.controller.ts` | Thêm `@ApiTags`, `@ApiOperation`, `@ApiResponse` |
| `apps/wms/src/health/health.controller.ts` | Thêm `@ApiTags('health')` |
| `apps/ecommerce/src/health/health.controller.ts` | Thêm `@ApiTags('health')` |

### URL truy cập (dev)
- WMS: `http://localhost:3001/api/wms/docs`
- Ecommerce: `http://localhost:3002/api/shop/docs`

---

## Chi tiết implementation

### 1. `setupSwagger()` helper

```typescript
// libs/common/src/bootstrap/setup-swagger.ts
export interface SetupSwaggerOptions {
  title: string;
  description?: string;
  version?: string;   // default '1.0'
  docsPath: string;   // 'api/wms/docs' | 'api/shop/docs'
  isProd: boolean;    // nhận từ main.ts giống setupApp() — không đọc process.env trực tiếp
}

export function setupSwagger(app: INestApplication, opts: SetupSwaggerOptions): void {
  if (opts.isProd) return;

  const config = new DocumentBuilder()
    .setTitle(opts.title)
    .setDescription(opts.description ?? '')
    .setVersion(opts.version ?? '1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(opts.docsPath, app, document);
}
```

Nhận `isProd: boolean` qua opts — nhất quán với `SetupAppOptions` trong `setup-app.ts`.

### 2. Gọi trong `main.ts`

```typescript
// apps/wms/src/main.ts (thêm sau setupApp(), trước app.listen())
const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

setupApp(app, { corsOrigins: ..., isProd, globalPrefix: 'api/wms' });
setupSwagger(app, {
  title: 'WMS API',
  description: 'Quản lý kho: auth nhân viên, tồn kho, xuất nhập',
  docsPath: 'api/wms/docs',
  isProd,
});
```

### 3. DTO annotation pattern

```typescript
export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'P@ssw0rd123', minLength: 6 })
  @IsString() @MinLength(6)
  password: string;
}
```

### 4. Controller annotation pattern

```typescript
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Đăng nhập nhân viên' })
  @ApiOkResponse({ description: 'Trả accessToken + refreshToken' })
  @ApiUnauthorizedResponse({ description: 'Sai tài khoản hoặc mật khẩu' })
  login(@Body() dto: LoginDto) { ... }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin nhân viên đang đăng nhập' })
  @ApiOkResponse({ description: 'Document User (không có passwordHash)' })
  me(...) { ... }
}
```

---

## Quy ước decorator

| Tình huống | Decorator cần dùng |
|---|---|
| Endpoint cần Bearer token | `@ApiBearerAuth()` |
| Nhóm endpoint cùng miền | `@ApiTags('auth')` / `@ApiTags('health')` |
| Mô tả endpoint | `@ApiOperation({ summary: '...' })` |
| Response 200/201 | `@ApiOkResponse` / `@ApiCreatedResponse` |
| Response lỗi | `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`, `@ApiConflictResponse` |
| Field DTO | `@ApiProperty({ example: ..., description: ... })` |

---

## Những gì KHÔNG làm trong scope này

- Không document response envelope `{ data, meta }` bằng generic type (để TODO)
- Không setup Swagger cho Notification app (stub)
- Không bật Swagger trên production
- Không thêm Swagger auth middleware (chỉ document, không bảo vệ docs page)

---

## Kiểm tra hoàn thành

- [ ] `pnpm start:wms` → truy cập `http://localhost:3001/api/wms/docs` thấy UI
- [ ] `pnpm start:ecom` → truy cập `http://localhost:3002/api/shop/docs` thấy UI
- [ ] Click "Authorize" → nhập Bearer token → gọi `GET /api/wms/auth/me` được
- [ ] Build `NODE_ENV=production` → không thấy `/docs` route
- [ ] `pnpm lint` pass, `pnpm test` pass
