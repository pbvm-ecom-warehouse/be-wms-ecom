# Swagger / OpenAPI Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm Swagger UI cho WMS (`/api/wms/docs`) và Ecommerce (`/api/shop/docs`), chỉ bật ở dev.

**Architecture:** Tạo helper `setupSwagger()` dùng chung trong `libs/common/src/bootstrap/` (giống pattern `setupApp()`), gọi trong `main.ts` mỗi app. Annotate DTOs + controllers hiện có bằng `@ApiProperty()`, `@ApiTags()`, `@ApiOperation()`, `@ApiResponse()`.

**Tech Stack:** `@nestjs/swagger`, NestJS decorators, `class-validator` (đã có).

---

## File Map

| File | Thay đổi |
|---|---|
| `package.json` | Thêm dep `@nestjs/swagger` |
| `libs/common/src/bootstrap/setup-swagger.ts` | Tạo mới — helper `setupSwagger()` |
| `libs/common/src/index.ts` | Re-export `setupSwagger` + `SetupSwaggerOptions` |
| `apps/wms/src/main.ts` | Gọi `setupSwagger()` sau `setupApp()` |
| `apps/ecommerce/src/main.ts` | Gọi `setupSwagger()` sau `setupApp()` |
| `apps/wms/src/auth/dto/auth.dto.ts` | Thêm `@ApiProperty()` vào mọi field |
| `apps/ecommerce/src/auth/dto/auth.dto.ts` | Thêm `@ApiProperty()` vào mọi field |
| `apps/wms/src/auth/auth.controller.ts` | Thêm `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` |
| `apps/ecommerce/src/auth/auth.controller.ts` | Thêm `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth` |
| `apps/wms/src/health/health.controller.ts` | Thêm `@ApiTags('health')` + `@ApiOperation` |
| `apps/ecommerce/src/health/health.controller.ts` | Thêm `@ApiTags('health')` + `@ApiOperation` |

---

## Task 1: Cài `@nestjs/swagger` và tạo `setupSwagger()` helper

**Files:**
- Modify: `package.json`
- Create: `libs/common/src/bootstrap/setup-swagger.ts`
- Modify: `libs/common/src/index.ts`

- [ ] **Step 1: Cài package**

```bash
cd /home/hoaiphuong/code/wms-ecom/be
pnpm add @nestjs/swagger
```

Expected: `@nestjs/swagger` xuất hiện trong `dependencies` của `package.json`.

- [ ] **Step 2: Tạo file `setup-swagger.ts`**

Tạo `libs/common/src/bootstrap/setup-swagger.ts` với nội dung:

```typescript
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface SetupSwaggerOptions {
  title: string;
  description?: string;
  version?: string;
  /** Path tuyệt đối để serve UI, vd 'api/wms/docs'. */
  docsPath: string;
  isProd: boolean;
}

/**
 * Bật Swagger UI cho app — chỉ khi không phải production.
 * Gọi sau setupApp(), trước app.listen().
 */
export function setupSwagger(
  app: INestApplication,
  opts: SetupSwaggerOptions,
): void {
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

- [ ] **Step 3: Re-export từ `libs/common/src/index.ts`**

Thêm dòng sau vào cuối file `libs/common/src/index.ts`:

```typescript
export * from './bootstrap/setup-swagger';
```

File sau khi thêm:
```typescript
export * from './common.module';
export * from './common.service';
export * from './cors';
export * from './tokens';
export * from './errors';
export * from './pagination';
export * from './filters/all-exceptions.filter';
export * from './interceptors/response.interceptor';
export * from './decorators/raw-response.decorator';
export * from './decorators/throttle.decorators';
export * from './logging/pino.options';
export * from './logging/sanitize';
export * from './throttle/throttler.config';
export * from './bootstrap/setup-app';
export * from './bootstrap/setup-swagger';
```

- [ ] **Step 4: Kiểm tra TypeScript compile**

```bash
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: không có lỗi TS.

- [ ] **Step 5: Commit**

