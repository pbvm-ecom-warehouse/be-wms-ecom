# Rule: DTO Convention — Request & Response

## Nguyên tắc cốt lõi

Mỗi endpoint có **2 loại DTO tách biệt**:
- **Request DTO** (`class-validator`) — validate input đầu vào
- **Response DTO** (`class-transformer` + `@Expose`) — định hình output, che field nhạy cảm, làm contract cho Swagger

Controller **không bao giờ** trả về Mongoose document hay service object thô. Service trả về data thô, controller (hoặc mapper) dùng `plainToInstance` trước khi return.

## Cấu trúc file

```
apps/<app>/src/<domain>/dto/
  create-xxx.dto.ts        ← request: tạo mới (POST body)
  update-xxx.dto.ts        ← request: cập nhật (PATCH body)
  query-xxx.dto.ts         ← request: query params (GET list)
  xxx.response.dto.ts      ← response: shape + Swagger (@Expose)
```

Nếu 1 domain chỉ có 1-2 endpoint đơn giản, gộp request + response vào cùng 1 file `xxx.dto.ts` vẫn được — nhưng phải **đặt tên class rõ ràng** (`LoginResponseDto`, không phải `LoginResponse`).

## Response DTO — quy ước bắt buộc

```ts
import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class XxxResponseDto {
  @Expose()
  @ApiProperty()
  id: string;           // luôn dùng 'id' (không phải '_id')

  @Expose()
  @ApiProperty()
  email: string;

  // field KHÔNG có @Expose() sẽ bị loại khi excludeExtraneousValues: true
}
```

**Quy tắc:**
1. `@Expose()` trên field muốn trả ra. Field không có `@Expose()` bị loại tự động.
2. Không cần `@Exclude()` — `excludeExtraneousValues: true` đã làm thay.
3. `_id` → map ra `id` (string): dùng `@Transform(({ obj }) => obj._id?.toString())` hoặc getter.
4. Không bao giờ expose `passwordHash`, `firebaseUid`, `deletedAt`, `__v`.
5. Nested object: dùng `@Type(() => NestedResponseDto)` + `@Expose()`.

## Gọi `plainToInstance` — ở đâu?

**Controller** gọi trực tiếp khi service trả về 1 entity đơn giản:
```ts
return plainToInstance(CustomerResponseDto, customer, {
  excludeExtraneousValues: true,
});
```

Nếu service cần trả về nhiều field custom (mix từ nhiều entity), service tự build plain object rồi controller vẫn `plainToInstance`.

**Không** tạo mapper class riêng — một lớp `plainToInstance` là đủ theo scale hiện tại.

## Swagger

Controller dùng decorator `@ApiOkResponse({ type: XxxResponseDto })` (hoặc `@ApiCreatedResponse`) thay vì chỉ ghi `description` dạng chuỗi.

```ts
@ApiCreatedResponse({ type: AuthTokenResponseDto })
@Post('register')
async register(@Body() dto: RegisterDto) {
  const result = await this.auth.register(dto);
  return plainToInstance(AuthTokenResponseDto, result, {
    excludeExtraneousValues: true,
  });
}
```

Nếu response là mảng: `@ApiOkResponse({ type: [XxxResponseDto] })`.

## Các Response DTO chuẩn sẵn (mẫu để copy)

### Auth token (dùng chung login/register/refresh)
`apps/ecommerce/src/auth/dto/auth.dto.ts` → `AuthTokenResponseDto`

### Customer profile (GET /me)
`apps/ecommerce/src/auth/dto/auth.dto.ts` → `CustomerResponseDto`

### Address item
`apps/ecommerce/src/auth/dto/auth.dto.ts` → `AddressResponseDto`

### User (WMS staff)
`apps/wms/src/auth/dto/auth.dto.ts` → `UserResponseDto`

## TypeScript strict — KHÔNG được dùng `any`

Mọi code trong project phải có type rõ ràng. **Cấm `any`** — kể cả implicit `any` từ destructuring.