```bash
git add libs/common/src/bootstrap/setup-swagger.ts libs/common/src/index.ts package.json pnpm-lock.yaml
git commit -m "feat(common): thêm setupSwagger() helper dùng chung cho mọi app"
```

---

## Task 2: Wire `setupSwagger()` vào `main.ts` của WMS và Ecommerce

**Files:**
- Modify: `apps/wms/src/main.ts`
- Modify: `apps/ecommerce/src/main.ts`

- [ ] **Step 1: Cập nhật `apps/wms/src/main.ts`**

Thay toàn bộ nội dung file:

```typescript
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp, setupSwagger } from '@app/common';
import { AppModule } from './app.module';
import { Env } from './config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  setupApp(app, {
    corsOrigins: config.get('WMS_CORS_ORIGINS', { infer: true }),
    isProd,
    globalPrefix: 'api/wms',
  });

  setupSwagger(app, {
    title: 'WMS API',
    description: 'Quản lý kho: auth nhân viên, tồn kho, xuất nhập, in ly, vận đơn',
    docsPath: 'api/wms/docs',
    isProd,
  });

  await app.listen(config.get('WMS_PORT', { infer: true }));
}
void bootstrap();
```

- [ ] **Step 2: Cập nhật `apps/ecommerce/src/main.ts`**

Thay toàn bộ nội dung file:

```typescript
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setupApp, setupSwagger } from '@app/common';
import { Env } from './config/env.validation';
import { EcommerceModule } from './ecommerce.module';

async function bootstrap() {
  const app = await NestFactory.create(EcommerceModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  setupApp(app, {
    corsOrigins: config.get('ECOM_CORS_ORIGINS', { infer: true }),
    isProd,
    globalPrefix: 'api/shop',
  });

  setupSwagger(app, {
    title: 'Ecommerce API',
    description: 'Bán hàng: auth khách, catalog, đơn hàng, thanh toán',
    docsPath: 'api/shop/docs',
    isProd,
  });

  await app.listen(config.get('ECOM_PORT', { infer: true }));
}
void bootstrap();
```

- [ ] **Step 3: Kiểm tra TypeScript compile**

```bash
pnpm exec tsc --noEmit -p apps/wms/tsconfig.app.json
pnpm exec tsc --noEmit -p apps/ecommerce/tsconfig.app.json
```

Expected: không có lỗi TS.

- [ ] **Step 4: Commit**

```bash
git add apps/wms/src/main.ts apps/ecommerce/src/main.ts
git commit -m "feat(wms,ecommerce): wire setupSwagger() trong main.ts"
```

---

## Task 3: Annotate WMS auth DTOs và controller

**Files:**
- Modify: `apps/wms/src/auth/dto/auth.dto.ts`
- Modify: `apps/wms/src/auth/auth.controller.ts`

- [ ] **Step 1: Cập nhật `apps/wms/src/auth/dto/auth.dto.ts`**

Thay toàn bộ nội dung:

```typescript
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WmsRole } from '@app/auth';

/** Đăng nhập nhân viên bằng username + mật khẩu. */
export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'P@ssw0rd!', minLength: 1 })
  @IsString()
  @MinLength(1)
  password: string;
}

/** Đổi access token mới bằng refresh token. */
export class RefreshDto {
  @ApiProperty({ description: 'Refresh token nhận được lúc login' })
  @IsString()
  refreshToken: string;
}

/** Đăng xuất: thu hồi refresh token đang giữ. */
export class LogoutDto {
  @ApiProperty({ description: 'Refresh token cần thu hồi' })
  @IsString()
  refreshToken: string;
}

/** Tạo nhân viên (ADMIN) hoặc khởi tạo admin đầu tiên (bootstrap). */
export class CreateUserDto {
  @ApiProperty({ example: 'nguyen.van.a', minLength: 3 })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ example: 'P@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    example: [WmsRole.RECEIVER],
    enum: WmsRole,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(Object.values(WmsRole), { each: true })
  roles?: string[];
}
```