| Tình huống | Sai | Đúng |
|---|---|---|
| `@Transform` callback | `({ obj }) => obj._id` | `({ obj }: { obj: { _id?: { toString(): string } } }) => obj._id?.toString()` |
| Service return type | `async login(): Promise<any>` | `async login(): Promise<{ accessToken: string; refreshToken: string; emailVerified: boolean }>` |
| Variable chưa biết shape | `const data: any = ...` | Khai báo interface/type rồi dùng |
| Cast buộc phải làm | tránh `as any` | Dùng `as unknown as TargetType` nếu thật sự cần |

**Với `@Transform` trong Response DTO** — luôn type `obj` theo shape thật sự của source:
```ts
@Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) => obj._id?.toString())
id!: string;
```

**ESLint rules liên quan** (đã bật trong project): `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-unsafe-member-access`, `@typescript-eslint/no-unsafe-return`. Build sẽ fail nếu vi phạm.

## Swagger — Roles & Enum (BẮT BUỘC)

### Hiển thị roles trong `@ApiOperation`

Mọi endpoint có `@Roles(...)` **phải** ghi roles vào `summary` của `@ApiOperation` theo format: `'<Mô tả ngắn> — [ROLE1, ROLE2]'`

```ts
// ❌ Sai — không biết ai được gọi
@Roles(WmsRole.ADMIN, WmsRole.MANAGER)
@ApiOperation({ summary: 'Danh sách nhân viên' })

// ✅ Đúng
@Roles(WmsRole.ADMIN, WmsRole.MANAGER)
@ApiOperation({ summary: 'Danh sách nhân viên — [ADMIN, MANAGER]' })
```

Endpoint **không có** `@Roles` (public hoặc chỉ cần đăng nhập):
```ts
// Public — không ghi gì thêm
@ApiOperation({ summary: 'Đăng nhập nhân viên' })

// Cần đăng nhập nhưng không giới hạn role
@ApiBearerAuth()
@ApiOperation({ summary: 'Thông tin nhân viên đang đăng nhập — [ALL_ROLES]' })
```

### Liệt kê enum trong `@ApiProperty`

Mọi field DTO (request hoặc response) có kiểu enum **phải** khai báo `enum:` trong `@ApiProperty` để Swagger hiển thị dropdown:

```ts
// ❌ Sai — Swagger không biết giá trị hợp lệ
@ApiProperty()
roles: WmsRole[];

// ✅ Đúng — Swagger hiển thị dropdown với các giá trị enum
@ApiProperty({ enum: WmsRole, isArray: true, example: [WmsRole.RECEIVER] })
roles: WmsRole[];

// ✅ Đúng — field đơn
@ApiProperty({ enum: WmsRole, example: WmsRole.ADMIN })
role: WmsRole;
```

Các enum hiện có trong project:
- `WmsRole` (`ADMIN | MANAGER | RECEIVER | PICKER | PRINTER | COUNTER`) — từ `@app/auth`
- `EcomRole` (`ECOM_MANAGER`) — từ `@app/auth`
- Enum domain-specific: khai báo trong schema/dto của từng app, import thẳng vào `@ApiProperty({ enum: XxxEnum })`

### Query DTO với enum

```ts
// ✅ Query param có enum
@ApiProperty({ enum: OrderStatus, required: false })
@IsEnum(OrderStatus)
@IsOptional()
status?: OrderStatus;
```

## Khi thêm domain mới

1. Xác định shape response (đừng để lọt field nhạy cảm).
2. Tạo `XxxResponseDto` với `@Expose()` cho từng field cần.
3. Controller wrap bằng `plainToInstance(..., { excludeExtraneousValues: true })`.
4. Gắn `@ApiOkResponse({ type: XxxResponseDto })` vào endpoint.
5. Mảng: `plainToInstance(XxxResponseDto, arr, { excludeExtraneousValues: true })` — tự xử lý array.
6. Mọi `@Roles(...)` → thêm `— [ROLE1, ROLE2]` vào `@ApiOperation({ summary })`.
7. Mọi field enum trong DTO → thêm `enum: XxxEnum` vào `@ApiProperty`.