- [ ] **Step 2: Cập nhật `apps/wms/src/auth/auth.controller.ts`**

Thay toàn bộ nội dung:

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  Roles,
  RolesGuard,
  WmsRole,
} from '@app/auth';
import { AuthThrottle } from '@app/common';
import { AuthService } from './auth.service';
import { CreateUserDto, LoginDto, LogoutDto, RefreshDto } from './dto/auth.dto';

/**
 * Auth nhân viên WMS — prefix toàn cục 'api/wms' nên route thực tế là /api/wms/auth/*.
 * login/refresh/bootstrap-admin là public; còn lại cần JWT (+ role khi tạo user).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Đăng nhập nhân viên' })
  @ApiOkResponse({ description: 'Trả accessToken + refreshToken + mustChangePassword' })
  @ApiUnauthorizedResponse({ description: 'Sai tài khoản hoặc mật khẩu' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Post('refresh')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Đổi access token mới bằng refresh token' })
  @ApiOkResponse({ description: 'Trả accessToken + refreshToken mới (rotate)' })
  @ApiUnauthorizedResponse({ description: 'Refresh token không hợp lệ hoặc hết hạn' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất — thu hồi refresh token' })
  @ApiOkResponse({ description: '{ success: true }' })
  @ApiUnauthorizedResponse({ description: 'Access token thiếu hoặc không hợp lệ' })
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin nhân viên đang đăng nhập' })
  @ApiOkResponse({ description: 'Document User (không có passwordHash)' })
  @ApiUnauthorizedResponse({ description: 'Access token thiếu hoặc không hợp lệ' })
  me(@CurrentUser('sub') userId: string) {
    return this.auth.me(userId);
  }

  @Post('bootstrap-admin')
  @ApiOperation({ summary: 'Khởi tạo admin đầu tiên — chỉ chạy khi hệ thống chưa có nhân viên nào' })
  @ApiCreatedResponse({ description: '{ id, username, roles }' })
  @ApiForbiddenResponse({ description: 'Đã có nhân viên trong hệ thống' })
  bootstrapAdmin(@Body() dto: CreateUserDto) {
    return this.auth.bootstrapAdmin(dto);
  }

  @Post('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(WmsRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo nhân viên mới — chỉ ADMIN' })
  @ApiCreatedResponse({ description: '{ id, username, roles }' })
  @ApiUnauthorizedResponse({ description: 'Access token thiếu hoặc không hợp lệ' })
  @ApiForbiddenResponse({ description: 'Không đủ quyền ADMIN' })
  createUser(@Body() dto: CreateUserDto, @CurrentUser('sub') by: string) {
    return this.auth.createUser(dto, by);
  }
}
```

- [ ] **Step 3: Kiểm tra TypeScript compile**

```bash
pnpm exec tsc --noEmit -p apps/wms/tsconfig.app.json
```

Expected: không lỗi.

- [ ] **Step 4: Commit**

```bash
git add apps/wms/src/auth/dto/auth.dto.ts apps/wms/src/auth/auth.controller.ts
git commit -m "feat(wms): annotate auth DTOs + controller với @nestjs/swagger"
```

---

## Task 4: Annotate Ecommerce auth DTOs và controller

**Files:**
- Modify: `apps/ecommerce/src/auth/dto/auth.dto.ts`
- Modify: `apps/ecommerce/src/auth/auth.controller.ts`

- [ ] **Step 1: Cập nhật `apps/ecommerce/src/auth/dto/auth.dto.ts`**

Thay toàn bộ nội dung:

```typescript
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Đăng ký khách mới. */
export class RegisterDto {
  @ApiProperty({ example: 'khach@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'Nguyễn Thị B' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;
}

/** Đăng nhập khách bằng email + mật khẩu. */
export class LoginDto {
  @ApiProperty({ example: 'khach@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123!', minLength: 1 })
  @IsString()
  @MinLength(1)
  password: string;
}

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token nhận được lúc login/register' })
  @IsString()
  refreshToken: string;
}

export class LogoutDto {
  @ApiProperty({ description: 'Refresh token cần thu hồi' })
  @IsString()
  refreshToken: string;
}
```

- [ ] **Step 2: Cập nhật `apps/ecommerce/src/auth/auth.controller.ts`**

Thay toàn bộ nội dung:

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard } from '@app/auth';
import { AuthThrottle } from '@app/common';
import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './dto/auth.dto';

/**
 * Auth khách — prefix toàn cục 'api/shop' nên route thực tế là /api/shop/auth/*.
 * register/login/refresh public; me/logout cần JWT khách.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @AuthThrottle()
  @ApiOperation({ summary: 'Đăng ký tài khoản khách mới' })
  @ApiCreatedResponse({ description: 'Trả accessToken + refreshToken, gửi email xác minh' })
  @ApiConflictResponse({ description: 'Email đã được đăng ký' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Đăng nhập khách hàng' })
  @ApiOkResponse({ description: 'Trả accessToken + refreshToken + emailVerified' })
  @ApiUnauthorizedResponse({ description: 'Sai email hoặc mật khẩu' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(200)
  @AuthThrottle()
  @ApiOperation({ summary: 'Đổi access token mới bằng refresh token' })
  @ApiOkResponse({ description: 'Trả accessToken + refreshToken mới (rotate)' })
  @ApiUnauthorizedResponse({ description: 'Refresh token không hợp lệ hoặc hết hạn' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất — thu hồi refresh token' })
  @ApiOkResponse({ description: '{ success: true }' })
  @ApiUnauthorizedResponse({ description: 'Access token thiếu hoặc không hợp lệ' })
  logout(@Body() dto: LogoutDto) {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thông tin khách đang đăng nhập' })
  @ApiOkResponse({ description: 'Document Customer (không có passwordHash)' })
  @ApiUnauthorizedResponse({ description: 'Access token thiếu hoặc không hợp lệ' })
  me(@CurrentUser('sub') customerId: string) {
    return this.auth.me(customerId);
  }
}
```

- [ ] **Step 3: Kiểm tra TypeScript compile**

```bash
pnpm exec tsc --noEmit -p apps/ecommerce/tsconfig.app.json
```

Expected: không lỗi.

- [ ] **Step 4: Commit**

```bash
git add apps/ecommerce/src/auth/dto/auth.dto.ts apps/ecommerce/src/auth/auth.controller.ts
git commit -m "feat(ecommerce): annotate auth DTOs + controller với @nestjs/swagger"
```

---

## Task 5: Annotate health controllers và smoke test cuối

**Files:**
- Modify: `apps/wms/src/health/health.controller.ts`
- Modify: `apps/ecommerce/src/health/health.controller.ts`

- [ ] **Step 1: Cập nhật `apps/wms/src/health/health.controller.ts`**

Thay toàn bộ nội dung:

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@app/common';
import { QUEUES } from '@app/events';
import { Queue } from 'bullmq';
import { Connection, ConnectionStates } from 'mongoose';

/**
 * GET /api/wms/health — kiểm tra nhanh kết nối hạ tầng: Mongoose (wms_db) + Redis.
 * Trả 503 nếu một trong hai down để load balancer/monitor bắt được.
 * Bỏ throttle: monitor/load balancer gọi liên tục.
 */
@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectQueue(QUEUES.STOCK) private readonly queue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Kiểm tra kết nối MongoDB + Redis' })
  @ApiOkResponse({ description: '{ status: ok, db: up, redis: up }' })
  @ApiServiceUnavailableResponse({ description: '{ status: error, db, redis } — một trong hai down' })
  async check() {
    const db =
      this.conn.readyState === ConnectionStates.connected ? 'up' : 'down';

    let redis: 'up' | 'down' = 'down';
    try {
      // queue.client lộ kiểu IRedisClient tối giản (không có ping) → cast tới ioredis.
      const client = (await this.queue.client) as unknown as {
        ping(): Promise<string>;
      };
      if ((await client.ping()) === 'PONG') redis = 'up';
    } catch {
      redis = 'down';
    }

    if (db === 'down' || redis === 'down') {
      throw new ServiceUnavailableException({ status: 'error', db, redis });
    }
    return { status: 'ok', db, redis };
  }
}
```

- [ ] **Step 2: Cập nhật `apps/ecommerce/src/health/health.controller.ts`**

Thay toàn bộ nội dung:

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@app/common';
import { QUEUES } from '@app/events';
import { Queue } from 'bullmq';
import { Connection, ConnectionStates } from 'mongoose';

/**
 * GET /api/shop/health — kiểm tra nhanh kết nối hạ tầng: Mongoose (ecom_db) + Redis.
 * Trả 503 nếu một trong hai down. Đối xứng với health-check bên WMS.
 * Bỏ throttle: monitor/load balancer gọi liên tục.
 */
@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectQueue(QUEUES.STOCK) private readonly queue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Kiểm tra kết nối MongoDB + Redis' })
  @ApiOkResponse({ description: '{ status: ok, db: up, redis: up }' })
  @ApiServiceUnavailableResponse({ description: '{ status: error, db, redis } — một trong hai down' })
  async check() {
    const db =
      this.conn.readyState === ConnectionStates.connected ? 'up' : 'down';

    let redis: 'up' | 'down' = 'down';
    try {
      // queue.client lộ kiểu IRedisClient tối giản (không có ping) → cast tới ioredis.
      const client = (await this.queue.client) as unknown as {
        ping(): Promise<string>;
      };
      if ((await client.ping()) === 'PONG') redis = 'up';
    } catch {
      redis = 'down';
    }

    if (db === 'down' || redis === 'down') {
      throw new ServiceUnavailableException({ status: 'error', db, redis });
    }
    return { status: 'ok', db, redis };
  }
}
```

- [ ] **Step 3: Chạy lint và unit tests**

```bash
pnpm lint
pnpm test
```

Expected: eslint pass (0 errors), jest pass (tất cả unit tests trong libs/common vẫn xanh).

- [ ] **Step 4: Commit**

```bash
git add apps/wms/src/health/health.controller.ts apps/ecommerce/src/health/health.controller.ts
git commit -m "feat(wms,ecommerce): annotate health controllers với @nestjs/swagger"
```

- [ ] **Step 5: Smoke test thủ công — WMS**

Đảm bảo Redis đang chạy (`docker compose up -d`) và `.env` có `WMS_DATABASE_URL`, `REDIS_HOST=localhost`, `REDIS_PORT=6379`, `NODE_ENV=development`.

```bash
pnpm start:wms
```

Mở trình duyệt: `http://localhost:3001/api/wms/docs`

Expected:
- Swagger UI load được, thấy 2 nhóm: **auth** và **health**
- Nhóm `auth` có 6 endpoints: POST login, POST refresh, POST logout, GET me, POST bootstrap-admin, POST users
- Click "Authorize" → nhập Bearer token → GET /api/wms/auth/me trả 401 (chưa có token thật)

- [ ] **Step 6: Smoke test thủ công — Ecommerce**

```bash
pnpm start:ecom
```

Mở trình duyệt: `http://localhost:3002/api/shop/docs`

Expected:
- Swagger UI load được, thấy 2 nhóm: **auth** và **health**
- Nhóm `auth` có 5 endpoints: POST register, POST login, POST refresh, POST logout, GET me

- [ ] **Step 7: Kiểm tra prod không có Swagger**

```bash
NODE_ENV=production node -e "
const { setupSwagger } = require('./dist/libs/common/main');
" 2>&1 || true
# Hoặc đơn giản hơn: đọc code setupSwagger() và xác nhận guard isProd return sớm
```

Đơn giản nhất: thêm `console.log` tạm vào `setupSwagger()`, chạy với `isProd: true` và xác nhận không setup. Sau đó xóa log.

- [ ] **Step 8: Commit cuối**

```bash
git add -A
git commit -m "chore: Swagger/OpenAPI setup hoàn chỉnh cho WMS + Ecommerce"
```
