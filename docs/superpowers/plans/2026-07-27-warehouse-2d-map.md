# Warehouse 2D Map & Weighted Put-away Suggestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép MANAGER bố trí sơ đồ kho 2D (zone/rack/aisle/gate với toạ độ thật, mỗi rack kích thước riêng), xem chi tiết từng tầng kệ (rack elevation) với tồn kho thật, và nhận gợi ý vị trí đặt hàng (put-away) theo weighted scoring (same-SKU + khoảng cách tới staging + best-fit thể tích) thay vì chỉ thuần thể tích như hiện tại.

**Architecture:** Mở rộng 2 schema Mongoose hiện có (`Zone`, `Rack`) thêm field toạ độ/kích thước; thêm 2 collection mới nhỏ (`Aisle`, `Gate`) trong cùng module `location`; thêm 1 endpoint ráp `WarehouseLayout` tổng hợp; nâng cấp `PutAwaySuggestionService` sang weighted scoring dùng toạ độ mới; thêm 1 endpoint mới liệt kê tồn kho theo shelf (đọc `InventoryStock`+`Lot`+`WarehouseItem`, không thêm schema). Phía FE: nối các component UI đã có sẵn (`WarehouseFloorPlan`, `WarehouseLayoutInspector`, `RackConfigurationDialog`, `WarehouseArchitectureScene`) vào 1 page mới bằng service gọi API thật, thay thế toàn bộ fallback/mock hiện có.

**Tech Stack:** NestJS + Mongoose (BE, `be/apps/wms`), Next.js App Router + TanStack Query + Axios (FE, `fe-pbvm-warehouse`), TypeScript strict (không `any`).

## Global Constraints

- Service trong `*.service.ts` PHẢI dùng `AppException` từ `@app/common`, không throw NestJS exception thô.
- Mọi error code mới thêm vào `be/libs/common/src/errors/error-codes.ts` (KHÔNG tạo `apps/wms/src/common/error-codes.ts` — file đó đã bị xoá có chủ đích, `AppException` chỉ đọc catalog ở `libs/common`).
- Schema Mongoose mới/sửa: giữ `@Schema({ collection: '...' })` snake_case, `timestamps: true`, đúng nhóm audit (Zone/Rack/Aisle/Gate là "master/catalog" → có `deletedAt` soft-delete theo field đã có; nhưng Aisle/Gate là phụ trợ layout thuần hiển thị — xem Task 2 để biết quyết định cụ thể).
- Response DTO: `@Expose()` + `class-transformer`, `_id` → `id` qua `@Transform`, không dùng `any` (kể cả implicit any trong destructure) — dùng type rõ ràng cho `obj` trong `@Transform`.
- Mọi `@Roles(...)` phải có `— [ROLE1, ROLE2]` trong `@ApiOperation({ summary })`. Mọi field enum trong DTO phải có `enum:` trong `@ApiProperty`.
- FE: dùng `apiClient` + `unwrapApiData`/`ApiEnvelope` từ `@/lib/api-contract`, theo đúng pattern `warehouse-structure.service.ts`. Không tạo mapper class riêng ở BE — 1 lớp `plainToInstance` là đủ.
- Route BE `/api/wms` (đã set ở `main.ts`, không đổi). Không transaction xuyên DB, không đọc chéo DB.
- 1 kho duy nhất (singleton) — không thêm `warehouseId` vào bất kỳ entity nào.
- Layout chỉnh trực tiếp, áp dụng ngay — không có trạng thái DRAFT/PUBLISHED ở BE.

---

## Phần A — Backend: Schema toạ độ + Aisle/Gate + API Layout

### Task 1: Thêm field toạ độ vào `Zone` schema

**Files:**
- Modify: `be/apps/wms/src/location/schemas/zone.schema.ts`
- Modify: `be/apps/wms/src/location/dto/zone.dto.ts`
- Test: `be/apps/wms/src/location/schemas/zone.schema.spec.ts` (tạo mới nếu chưa có — kiểm tra hiện trạng ở bước 1)

**Interfaces:**
- Produces: `Zone.xM/yM/widthM/heightM/rotation` (number, `rotation: 0 | 90`), field optional với default `0` khi chưa từng đặt (zone cũ tạo trước khi có field này sẽ có giá trị `0` — chấp nhận được vì MANAGER sẽ set lại qua UI map).
- Produces: `CreateZoneDto`/`UpdateZoneDto` nhận thêm `xM, yM, widthM, heightM, rotation` (optional ở Create — mặc định `0`, để không phá luồng tạo zone hiện tại từ trang `/locations` không có toạ độ).
- Produces: `ZoneResponseDto` expose thêm 5 field trên.

- [ ] **Step 1: Kiểm tra có test schema hiện có không**

Run: `find /home/hoaiphuong/code/wms-ecom/be/apps/wms/src/location/schemas -name "zone.schema.spec.ts"`
Nếu không có file, bỏ qua bước sửa test cũ, tạo file mới ở Step 2.

- [ ] **Step 2: Viết test cho field mới (schema path tồn tại + default value)**

Tạo/sửa `be/apps/wms/src/location/schemas/zone.schema.spec.ts`:

```typescript
import { ZoneSchema } from './zone.schema';

describe('Zone schema', () => {
  it('có field toạ độ/kích thước cho layout 2D', () => {
    const paths = ZoneSchema.paths;
    expect(paths['xM']).toBeDefined();
    expect(paths['yM']).toBeDefined();
    expect(paths['widthM']).toBeDefined();
    expect(paths['heightM']).toBeDefined();
    expect(paths['rotation']).toBeDefined();
  });

  it('rotation mặc định 0 khi không truyền', () => {
    const defaultRotation = ZoneSchema.path('rotation').getDefault();
    expect(defaultRotation).toBe(0);
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `cd be && npx jest apps/wms/src/location/schemas/zone.schema.spec.ts`
Expected: FAIL — `paths['xM']` là `undefined`.

- [ ] **Step 4: Thêm field vào `Zone` schema**

Sửa `be/apps/wms/src/location/schemas/zone.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ collection: 'zones', timestamps: true })
export class Zone {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  code!: string;

  /** Toạ độ góc trên-trái trên sơ đồ kho, đơn vị mét. */
  @Prop({ type: Number, default: 0 })
  xM!: number;

  @Prop({ type: Number, default: 0 })
  yM!: number;

  @Prop({ type: Number, default: 0 })
  widthM!: number;

  @Prop({ type: Number, default: 0 })
  heightM!: number;

  /** 0 hoặc 90 độ — xoay hình chữ nhật trên map, không xoay tự do. */
  @Prop({ type: Number, enum: [0, 90], default: 0 })
  rotation!: number;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type ZoneDocument = HydratedDocument<Zone>;
export const ZoneSchema = SchemaFactory.createForClass(Zone);
ZoneSchema.index({ deletedAt: 1 });
ZoneSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
```

- [ ] **Step 5: Chạy test, xác nhận PASS**

Run: `cd be && npx jest apps/wms/src/location/schemas/zone.schema.spec.ts`
Expected: PASS

- [ ] **Step 6: Cập nhật `CreateZoneDto`/`UpdateZoneDto`/`ZoneResponseDto`**

Sửa `be/apps/wms/src/location/dto/zone.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Types } from 'mongoose';

export class CreateZoneDto {
  @ApiProperty({ example: 'Khu A' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'A' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiPropertyOptional({ example: 1, description: 'Toạ độ X trên sơ đồ (mét)' })
  @IsOptional()
  @IsNumber()
  xM?: number;

  @ApiPropertyOptional({ example: 1, description: 'Toạ độ Y trên sơ đồ (mét)' })
  @IsOptional()
  @IsNumber()
  yM?: number;

  @ApiPropertyOptional({ example: 16 })
  @IsOptional()
  @IsNumber()
  widthM?: number;

  @ApiPropertyOptional({ example: 22 })
  @IsOptional()
  @IsNumber()
  heightM?: number;

  @ApiPropertyOptional({ example: 0, enum: [0, 90] })
  @IsOptional()
  @IsIn([0, 90])
  rotation?: number;
}

export class UpdateZoneDto extends PartialType(CreateZoneDto) {}

export class ZoneResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty()
  xM!: number;

  @Expose()
  @ApiProperty()
  yM!: number;

  @Expose()
  @ApiProperty()
  widthM!: number;

  @Expose()
  @ApiProperty()
  heightM!: number;

  @Expose()
  @ApiProperty({ enum: [0, 90] })
  rotation!: number;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
```

- [ ] **Step 7: Build để bắt lỗi type**

Run: `cd be && npx tsc -p apps/wms/tsconfig.app.json --noEmit`
Expected: không lỗi liên quan `zone.dto.ts`/`zone.schema.ts`.

- [ ] **Step 8: Commit**

```bash
cd be && git add apps/wms/src/location/schemas/zone.schema.ts apps/wms/src/location/schemas/zone.schema.spec.ts apps/wms/src/location/dto/zone.dto.ts
git commit -m "feat(wms): thêm toạ độ/kích thước 2D vào Zone schema"
```

---

### Task 2: Thêm field toạ độ/kích thước vào `Rack` schema (mỗi rack kích thước riêng)

**Files:**
- Modify: `be/apps/wms/src/location/schemas/rack.schema.ts`
- Modify: `be/apps/wms/src/location/dto/rack.dto.ts`
- Test: `be/apps/wms/src/location/schemas/rack.schema.spec.ts` (tạo mới)

**Interfaces:**
- Consumes: không phụ thuộc Task 1 trực tiếp (schema độc lập), nhưng cùng nhóm field convention.
- Produces: `Rack.xM/yM/widthM/depthM/rotation/levelCount/bayCount/accessPointXM/accessPointYM` — **mỗi rack tự khai báo riêng** (đã chốt trong spec, không dùng template chung). `accessPoint` lưu phẳng thành 2 field số (không sub-document) để đơn giản hoá — điểm mà nhân viên đứng để lấy/đặt hàng ở rack này, dùng làm 1 trong các điểm neo khi tính route sau này.
- Produces: `RackResponseDto` expose đủ các field trên.

- [ ] **Step 1: Viết test cho field mới**

Tạo `be/apps/wms/src/location/schemas/rack.schema.spec.ts`:

```typescript
import { RackSchema } from './rack.schema';

describe('Rack schema', () => {
  it('có field toạ độ/kích thước/cấu trúc riêng cho từng rack', () => {
    const paths = RackSchema.paths;
    expect(paths['xM']).toBeDefined();
    expect(paths['yM']).toBeDefined();
    expect(paths['widthM']).toBeDefined();
    expect(paths['depthM']).toBeDefined();
    expect(paths['rotation']).toBeDefined();
    expect(paths['levelCount']).toBeDefined();
    expect(paths['bayCount']).toBeDefined();
    expect(paths['accessPointXM']).toBeDefined();
    expect(paths['accessPointYM']).toBeDefined();
  });

  it('levelCount và bayCount mặc định 1', () => {
    expect(RackSchema.path('levelCount').getDefault()).toBe(1);
    expect(RackSchema.path('bayCount').getDefault()).toBe(1);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd be && npx jest apps/wms/src/location/schemas/rack.schema.spec.ts`
Expected: FAIL

- [ ] **Step 3: Thêm field vào `Rack` schema**

Sửa `be/apps/wms/src/location/schemas/rack.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'racks', timestamps: true })
export class Rack {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  zoneId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  code!: string;

  /** Toạ độ + kích thước riêng của rack này — không dùng chung 1 template, mỗi rack khai báo độc lập (đồng bộ giữa các rack là hành động tuỳ chọn qua UI, không phải ràng buộc dữ liệu). */
  @Prop({ type: Number, default: 0 })
  xM!: number;

  @Prop({ type: Number, default: 0 })
  yM!: number;

  @Prop({ type: Number, default: 0 })
  widthM!: number;

  @Prop({ type: Number, default: 0 })
  depthM!: number;

  @Prop({ type: Number, enum: [0, 90], default: 0 })
  rotation!: number;

  @Prop({ type: Number, default: 1, min: 1 })
  levelCount!: number;

  @Prop({ type: Number, default: 1, min: 1 })
  bayCount!: number;

  /** Điểm nhân viên đứng để thao tác với rack — dùng làm điểm neo khi tính route. */
  @Prop({ type: Number, default: 0 })
  accessPointXM!: number;

  @Prop({ type: Number, default: 0 })
  accessPointYM!: number;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type RackDocument = HydratedDocument<Rack>;
export const RackSchema = SchemaFactory.createForClass(Rack);
RackSchema.index({ zoneId: 1, deletedAt: 1 });
RackSchema.index(
  { zoneId: 1, code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd be && npx jest apps/wms/src/location/schemas/rack.schema.spec.ts`
Expected: PASS

- [ ] **Step 5: Cập nhật `CreateRackDto`/`UpdateRackDto`/`RackResponseDto`**

Sửa `be/apps/wms/src/location/dto/rack.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Types } from 'mongoose';

export class CreateRackDto {
  @ApiProperty({ example: '60d5ec49f1b2c72b3c8e4f02' })
  @IsMongoId()
  zoneId!: string;

  @ApiProperty({ example: 'Kệ A1' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'A1' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  xM?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  yM?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  widthM?: number;

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @IsNumber()
  depthM?: number;

  @ApiPropertyOptional({ example: 0, enum: [0, 90] })
  @IsOptional()
  @IsIn([0, 90])
  rotation?: number;

  @ApiPropertyOptional({ example: 3, description: 'Số tầng của rack này' })
  @IsOptional()
  @IsInt()
  @Min(1)
  levelCount?: number;

  @ApiPropertyOptional({ example: 3, description: 'Số khoang của rack này' })
  @IsOptional()
  @IsInt()
  @Min(1)
  bayCount?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsNumber()
  accessPointXM?: number;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsNumber()
  accessPointYM?: number;
}

export class UpdateRackDto extends PartialType(CreateRackDto) {}

export class RackResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @Transform(({ obj }: { obj: { zoneId?: Types.ObjectId } }) =>
    obj.zoneId?.toString(),
  )
  @ApiProperty()
  zoneId!: string;

  @Expose()
  @ApiProperty()
  name!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty()
  xM!: number;

  @Expose()
  @ApiProperty()
  yM!: number;

  @Expose()
  @ApiProperty()
  widthM!: number;

  @Expose()
  @ApiProperty()
  depthM!: number;

  @Expose()
  @ApiProperty({ enum: [0, 90] })
  rotation!: number;

  @Expose()
  @ApiProperty()
  levelCount!: number;

  @Expose()
  @ApiProperty()
  bayCount!: number;

  @Expose()
  @ApiProperty()
  accessPointXM!: number;

  @Expose()
  @ApiProperty()
  accessPointYM!: number;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
```

- [ ] **Step 6: Build để bắt lỗi type**

Run: `cd be && npx tsc -p apps/wms/tsconfig.app.json --noEmit`
Expected: không lỗi liên quan `rack.dto.ts`/`rack.schema.ts`.

- [ ] **Step 7: Commit**

```bash
cd be && git add apps/wms/src/location/schemas/rack.schema.ts apps/wms/src/location/schemas/rack.schema.spec.ts apps/wms/src/location/dto/rack.dto.ts
git commit -m "feat(wms): thêm toạ độ/kích thước riêng từng rack (levelCount, bayCount, accessPoint)"
```

---

### Task 3: Tạo `Aisle` schema + CRUD (lối đi)

**Files:**
- Create: `be/apps/wms/src/location/schemas/aisle.schema.ts`
- Create: `be/apps/wms/src/location/schemas/aisle.schema.spec.ts`
- Create: `be/apps/wms/src/location/dto/aisle.dto.ts`
- Modify: `be/apps/wms/src/location/location.repository.ts`
- Modify: `be/apps/wms/src/location/location.service.ts`
- Modify: `be/apps/wms/src/location/location.controller.ts`
- Modify: `be/apps/wms/src/location/location.module.ts`
- Modify: `be/libs/common/src/errors/error-codes.ts`
- Test: `be/apps/wms/src/location/location.service.spec.ts` (mở rộng)

**Interfaces:**
- Produces: `Aisle { code, type: 'MAIN'|'RACK', xM, yM, widthM, heightM }` document (soft-delete, master/catalog).
- Produces: `LocationRepository.createAisle/findAllAisles/findAisleById/updateAisle/softDeleteAisle`.
- Produces: `LocationService.createAisle/listAisles/getAisle/updateAisle/deleteAisle`.
- Produces: endpoints `POST/GET /location/aisles`, `GET/PATCH/DELETE /location/aisles/:id`.
- Produces: error codes `AISLE_NOT_FOUND`, `AISLE_CODE_EXISTS` trong `libs/common/src/errors/error-codes.ts`.

- [ ] **Step 1: Thêm error code vào catalog dùng chung**

Sửa `be/libs/common/src/errors/error-codes.ts`, thêm ngay sau block `SHELF_CODE_EXISTS` (trong nhóm `// ── WMS — Location Structure (Zone/Rack/Shelf) ──`, đổi tiêu đề nhóm thành bao gồm Aisle/Gate):

```typescript
  // ── WMS — Location Structure (Zone/Rack/Shelf/Aisle/Gate) ───────────────
  ZONE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy khu vực',
  },
  ZONE_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã khu vực đã tồn tại',
  },
  RACK_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy kệ',
  },
  RACK_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã kệ đã tồn tại trong zone này',
  },
  SHELF_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy tầng kệ',
  },
  SHELF_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã barcode tầng đã tồn tại',
  },
  AISLE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy lối đi',
  },
  AISLE_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã lối đi đã tồn tại',
  },
  GATE_NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: 'Không tìm thấy cổng',
  },
  GATE_CODE_EXISTS: {
    status: HttpStatus.CONFLICT,
    message: 'Mã cổng đã tồn tại',
  },
```

(Xoá 4 field ZONE/RACK/SHELF gốc trùng lặp — chỉ thêm 4 dòng AISLE/GATE mới vào cuối nhóm hiện có, không đổi nội dung cũ.)

- [ ] **Step 2: Viết test schema Aisle**

Tạo `be/apps/wms/src/location/schemas/aisle.schema.spec.ts`:

```typescript
import { AisleSchema } from './aisle.schema';

describe('Aisle schema', () => {
  it('có đủ field code/type/toạ độ/kích thước', () => {
    const paths = AisleSchema.paths;
    expect(paths['code']).toBeDefined();
    expect(paths['type']).toBeDefined();
    expect(paths['xM']).toBeDefined();
    expect(paths['yM']).toBeDefined();
    expect(paths['widthM']).toBeDefined();
    expect(paths['heightM']).toBeDefined();
  });

  it('collection tên aisles', () => {
    expect(AisleSchema.get('collection')).toBe('aisles');
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `cd be && npx jest apps/wms/src/location/schemas/aisle.schema.spec.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 4: Tạo `Aisle` schema**

Tạo `be/apps/wms/src/location/schemas/aisle.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum AisleType {
  MAIN = 'MAIN',
  RACK = 'RACK',
}

/** Lối đi trên sơ đồ kho — thuần phục vụ hiển thị 2D, không ảnh hưởng nghiệp vụ tồn kho. */
@Schema({ collection: 'aisles', timestamps: true })
export class Aisle {
  @Prop({ required: true })
  code!: string;

  @Prop({ enum: AisleType, required: true })
  type!: AisleType;

  @Prop({ type: Number, default: 0 })
  xM!: number;

  @Prop({ type: Number, default: 0 })
  yM!: number;

  @Prop({ type: Number, default: 0 })
  widthM!: number;

  @Prop({ type: Number, default: 0 })
  heightM!: number;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type AisleDocument = HydratedDocument<Aisle>;
export const AisleSchema = SchemaFactory.createForClass(Aisle);
AisleSchema.index({ deletedAt: 1 });
AisleSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
```

- [ ] **Step 5: Chạy test, xác nhận PASS**

Run: `cd be && npx jest apps/wms/src/location/schemas/aisle.schema.spec.ts`
Expected: PASS

- [ ] **Step 6: Tạo DTO cho Aisle**

Tạo `be/apps/wms/src/location/dto/aisle.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Types } from 'mongoose';
import { AisleType } from '../schemas/aisle.schema';

export class CreateAisleDto {
  @ApiProperty({ example: 'MAIN-01' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ enum: AisleType, example: AisleType.MAIN })
  @IsEnum(AisleType)
  type!: AisleType;

  @ApiPropertyOptional({ example: 18 })
  @IsOptional()
  @IsNumber()
  xM?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  yM?: number;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsNumber()
  widthM?: number;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @IsNumber()
  heightM?: number;
}

export class UpdateAisleDto extends PartialType(CreateAisleDto) {}

export class AisleResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty({ enum: AisleType })
  type!: AisleType;

  @Expose()
  @ApiProperty()
  xM!: number;

  @Expose()
  @ApiProperty()
  yM!: number;

  @Expose()
  @ApiProperty()
  widthM!: number;

  @Expose()
  @ApiProperty()
  heightM!: number;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
```

- [ ] **Step 7: Thêm CRUD Aisle vào `LocationRepository`**

Thêm vào cuối `be/apps/wms/src/location/location.repository.ts` (trước dấu `}` cuối class), import thêm ở đầu file:

```typescript
import { Aisle, AisleDocument } from './schemas/aisle.schema';
import { CreateAisleDto, UpdateAisleDto } from './dto/aisle.dto';
```

Thêm constructor param:

```typescript
    @InjectModel(Aisle.name) private readonly aisleModel: Model<AisleDocument>,
```

Thêm methods (theo đúng pattern Zone ở trên):

```typescript
  // ─── Aisle ────────────────────────────────────────────────────────────────

  async createAisle(
    dto: CreateAisleDto,
    actorId: string,
  ): Promise<AisleDocument> {
    return this.aisleModel.create({
      ...dto,
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    });
  }

  async findAllAisles(): Promise<AisleDocument[]> {
    return this.aisleModel.find(SOFT_DELETE_FILTER).sort({ code: 1 }).exec();
  }

  async findAisleById(id: string): Promise<AisleDocument | null> {
    return this.aisleModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }).exec();
  }

  async findAisleByCode(code: string): Promise<AisleDocument | null> {
    return this.aisleModel.findOne({ code, ...SOFT_DELETE_FILTER }).exec();
  }

  async updateAisle(
    id: string,
    dto: UpdateAisleDto,
    actorId: string,
  ): Promise<AisleDocument | null> {
    return this.aisleModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { ...dto, updatedBy: new Types.ObjectId(actorId) },
        { new: true },
      )
      .exec();
  }

  async softDeleteAisle(id: string, actorId: string): Promise<boolean> {
    const res = await this.aisleModel
      .updateOne(
        { _id: id, ...SOFT_DELETE_FILTER },
        { deletedAt: new Date(), updatedBy: new Types.ObjectId(actorId) },
      )
      .exec();
    return res.modifiedCount > 0;
  }
```

- [ ] **Step 8: Thêm methods vào `LocationService`**

Thêm vào `be/apps/wms/src/location/location.service.ts`, import ở đầu:

```typescript
import type { AisleDocument } from './schemas/aisle.schema';
import type { CreateAisleDto, UpdateAisleDto } from './dto/aisle.dto';
```

Thêm vào class (theo pattern Zone):

```typescript
  // ─── Aisle ────────────────────────────────────────────────────────────────

  async createAisle(
    dto: CreateAisleDto,
    actorId: string,
  ): Promise<AisleDocument> {
    const existing = await this.repo.findAisleByCode(dto.code);
    if (existing) throw new AppException('AISLE_CODE_EXISTS');
    return this.repo.createAisle(dto, actorId);
  }

  async listAisles(): Promise<AisleDocument[]> {
    return this.repo.findAllAisles();
  }

  async getAisle(id: string): Promise<AisleDocument> {
    const doc = await this.repo.findAisleById(id);
    if (!doc) throw new AppException('AISLE_NOT_FOUND');
    return doc;
  }

  async updateAisle(
    id: string,
    dto: UpdateAisleDto,
    actorId: string,
  ): Promise<AisleDocument> {
    if (dto.code) {
      const existing = await this.repo.findAisleByCode(dto.code);
      if (existing && existing._id.toString() !== id)
        throw new AppException('AISLE_CODE_EXISTS');
    }
    const doc = await this.repo.updateAisle(id, dto, actorId);
    if (!doc) throw new AppException('AISLE_NOT_FOUND');
    return doc;
  }

  async deleteAisle(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteAisle(id, actorId);
    if (!deleted) throw new AppException('AISLE_NOT_FOUND');
  }
```

- [ ] **Step 9: Thêm endpoints vào `LocationController`**

Thêm vào `be/apps/wms/src/location/location.controller.ts`, import thêm:

```typescript
import { CreateAisleDto, UpdateAisleDto, AisleResponseDto } from './dto/aisle.dto';
```

Thêm routes (đặt sau block Shelf static routes, trước `// ─── Zone param routes ───`, để giữ đúng thứ tự static-trước-param theo comment sẵn có):

```typescript
  // ─── Aisle (static sub-routes phải đặt TRƯỚC `:id`) ──────────────────────

  @Post('aisles')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Tạo lối đi (aisle) — [MANAGER]' })
  @ApiCreatedResponse({ type: AisleResponseDto })
  async createAisle(
    @Body() dto: CreateAisleDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<AisleResponseDto> {
    const doc = await this.svc.createAisle(dto, actorId);
    return plainToInstance(AisleResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Get('aisles')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Danh sách lối đi — [MANAGER]' })
  @ApiOkResponse({ type: [AisleResponseDto] })
  async listAisles(): Promise<AisleResponseDto[]> {
    const docs = await this.svc.listAisles();
    return plainToInstance(
      AisleResponseDto,
      docs.map((d) => d.toObject()),
      TO_INSTANCE_OPTS,
    );
  }

  @Get('aisles/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết lối đi — [MANAGER]' })
  @ApiOkResponse({ type: AisleResponseDto })
  async getAisle(@Param('id') id: string): Promise<AisleResponseDto> {
    const doc = await this.svc.getAisle(id);
    return plainToInstance(AisleResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Patch('aisles/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật lối đi — [MANAGER]' })
  @ApiOkResponse({ type: AisleResponseDto })
  async updateAisle(
    @Param('id') id: string,
    @Body() dto: UpdateAisleDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<AisleResponseDto> {
    const doc = await this.svc.updateAisle(id, dto, actorId);
    return plainToInstance(AisleResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Delete('aisles/:id')
  @Roles(WmsRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá lối đi (soft-delete) — [MANAGER]' })
  @ApiNoContentResponse()
  async deleteAisle(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<void> {
    await this.svc.deleteAisle(id, actorId);
  }
```

- [ ] **Step 10: Đăng ký `Aisle` schema trong `LocationModule`**

Sửa `be/apps/wms/src/location/location.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Zone, ZoneSchema } from './schemas/zone.schema';
import { Rack, RackSchema } from './schemas/rack.schema';
import { Shelf, ShelfSchema } from './schemas/shelf.schema';
import { Aisle, AisleSchema } from './schemas/aisle.schema';
import { LocationRepository } from './location.repository';
import { LocationService } from './location.service';
import { LocationController } from './location.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Zone.name, schema: ZoneSchema },
      { name: Rack.name, schema: RackSchema },
      { name: Shelf.name, schema: ShelfSchema },
      { name: Aisle.name, schema: AisleSchema },
    ]),
  ],
  providers: [LocationRepository, LocationService],
  controllers: [LocationController],
  exports: [LocationService, LocationRepository],
})
export class LocationModule {}
```

(Gate sẽ được thêm ở Task 4 — sửa lại file này 1 lần nữa.)

- [ ] **Step 11: Build và chạy toàn bộ test location**

Run: `cd be && npx tsc -p apps/wms/tsconfig.app.json --noEmit && npx jest apps/wms/src/location`
Expected: build sạch, tất cả test PASS.

- [ ] **Step 12: Commit**

```bash
cd be && git add apps/wms/src/location libs/common/src/errors/error-codes.ts
git commit -m "feat(wms): thêm entity Aisle (lối đi) với CRUD đầy đủ"
```

---

### Task 4: Tạo `Gate` schema + CRUD (cổng)

**Files:**
- Create: `be/apps/wms/src/location/schemas/gate.schema.ts`
- Create: `be/apps/wms/src/location/schemas/gate.schema.spec.ts`
- Create: `be/apps/wms/src/location/dto/gate.dto.ts`
- Modify: `be/apps/wms/src/location/location.repository.ts`
- Modify: `be/apps/wms/src/location/location.service.ts`
- Modify: `be/apps/wms/src/location/location.controller.ts`
- Modify: `be/apps/wms/src/location/location.module.ts`

**Interfaces:**
- Consumes: error codes `GATE_NOT_FOUND`/`GATE_CODE_EXISTS` đã thêm ở Task 3 Step 1.
- Produces: `Gate { code, label, xM, yM }` document (soft-delete).
- Produces: `LocationRepository.createGate/findAllGates/findGateById/updateGate/softDeleteGate`.
- Produces: `LocationService.createGate/listGates/getGate/updateGate/deleteGate`.
- Produces: endpoints `POST/GET /location/gates`, `GET/PATCH/DELETE /location/gates/:id`.

Đây là bản sao cấu trúc y hệt Task 3 (Aisle) nhưng đơn giản hơn (không có `type`, không `widthM/heightM`).

- [ ] **Step 1: Viết test schema Gate**

Tạo `be/apps/wms/src/location/schemas/gate.schema.spec.ts`:

```typescript
import { GateSchema } from './gate.schema';

describe('Gate schema', () => {
  it('có đủ field code/label/toạ độ', () => {
    const paths = GateSchema.paths;
    expect(paths['code']).toBeDefined();
    expect(paths['label']).toBeDefined();
    expect(paths['xM']).toBeDefined();
    expect(paths['yM']).toBeDefined();
  });

  it('collection tên gates', () => {
    expect(GateSchema.get('collection')).toBe('gates');
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd be && npx jest apps/wms/src/location/schemas/gate.schema.spec.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Tạo `Gate` schema**

Tạo `be/apps/wms/src/location/schemas/gate.schema.ts`:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** Cổng nhập/xuất trên sơ đồ kho — điểm gốc tham chiếu khi tính route điều hướng. */
@Schema({ collection: 'gates', timestamps: true })
export class Gate {
  @Prop({ required: true })
  code!: string;

  @Prop({ required: true })
  label!: string;

  @Prop({ type: Number, default: 0 })
  xM!: number;

  @Prop({ type: Number, default: 0 })
  yM!: number;

  @Prop({ type: Types.ObjectId })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export type GateDocument = HydratedDocument<Gate>;
export const GateSchema = SchemaFactory.createForClass(Gate);
GateSchema.index({ deletedAt: 1 });
GateSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd be && npx jest apps/wms/src/location/schemas/gate.schema.spec.ts`
Expected: PASS

- [ ] **Step 5: Tạo DTO cho Gate**

Tạo `be/apps/wms/src/location/dto/gate.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Types } from 'mongoose';

export class CreateGateDto {
  @ApiProperty({ example: 'GATE-01' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ example: 'Cổng vào' })
  @IsString()
  @MinLength(1)
  label!: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  xM?: number;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @IsNumber()
  yM?: number;
}

export class UpdateGateDto extends PartialType(CreateGateDto) {}

export class GateResponseDto {
  @Expose()
  @Transform(({ obj }: { obj: { _id?: Types.ObjectId } }) =>
    obj._id?.toString(),
  )
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  code!: string;

  @Expose()
  @ApiProperty()
  label!: string;

  @Expose()
  @ApiProperty()
  xM!: number;

  @Expose()
  @ApiProperty()
  yM!: number;

  @Expose()
  @ApiProperty()
  createdAt!: Date;

  @Expose()
  @ApiProperty()
  updatedAt!: Date;
}
```

- [ ] **Step 6: Thêm CRUD Gate vào `LocationRepository`**

Thêm import ở đầu `be/apps/wms/src/location/location.repository.ts`:

```typescript
import { Gate, GateDocument } from './schemas/gate.schema';
import { CreateGateDto, UpdateGateDto } from './dto/gate.dto';
```

Thêm constructor param:

```typescript
    @InjectModel(Gate.name) private readonly gateModel: Model<GateDocument>,
```

Thêm methods:

```typescript
  // ─── Gate ─────────────────────────────────────────────────────────────────

  async createGate(dto: CreateGateDto, actorId: string): Promise<GateDocument> {
    return this.gateModel.create({
      ...dto,
      createdBy: new Types.ObjectId(actorId),
      updatedBy: new Types.ObjectId(actorId),
    });
  }

  async findAllGates(): Promise<GateDocument[]> {
    return this.gateModel.find(SOFT_DELETE_FILTER).sort({ code: 1 }).exec();
  }

  async findGateById(id: string): Promise<GateDocument | null> {
    return this.gateModel.findOne({ _id: id, ...SOFT_DELETE_FILTER }).exec();
  }

  async findGateByCode(code: string): Promise<GateDocument | null> {
    return this.gateModel.findOne({ code, ...SOFT_DELETE_FILTER }).exec();
  }

  async updateGate(
    id: string,
    dto: UpdateGateDto,
    actorId: string,
  ): Promise<GateDocument | null> {
    return this.gateModel
      .findOneAndUpdate(
        { _id: id, ...SOFT_DELETE_FILTER },
        { ...dto, updatedBy: new Types.ObjectId(actorId) },
        { new: true },
      )
      .exec();
  }

  async softDeleteGate(id: string, actorId: string): Promise<boolean> {
    const res = await this.gateModel
      .updateOne(
        { _id: id, ...SOFT_DELETE_FILTER },
        { deletedAt: new Date(), updatedBy: new Types.ObjectId(actorId) },
      )
      .exec();
    return res.modifiedCount > 0;
  }
```

- [ ] **Step 7: Thêm methods vào `LocationService`**

Thêm import ở đầu `be/apps/wms/src/location/location.service.ts`:

```typescript
import type { GateDocument } from './schemas/gate.schema';
import type { CreateGateDto, UpdateGateDto } from './dto/gate.dto';
```

Thêm vào class:

```typescript
  // ─── Gate ─────────────────────────────────────────────────────────────────

  async createGate(dto: CreateGateDto, actorId: string): Promise<GateDocument> {
    const existing = await this.repo.findGateByCode(dto.code);
    if (existing) throw new AppException('GATE_CODE_EXISTS');
    return this.repo.createGate(dto, actorId);
  }

  async listGates(): Promise<GateDocument[]> {
    return this.repo.findAllGates();
  }

  async getGate(id: string): Promise<GateDocument> {
    const doc = await this.repo.findGateById(id);
    if (!doc) throw new AppException('GATE_NOT_FOUND');
    return doc;
  }

  async updateGate(
    id: string,
    dto: UpdateGateDto,
    actorId: string,
  ): Promise<GateDocument> {
    if (dto.code) {
      const existing = await this.repo.findGateByCode(dto.code);
      if (existing && existing._id.toString() !== id)
        throw new AppException('GATE_CODE_EXISTS');
    }
    const doc = await this.repo.updateGate(id, dto, actorId);
    if (!doc) throw new AppException('GATE_NOT_FOUND');
    return doc;
  }

  async deleteGate(id: string, actorId: string): Promise<void> {
    const deleted = await this.repo.softDeleteGate(id, actorId);
    if (!deleted) throw new AppException('GATE_NOT_FOUND');
  }
```

- [ ] **Step 8: Thêm endpoints vào `LocationController`**

Thêm import:

```typescript
import { CreateGateDto, UpdateGateDto, GateResponseDto } from './dto/gate.dto';
```

Thêm routes (đặt sau block Aisle):

```typescript
  // ─── Gate (static sub-routes phải đặt TRƯỚC `:id`) ───────────────────────

  @Post('gates')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Tạo cổng (gate) — [MANAGER]' })
  @ApiCreatedResponse({ type: GateResponseDto })
  async createGate(
    @Body() dto: CreateGateDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<GateResponseDto> {
    const doc = await this.svc.createGate(dto, actorId);
    return plainToInstance(GateResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Get('gates')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Danh sách cổng — [MANAGER]' })
  @ApiOkResponse({ type: [GateResponseDto] })
  async listGates(): Promise<GateResponseDto[]> {
    const docs = await this.svc.listGates();
    return plainToInstance(
      GateResponseDto,
      docs.map((d) => d.toObject()),
      TO_INSTANCE_OPTS,
    );
  }

  @Get('gates/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Chi tiết cổng — [MANAGER]' })
  @ApiOkResponse({ type: GateResponseDto })
  async getGate(@Param('id') id: string): Promise<GateResponseDto> {
    const doc = await this.svc.getGate(id);
    return plainToInstance(GateResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Patch('gates/:id')
  @Roles(WmsRole.MANAGER)
  @ApiOperation({ summary: 'Cập nhật cổng — [MANAGER]' })
  @ApiOkResponse({ type: GateResponseDto })
  async updateGate(
    @Param('id') id: string,
    @Body() dto: UpdateGateDto,
    @CurrentUser('sub') actorId: string,
  ): Promise<GateResponseDto> {
    const doc = await this.svc.updateGate(id, dto, actorId);
    return plainToInstance(GateResponseDto, doc.toObject(), TO_INSTANCE_OPTS);
  }

  @Delete('gates/:id')
  @Roles(WmsRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá cổng (soft-delete) — [MANAGER]' })
  @ApiNoContentResponse()
  async deleteGate(
    @Param('id') id: string,
    @CurrentUser('sub') actorId: string,
  ): Promise<void> {
    await this.svc.deleteGate(id, actorId);
  }
```

- [ ] **Step 9: Đăng ký `Gate` schema trong `LocationModule`**

Sửa `be/apps/wms/src/location/location.module.ts` — thêm import và entry:

```typescript
import { Gate, GateSchema } from './schemas/gate.schema';
```

```typescript
      { name: Gate.name, schema: GateSchema },
```

- [ ] **Step 10: Build và chạy toàn bộ test location**

Run: `cd be && npx tsc -p apps/wms/tsconfig.app.json --noEmit && npx jest apps/wms/src/location`
Expected: build sạch, tất cả test PASS.

- [ ] **Step 11: Commit**

```bash
cd be && git add apps/wms/src/location
git commit -m "feat(wms): thêm entity Gate (cổng) với CRUD đầy đủ"
```

---

### Task 5: API tổng hợp `GET /location/layout` (ráp Zone+Rack+Aisle+Gate thành 1 response)

**Files:**
- Create: `be/apps/wms/src/location/dto/layout.dto.ts`
- Modify: `be/apps/wms/src/location/location.service.ts`
- Modify: `be/apps/wms/src/location/location.controller.ts`
- Test: `be/apps/wms/src/location/location.service.spec.ts`

**Interfaces:**
- Consumes: `LocationService.listZones/listAllRacks(mới)/listAisles/listGates` — cần thêm 1 method mới `listAllRacks()` (không lọc theo zoneId, khác `listRacks(zoneId)` hiện có) để ráp toàn bộ layout.
- Produces: `LocationService.getLayout(): Promise<{ zones, racks, aisles, gates }>` — trả plain object, KHÔNG có `canvas`/`revision`/`status` (đơn giản hoá so với FE type cũ — không cần DRAFT/PUBLISH, canvas là hằng số phía FE hoặc field riêng — xem Task 6).
- Produces: endpoint `GET /location/layout`, response `LayoutResponseDto`.

- [ ] **Step 1: Thêm method `findAllRacks` (không lọc zone) vào `LocationRepository`**

Thêm vào `be/apps/wms/src/location/location.repository.ts`, ngay sau `findRacksByZone`:

```typescript
  /** Toàn bộ rack chưa xoá, không lọc theo zone — dùng ráp layout tổng thể. */
  async findAllRacks(): Promise<RackDocument[]> {
    return this.rackModel.find(SOFT_DELETE_FILTER).sort({ code: 1 }).exec();
  }
```

- [ ] **Step 2: Viết test cho `LocationService.getLayout`**

Thêm vào `be/apps/wms/src/location/location.service.spec.ts` (đọc file hiện có trước để giữ đúng style mock — dùng cấu trúc tương tự các `describe` khác đã có trong file, mock `repo` bằng `jest.fn()`):

```typescript
  describe('getLayout', () => {
    it('ráp zones, racks, aisles, gates thành 1 object layout', async () => {
      const mockZones = [{ id: 'z1' }];
      const mockRacks = [{ id: 'r1' }];
      const mockAisles = [{ id: 'a1' }];
      const mockGates = [{ id: 'g1' }];
      repo.findAllZones.mockResolvedValue(mockZones);
      repo.findAllRacks.mockResolvedValue(mockRacks);
      repo.findAllAisles.mockResolvedValue(mockAisles);
      repo.findAllGates.mockResolvedValue(mockGates);

      const result = await service.getLayout();

      expect(result).toEqual({
        zones: mockZones,
        racks: mockRacks,
        aisles: mockAisles,
        gates: mockGates,
      });
    });
  });
```

Nếu file test hiện có dùng pattern khác để mock `repo` (ví dụ `Partial<LocationRepository>` object thay vì `jest.fn()` riêng lẻ), điều chỉnh theo đúng pattern đã thấy trong file — đọc `location.service.spec.ts` trước khi viết.

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `cd be && npx jest apps/wms/src/location/location.service.spec.ts`
Expected: FAIL — `service.getLayout is not a function`.

- [ ] **Step 4: Thêm `getLayout` vào `LocationService`**

Thêm vào cuối class trong `be/apps/wms/src/location/location.service.ts`:

```typescript
  // ─── Layout tổng hợp ──────────────────────────────────────────────────────

  /** Ráp toàn bộ zone/rack/aisle/gate thành 1 object cho FE vẽ sơ đồ 2D. Singleton — không phân trang, không lọc theo warehouseId (app = 1 kho). */
  async getLayout(): Promise<{
    zones: ZoneDocument[];
    racks: RackDocument[];
    aisles: AisleDocument[];
    gates: GateDocument[];
  }> {
    const [zones, racks, aisles, gates] = await Promise.all([
      this.repo.findAllZones(),
      this.repo.findAllRacks(),
      this.repo.findAllAisles(),
      this.repo.findAllGates(),
    ]);
    return { zones, racks, aisles, gates };
  }
```

- [ ] **Step 5: Chạy test, xác nhận PASS**

Run: `cd be && npx jest apps/wms/src/location/location.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Tạo `LayoutResponseDto`**

Tạo `be/apps/wms/src/location/dto/layout.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ZoneResponseDto } from './zone.dto';
import { RackResponseDto } from './rack.dto';
import { AisleResponseDto } from './aisle.dto';
import { GateResponseDto } from './gate.dto';

export class LayoutResponseDto {
  @Expose()
  @Type(() => ZoneResponseDto)
  @ApiProperty({ type: [ZoneResponseDto] })
  zones!: ZoneResponseDto[];

  @Expose()
  @Type(() => RackResponseDto)
  @ApiProperty({ type: [RackResponseDto] })
  racks!: RackResponseDto[];

  @Expose()
  @Type(() => AisleResponseDto)
  @ApiProperty({ type: [AisleResponseDto] })
  aisles!: AisleResponseDto[];

  @Expose()
  @Type(() => GateResponseDto)
  @ApiProperty({ type: [GateResponseDto] })
  gates!: GateResponseDto[];
}
```

- [ ] **Step 7: Thêm endpoint `GET /location/layout` vào controller**

Thêm import vào `be/apps/wms/src/location/location.controller.ts`:

```typescript
import { LayoutResponseDto } from './dto/layout.dto';
```

Thêm route — đặt **trước** `zones` static route (đầu file, ngay sau `constructor`) để tránh bất kỳ xung đột thứ tự route nào với `zones/:id` kiểu tương lai:

```typescript
  // ─── Layout tổng hợp (đặt đầu tiên, route cố định không xung đột) ────────

  @Get('layout')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN)
  @ApiOperation({
    summary: 'Sơ đồ kho 2D tổng hợp (zone+rack+aisle+gate) — [MANAGER, ADMIN]',
  })
  @ApiOkResponse({ type: LayoutResponseDto })
  async getLayout(): Promise<LayoutResponseDto> {
    const layout = await this.svc.getLayout();
    return plainToInstance(
      LayoutResponseDto,
      {
        zones: layout.zones.map((z) => z.toObject()),
        racks: layout.racks.map((r) => r.toObject()),
        aisles: layout.aisles.map((a) => a.toObject()),
        gates: layout.gates.map((g) => g.toObject()),
      },
      TO_INSTANCE_OPTS,
    );
  }
```

- [ ] **Step 8: Build và chạy toàn bộ test location**

Run: `cd be && npx tsc -p apps/wms/tsconfig.app.json --noEmit && npx jest apps/wms/src/location`
Expected: build sạch, tất cả test PASS.

- [ ] **Step 9: Commit**

```bash
cd be && git add apps/wms/src/location
git commit -m "feat(wms): thêm endpoint GET /location/layout ráp zone/rack/aisle/gate"
```

---

## Phần B — Backend: Weighted Put-away Suggestion

### Task 6: Nâng cấp `PutAwaySuggestionService` sang weighted scoring (same-SKU + khoảng cách + best-fit)

**Files:**
- Modify: `be/apps/wms/src/put-away-suggestion/put-away-suggestion.service.ts`
- Modify: `be/apps/wms/src/put-away-suggestion/put-away-suggestion.service.spec.ts`
- Modify: `be/apps/wms/src/location/location.repository.ts` (thêm `findShelvesWithRackCoords` hoặc join)

**Interfaces:**
- Consumes: `Rack.xM/yM/widthM/depthM` (Task 2), `LocationRepository.findStagingShelf()` (đã có sẵn — trả `ShelfDocument | null`).
- Produces: `PutAwaySuggestionService.suggest(sku, qty)` — **signature và response shape KHÔNG đổi** (`PutAwaySuggestionResult { suggestions: PutAwaySuggestionItem[], warning }`), chỉ đổi thuật toán ranking bên trong. Không phá API contract hiện có.

**Chi tiết thuật toán mới** (thay thế `rankSingleShelf`):

Hiện tại: lọc shelf đủ chứa → nếu có same-SKU, chọn same-SKU có capacity lớn nhất; nếu không, chọn best-fit (free nhỏ nhất).

Mới: tính `score` cho mọi candidate đủ chứa, chọn `score` cao nhất:

```
same_sku_bonus = hasSameSku ? 1000 : 0   // ưu tiên tuyệt đối, không đổi so với logic cũ
distance_score = 100 - min(100, distanceMeters)  // càng gần staging càng cao, cap tại 100m
best_fit_score = -free  // free càng nhỏ (khít) càng tốt → điểm càng cao (số âm nhỏ hơn = điểm cao hơn khi free lớn... thực ra dùng trực tiếp -free để free nhỏ có score cao hơn, không cần chuẩn hoá phức tạp cho v1)

score = same_sku_bonus + distance_score - free / 1000
```

(Chia `free` cho 1000 để nó chỉ đóng vai trò phân định khi `same_sku_bonus` và `distance_score` đã ngang nhau — tránh việc thể tích cm³ lớn áp đảo hoàn toàn 2 tiêu chí kia do đơn vị chênh lệch quá lớn.)

`distanceMeters` = Euclid giữa tâm rack chứa shelf và staging shelf's rack (nếu staging shelf không thuộc rack nào có toạ độ, hoặc rack thiếu toạ độ (`widthM=0` chưa từng set), `distance_score = 0` — không chặn suggestion, chỉ không cộng điểm khoảng cách).

- [ ] **Step 1: Đọc test hiện có để nắm cấu trúc mock**

Run: `cat be/apps/wms/src/put-away-suggestion/put-away-suggestion.service.spec.ts`

Ghi nhận cách mock `stockRepo`/`locationRepo`/`configService` hiện tại trước khi viết thêm test — giữ đúng pattern.

- [ ] **Step 2: Thêm method lấy toạ độ rack theo shelf vào `LocationRepository`**

Thêm vào `be/apps/wms/src/location/location.repository.ts`, sau `findShelves()`:

```typescript
  /**
   * Map shelfId → toạ độ tâm rack chứa nó (mét) — dùng tính khoảng cách
   * trong weighted put-away suggestion. Rack chưa từng set toạ độ (widthM=0
   * mặc định) vẫn trả về entry với x/y = 0 — caller tự quyết định có coi là
   * "chưa có toạ độ" hay không (v1: coi 0,0 hợp lệ, distance vẫn tính được,
   * chỉ có thể sai lệch nếu rack thật sự đặt tại góc 0,0 — chấp nhận được vì
   * MANAGER sẽ set toạ độ thật qua UI map trước khi dùng suggestion).
   */
  async findRackCentersByShelfId(
    shelfIds: Types.ObjectId[],
  ): Promise<Map<string, { xM: number; yM: number }>> {
    const shelves = await this.shelfModel
      .find({ _id: { $in: shelfIds } })
      .select('_id rackId')
      .lean()
      .exec();
    const rackIds = [...new Set(shelves.map((s) => s.rackId.toString()))].map(
      (id) => new Types.ObjectId(id),
    );
    const racks = await this.rackModel
      .find({ _id: { $in: rackIds } })
      .select('_id xM yM widthM depthM')
      .lean()
      .exec();
    const rackCenterById = new Map(
      racks.map((r) => [
        r._id.toString(),
        { xM: r.xM + r.widthM / 2, yM: r.yM + r.depthM / 2 },
      ]),
    );
    const result = new Map<string, { xM: number; yM: number }>();
    for (const shelf of shelves) {
      const center = rackCenterById.get(shelf.rackId.toString());
      if (center) result.set(shelf._id.toString(), center);
    }
    return result;
  }
```

- [ ] **Step 3: Viết test weighted scoring — ưu tiên gần staging khi cùng điều kiện khác**

Thêm vào `be/apps/wms/src/put-away-suggestion/put-away-suggestion.service.spec.ts` (dùng đúng pattern mock đã đọc ở Step 1 — ví dụ dưới đây giả định `locationRepo` là object có `jest.fn()`, điều chỉnh nếu pattern thực tế khác):

```typescript
  describe('suggest — weighted scoring theo khoảng cách', () => {
    it('ưu tiên shelf gần staging hơn khi capacity và same-SKU ngang nhau', async () => {
      const item = {
        _id: 'item1',
        sku: 'SKU-1',
        depth: 10,
        width: 10,
        height: 10,
      };
      const nearShelf = {
        _id: 'shelf-near',
        code: 'NEAR-01',
        innerDepth: 100,
        innerWidth: 100,
        innerHeight: 100,
        fillFactor: null,
      };
      const farShelf = {
        _id: 'shelf-far',
        code: 'FAR-01',
        innerDepth: 100,
        innerWidth: 100,
        innerHeight: 100,
        fillFactor: null,
      };
      const stagingShelf = { _id: 'shelf-staging', code: 'STG-01' };

      stockRepo.findItemBySku.mockResolvedValue(item);
      locationRepo.findShelves.mockResolvedValue([nearShelf, farShelf]);
      stockRepo.findOccupiedVolume.mockResolvedValue(new Map());
      stockRepo.findShelfIdsWithItem.mockResolvedValue(new Set());
      locationRepo.findStagingShelf.mockResolvedValue(stagingShelf);
      locationRepo.findRackCentersByShelfId.mockResolvedValue(
        new Map([
          ['shelf-near', { xM: 1, yM: 1 }],
          ['shelf-far', { xM: 50, yM: 50 }],
          ['shelf-staging', { xM: 0, yM: 0 }],
        ]),
      );

      const result = await service.suggest('SKU-1', 5);

      expect(result.suggestions[0].shelfCode).toBe('NEAR-01');
    });
  });
```

- [ ] **Step 4: Chạy test, xác nhận FAIL**

Run: `cd be && npx jest apps/wms/src/put-away-suggestion/put-away-suggestion.service.spec.ts`
Expected: FAIL — `locationRepo.findRackCentersByShelfId` chưa tồn tại hoặc `nearShelf` không được chọn (logic best-fit hiện tại có thể chọn ngẫu nhiên giữa 2 shelf giống hệt free space).

- [ ] **Step 5: Cài đặt weighted scoring trong `PutAwaySuggestionService`**

Sửa `be/apps/wms/src/put-away-suggestion/put-away-suggestion.service.ts` — thay `Candidate` interface, `rankSingleShelf`, và luồng `suggest`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '@app/common';
import { StockRepository } from '../stock/stock.repository';
import { LocationRepository } from '../location/location.repository';
import type { ShelfDocument } from '../location/schemas/shelf.schema';

export interface PutAwaySuggestionItem {
  shelfCode: string;
  capacity: number;
}

export type PutAwaySuggestionWarning =
  | 'ITEM_NO_DIMENSIONS'
  | 'NO_SHELF_FITS'
  | 'INSUFFICIENT_CAPACITY'
  | null;

export interface PutAwaySuggestionResult {
  suggestions: PutAwaySuggestionItem[];
  warning: PutAwaySuggestionWarning;
}

interface Candidate {
  shelf: ShelfDocument;
  capacity: number;
  free: number;
  hasSameSku: boolean;
  distanceMeters: number | null;
}

const DEFAULT_FILL_FACTOR = 0.75;
const SAME_SKU_BONUS = 1000;
const DISTANCE_SCORE_CAP_METERS = 100;

@Injectable()
export class PutAwaySuggestionService {
  constructor(
    private readonly stockRepo: StockRepository,
    private readonly locationRepo: LocationRepository,
    private readonly configService: ConfigService,
  ) {}

  async suggest(sku: string, qty: number): Promise<PutAwaySuggestionResult> {
    const item = await this.stockRepo.findItemBySku(sku);
    if (!item) throw new AppException('PUTAWAY_ITEM_NOT_FOUND');

    if (!item.depth || !item.width || !item.height) {
      return { suggestions: [], warning: 'ITEM_NO_DIMENSIONS' };
    }
    const unitVolume = item.depth * item.width * item.height;
    const itemDims = [item.depth, item.width, item.height].sort(
      (a, b) => b - a,
    );

    const shelves = await this.locationRepo.findShelves();
    const fittingShelves = shelves.filter((s) => this.fits(itemDims, s));
    if (fittingShelves.length === 0) {
      return { suggestions: [], warning: 'NO_SHELF_FITS' };
    }

    const [occupiedByShelf, shelfIdsWithSameSku, distanceByShelfId] =
      await Promise.all([
        this.stockRepo.findOccupiedVolume(),
        this.stockRepo.findShelfIdsWithItem(item._id),
        this.computeDistancesToStaging(fittingShelves),
      ]);
    const defaultFillFactor =
      this.configService.get<number>('PUTAWAY_DEFAULT_FILL_FACTOR') ??
      DEFAULT_FILL_FACTOR;

    const candidates: Candidate[] = [];
    for (const shelf of fittingShelves) {
      const usableVolume =
        (shelf.innerDepth ?? 0) *
        (shelf.innerWidth ?? 0) *
        (shelf.innerHeight ?? 0);
      const fillFactor = shelf.fillFactor ?? defaultFillFactor;
      const occupied = occupiedByShelf.get(shelf._id.toString()) ?? 0;
      const free = usableVolume * fillFactor - occupied;
      const capacity = Math.floor(free / unitVolume);
      if (capacity < 1) continue;
      candidates.push({
        shelf,
        capacity,
        free,
        hasSameSku: shelfIdsWithSameSku.has(shelf._id.toString()),
        distanceMeters: distanceByShelfId.get(shelf._id.toString()) ?? null,
      });
    }

    if (candidates.length === 0) {
      return { suggestions: [], warning: 'NO_SHELF_FITS' };
    }

    const single = this.rankSingleShelf(candidates, qty);
    if (single) {
      return { suggestions: [single], warning: null };
    }

    return this.combineShelves(candidates, qty);
  }

  /** Khoảng cách Euclid (mét) từ tâm rack của mỗi shelf tới tâm rack chứa staging shelf. null nếu không có staging shelf hoặc thiếu toạ độ. */
  private async computeDistancesToStaging(
    shelves: ShelfDocument[],
  ): Promise<Map<string, number>> {
    const staging = await this.locationRepo.findStagingShelf();
    if (!staging) return new Map();

    const allShelfIds = [...shelves.map((s) => s._id), staging._id];
    const centers =
      await this.locationRepo.findRackCentersByShelfId(allShelfIds);
    const stagingCenter = centers.get(staging._id.toString());
    if (!stagingCenter) return new Map();

    const result = new Map<string, number>();
    for (const shelf of shelves) {
      const center = centers.get(shelf._id.toString());
      if (!center) continue;
      const dx = center.xM - stagingCenter.xM;
      const dy = center.yM - stagingCenter.yM;
      result.set(shelf._id.toString(), Math.sqrt(dx * dx + dy * dy));
    }
    return result;
  }

  private score(candidate: Candidate): number {
    const sameSkuBonus = candidate.hasSameSku ? SAME_SKU_BONUS : 0;
    const distanceScore =
      candidate.distanceMeters === null
        ? 0
        : Math.max(
            0,
            DISTANCE_SCORE_CAP_METERS -
              Math.min(DISTANCE_SCORE_CAP_METERS, candidate.distanceMeters),
          );
    // free chia 1000 để chỉ phân định khi 2 tiêu chí trên ngang nhau —
    // đơn vị cm³ lớn hơn nhiều bậc so với điểm same-SKU/khoảng cách.
    return sameSkuBonus + distanceScore - candidate.free / 1000;
  }

  private fits(itemDimsDesc: number[], shelf: ShelfDocument): boolean {
    const shelfDims = [
      shelf.innerDepth ?? 0,
      shelf.innerWidth ?? 0,
      shelf.innerHeight ?? 0,
    ].sort((a, b) => b - a);
    return itemDimsDesc.every((d, i) => d <= shelfDims[i]);
  }

  private rankSingleShelf(
    candidates: Candidate[],
    qty: number,
  ): PutAwaySuggestionItem | null {
    const sufficient = candidates.filter((c) => c.capacity >= qty);
    if (sufficient.length === 0) return null;

    const best = [...sufficient].sort(
      (a, b) => this.score(b) - this.score(a),
    )[0];
    return { shelfCode: best.shelf.code, capacity: best.capacity };
  }

  private combineShelves(
    candidates: Candidate[],
    qty: number,
  ): PutAwaySuggestionResult {
    const sorted = [...candidates].sort(
      (a, b) => this.score(b) - this.score(a),
    );
    const chosen: PutAwaySuggestionItem[] = [];
    let covered = 0;
    for (const c of sorted) {
      if (covered >= qty) break;
      chosen.push({ shelfCode: c.shelf.code, capacity: c.capacity });
      covered += c.capacity;
    }
    const warning: PutAwaySuggestionWarning =
      covered >= qty ? null : 'INSUFFICIENT_CAPACITY';
    return { suggestions: chosen, warning };
  }
}
```

- [ ] **Step 6: Chạy test mới, xác nhận PASS**

Run: `cd be && npx jest apps/wms/src/put-away-suggestion/put-away-suggestion.service.spec.ts`
Expected: PASS — bao gồm cả test cũ (same-SKU vẫn ưu tiên tuyệt đối vì `SAME_SKU_BONUS = 1000` >> `DISTANCE_SCORE_CAP_METERS = 100`) lẫn test mới.

- [ ] **Step 7: Build toàn bộ WMS app**

Run: `cd be && npx tsc -p apps/wms/tsconfig.app.json --noEmit`
Expected: build sạch.

- [ ] **Step 8: Commit**

```bash
cd be && git add apps/wms/src/put-away-suggestion apps/wms/src/location/location.repository.ts
git commit -m "feat(wms): nâng cấp put-away suggestion sang weighted scoring (same-SKU + khoảng cách + best-fit)"
```

---

## Phần C — Backend: API tồn kho theo shelf (cho rack elevation)

### Task 7: Endpoint `GET /location/shelves/:id/contents` — liệt kê tồn kho thật trong 1 shelf

**Files:**
- Create: `be/apps/wms/src/location/dto/shelf-content.dto.ts`
- Modify: `be/apps/wms/src/location/location.service.ts`
- Modify: `be/apps/wms/src/location/location.controller.ts`
- Modify: `be/apps/wms/src/stock/stock.repository.ts`
- Test: `be/apps/wms/src/stock/stock.repository.spec.ts`, `be/apps/wms/src/location/location.service.spec.ts`

**Interfaces:**
- Consumes: `InventoryStock { itemId, shelfId, lotId, quantity }`, `WarehouseItem { sku, name, unit }`, `Lot { lotNumber, expiryDate }` (tất cả đã tồn tại, không sửa schema).
- Produces: `StockRepository.findInventoryByShelfId(shelfId): Promise<ShelfContentRow[]>` — join `InventoryStock` → `WarehouseItem` + `Lot` (aggregate `$lookup`, tương tự pattern `findOccupiedVolume` đã có).
- Produces: `LocationService.getShelfContents(shelfId): Promise<ShelfContentRow[]>` — validate shelf tồn tại trước (dùng `getShelf` đã có), throw `SHELF_NOT_FOUND` nếu không.
- Produces: endpoint `GET /location/shelves/:id/contents`, response `ShelfContentResponseDto[]`.

- [ ] **Step 1: Viết test cho `StockRepository.findInventoryByShelfId`**

Đọc `be/apps/wms/src/stock/stock.repository.spec.ts` trước để nắm pattern test aggregate hiện có (ví dụ test cho `findOccupiedVolume`), sau đó thêm:

```typescript
  describe('findInventoryByShelfId', () => {
    it('trả về danh sách item + lot tại 1 shelf, quantity > 0', async () => {
      // Arrange: seed InventoryStock với itemId trỏ WarehouseItem thật,
      // 1 dòng lotId=null (non-perishable), 1 dòng có lotId (perishable).
      // Dùng đúng pattern setup Mongo in-memory / mock đã thấy trong file.
      // ...
      const rows = await repository.findInventoryByShelfId(shelfId);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0]).toMatchObject({
        sku: expect.any(String),
        itemName: expect.any(String),
        quantity: expect.any(Number),
      });
    });
  });
```

Nếu file hiện tại dùng mongodb-memory-server hoặc mock model trực tiếp (`jest.fn()` trên `Model`), viết theo đúng cách đó — không đoán, đọc file trước khi hoàn thiện test.

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd be && npx jest apps/wms/src/stock/stock.repository.spec.ts -t findInventoryByShelfId`
Expected: FAIL — method chưa tồn tại.

- [ ] **Step 3: Thêm `findInventoryByShelfId` vào `StockRepository`**

Thêm vào `be/apps/wms/src/stock/stock.repository.ts`, gần `findOccupiedVolume`:

```typescript
  /**
   * Tồn kho thật tại 1 shelf — join InventoryStock → WarehouseItem (tên/unit)
   * → Lot (số lô/hạn dùng, optional). Dùng cho rack elevation view (FE) hiển
   * thị đúng SKU/số lượng/lô đang nằm trong từng shelf, KHÔNG suy diễn.
   */
  async findInventoryByShelfId(shelfId: Types.ObjectId): Promise<
    Array<{
      id: string;
      sku: string;
      itemName: string;
      unit: string;
      quantity: number;
      lotNumber: string | null;
      expiryDate: Date | null;
    }>
  > {
    const rows = await this.inventoryModel.aggregate<{
      _id: Types.ObjectId;
      sku: string;
      itemName: string;
      unit: string;
      quantity: number;
      lotNumber: string | null;
      expiryDate: Date | null;
    }>([
      { $match: { shelfId, quantity: { $gt: 0 } } },
      {
        $lookup: {
          from: 'warehouse_items',
          localField: 'itemId',
          foreignField: '_id',
          as: 'item',
        },
      },
      { $unwind: '$item' },
      {
        $lookup: {
          from: 'lots',
          localField: 'lotId',
          foreignField: '_id',
          as: 'lot',
        },
      },
      { $unwind: { path: '$lot', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          sku: '$item.sku',
          itemName: '$item.name',
          unit: '$item.unit',
          quantity: 1,
          lotNumber: { $ifNull: ['$lot.lotNumber', null] },
          expiryDate: { $ifNull: ['$lot.expiryDate', null] },
        },
      },
    ]);

    return rows.map((r) => ({
      id: r._id.toString(),
      sku: r.sku,
      itemName: r.itemName,
      unit: r.unit,
      quantity: r.quantity,
      lotNumber: r.lotNumber,
      expiryDate: r.expiryDate,
    }));
  }
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd be && npx jest apps/wms/src/stock/stock.repository.spec.ts -t findInventoryByShelfId`
Expected: PASS

- [ ] **Step 5: Tạo `ShelfContentResponseDto`**

Tạo `be/apps/wms/src/location/dto/shelf-content.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class ShelfContentResponseDto {
  @Expose()
  @ApiProperty()
  id!: string;

  @Expose()
  @ApiProperty()
  sku!: string;

  @Expose()
  @ApiProperty()
  itemName!: string;

  @Expose()
  @ApiProperty()
  unit!: string;

  @Expose()
  @ApiProperty()
  quantity!: number;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  lotNumber!: string | null;

  @Expose()
  @ApiPropertyOptional({ nullable: true })
  expiryDate!: Date | null;
}
```

- [ ] **Step 6: Thêm `getShelfContents` vào `LocationService`**

`LocationService` hiện chỉ inject `LocationRepository` — cần thêm `StockRepository`. Sửa constructor và thêm method vào `be/apps/wms/src/location/location.service.ts`:

```typescript
import { StockRepository } from '../stock/stock.repository';
```

```typescript
  constructor(
    private readonly repo: LocationRepository,
    private readonly stockRepo: StockRepository,
  ) {}
```

Thêm method vào cuối class:

```typescript
  // ─── Shelf contents (rack elevation) ─────────────────────────────────────

  async getShelfContents(shelfId: string) {
    await this.getShelf(shelfId); // throw SHELF_NOT_FOUND nếu không tồn tại
    return this.stockRepo.findInventoryByShelfId(new Types.ObjectId(shelfId));
  }
```

Thêm import `Types` từ `mongoose` ở đầu file nếu chưa có.

- [ ] **Step 7: Đăng ký `StockModule` là dependency của `LocationModule`**

Sửa `be/apps/wms/src/location/location.module.ts` — thêm import `StockModule`:

```typescript
import { StockModule } from '../stock/stock.module';
```

```typescript
@Module({
  imports: [
    MongooseModule.forFeature([...]),
    StockModule,
  ],
  ...
})
```

Kiểm tra `StockModule` đã `exports: [StockRepository]` — nếu chưa, đọc `be/apps/wms/src/stock/stock.module.ts` và thêm export (không sửa nếu đã export sẵn — kiểm tra trước khi sửa).

**Lưu ý về vòng phụ thuộc module**: `PutAwaySuggestionModule` đã import cả `StockModule` lẫn `LocationModule` — không tạo vòng lặp vì `LocationModule` → `StockModule` là chiều mới, `StockModule` không import ngược lại `LocationModule`. Xác nhận bằng cách đọc `be/apps/wms/src/stock/stock.module.ts` trước khi thêm.

- [ ] **Step 8: Thêm endpoint vào `LocationController`**

Thêm import:

```typescript
import { ShelfContentResponseDto } from './dto/shelf-content.dto';
```

Thêm route trong block Shelf param routes (sau `getShelf`, trước `updateShelf`):

```typescript
  @Get('shelves/:id/contents')
  @Roles(WmsRole.MANAGER, WmsRole.ADMIN, WmsRole.RECEIVER, WmsRole.PICKER)
  @ApiOperation({
    summary:
      'Tồn kho thật tại 1 shelf (cho rack elevation view) — [MANAGER, ADMIN, RECEIVER, PICKER]',
  })
  @ApiOkResponse({ type: [ShelfContentResponseDto] })
  async getShelfContents(
    @Param('id') id: string,
  ): Promise<ShelfContentResponseDto[]> {
    const rows = await this.svc.getShelfContents(id);
    return plainToInstance(ShelfContentResponseDto, rows, TO_INSTANCE_OPTS);
  }
```

- [ ] **Step 9: Cập nhật test `location.service.spec.ts` cho constructor mới**

`LocationService` constructor giờ nhận thêm `stockRepo` — mọi test hiện có khởi tạo `new LocationService(repo)` sẽ FAIL biên dịch. Sửa toàn bộ chỗ khởi tạo trong `be/apps/wms/src/location/location.service.spec.ts` thành `new LocationService(repo, stockRepo)` với `stockRepo` là mock tối thiểu (`{ findInventoryByShelfId: jest.fn() } as unknown as StockRepository`, điều chỉnh theo pattern mock thật của file).

- [ ] **Step 10: Chạy toàn bộ test location + build**

Run: `cd be && npx tsc -p apps/wms/tsconfig.app.json --noEmit && npx jest apps/wms/src/location apps/wms/src/stock apps/wms/src/put-away-suggestion`
Expected: build sạch, tất cả PASS (bao gồm `put-away-suggestion` vì nó cũng import `LocationModule`).

- [ ] **Step 11: Commit**

```bash
cd be && git add apps/wms/src/location apps/wms/src/stock
git commit -m "feat(wms): thêm endpoint GET /location/shelves/:id/contents cho rack elevation"
```

---

## Phần D — Frontend: Service gọi API thật

### Task 8: Tạo `warehouse-layout.service.ts` — nối API layout thật

**Files:**
- Create: `fe-pbvm-warehouse/src/features/warehouse-layout/services/warehouse-layout.service.ts`
- Create: `fe-pbvm-warehouse/tests/unit/warehouse-layout-service.test.ts`

**Interfaces:**
- Consumes: `GET /location/layout` (Task 5), `PATCH /location/zones/:id`, `PATCH /location/racks/:id`, `PATCH /location/aisles/:id`, `PATCH /location/gates/:id` (đã có sẵn Zone/Rack, mới ở Aisle/Gate Task 3/4), `apiClient`/`unwrapApiData`/`ApiEnvelope` từ `@/lib/api-contract` (pattern giống `warehouse-structure.service.ts`).
- Produces: `fetchWarehouseLayout(): Promise<WarehouseLayout>` — map response BE (`LayoutResponseDto`: `zones/racks/aisles/gates` phẳng, không `canvas`) sang type FE `WarehouseLayout` (cần `canvas`, `id`, `revision`, `status`). Canvas không có ở BE — dùng hằng số cố định phía FE (kho không đổi kích thước khung thường xuyên) hoặc tính từ bounding box của mọi zone. **Quyết định: tính từ bounding box** — đơn giản, tự động scale theo dữ liệu thật, không cần thêm API/schema riêng cho canvas.
- Produces: `patchZone(zoneId, patch)`, `patchRack(rackId, patch)`, `patchAisle(aisleId, patch)`, `patchGate(gateId, patch)` — mỗi hàm gọi đúng 1 PATCH endpoint tương ứng.

- [ ] **Step 1: Viết test cho `fetchWarehouseLayout` map đúng shape + tính canvas từ bounding box**

Tạo `fe-pbvm-warehouse/tests/unit/warehouse-layout-service.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn(), patch: vi.fn() },
}));

import { apiClient } from "@/lib/api-client";
import { fetchWarehouseLayout } from "@/features/warehouse-layout/services/warehouse-layout.service";

describe("fetchWarehouseLayout", () => {
  it("map response BE sang WarehouseLayout, tính canvas từ bounding box các zone", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        zones: [
          { id: "z1", code: "A", name: "Zone A", xM: 1, yM: 1, widthM: 16, heightM: 22, rotation: 0 },
        ],
        racks: [],
        aisles: [],
        gates: [],
      },
    });

    const layout = await fetchWarehouseLayout();

    expect(layout.zones).toHaveLength(1);
    expect(layout.canvas.widthM).toBeGreaterThanOrEqual(17); // 1 + 16
    expect(layout.canvas.heightM).toBeGreaterThanOrEqual(23); // 1 + 22
    expect(layout.status).toBe("PUBLISHED");
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd fe-pbvm-warehouse && npx vitest run tests/unit/warehouse-layout-service.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Tạo service**

Tạo `fe-pbvm-warehouse/src/features/warehouse-layout/services/warehouse-layout.service.ts`:

```typescript
import { apiClient } from "@/lib/api-client";
import { type ApiEnvelope, unwrapApiData } from "@/lib/api-contract";
import type {
  WarehouseLayout,
  WarehouseLayoutAisle,
  WarehouseLayoutGate,
  WarehouseLayoutRack,
  WarehouseLayoutZone,
} from "@/types/api";

const CANVAS_PADDING_M = 2;
const CANVAS_GRID_M = 0.5;

type LayoutApiResponse = {
  zones: WarehouseLayoutZone[];
  racks: Array<
    Omit<WarehouseLayoutRack, "shelfCodes" | "accessPoint"> & {
      accessPointXM: number;
      accessPointYM: number;
    }
  >;
  aisles: WarehouseLayoutAisle[];
  gates: WarehouseLayoutGate[];
};

function buildCanvas(zones: WarehouseLayoutZone[]) {
  if (zones.length === 0) {
    return { widthM: 40, heightM: 24, gridM: CANVAS_GRID_M };
  }

  const maxX = Math.max(...zones.map((zone) => zone.xM + zone.widthM));
  const maxY = Math.max(...zones.map((zone) => zone.yM + zone.heightM));

  return {
    widthM: maxX + CANVAS_PADDING_M,
    heightM: maxY + CANVAS_PADDING_M,
    gridM: CANVAS_GRID_M,
  };
}

function toLayoutRack(rack: LayoutApiResponse["racks"][number]): WarehouseLayoutRack {
  return {
    id: rack.id,
    zoneId: rack.zoneId,
    code: rack.code,
    name: rack.name,
    xM: rack.xM,
    yM: rack.yM,
    widthM: rack.widthM,
    depthM: rack.depthM,
    rotation: rack.rotation,
    levelCount: rack.levelCount,
    bayCount: rack.bayCount,
    shelfCodes: [],
    accessPoint: { xM: rack.accessPointXM, yM: rack.accessPointYM },
  };
}

export async function fetchWarehouseLayout(): Promise<WarehouseLayout> {
  const response = await apiClient.get<
    ApiEnvelope<LayoutApiResponse> | LayoutApiResponse
  >("/location/layout");
  const data = unwrapApiData(response.data);

  return {
    id: "single-warehouse-layout",
    revision: 1,
    status: "PUBLISHED",
    canvas: buildCanvas(data.zones),
    zones: data.zones,
    racks: data.racks.map(toLayoutRack),
    aisles: data.aisles,
    gates: data.gates,
  };
}

export async function patchZone(
  zoneId: string,
  patch: Record<string, unknown>,
) {
  const response = await apiClient.patch<
    ApiEnvelope<WarehouseLayoutZone> | WarehouseLayoutZone
  >(`/location/zones/${encodeURIComponent(zoneId)}`, patch);
  return unwrapApiData(response.data);
}

export async function patchRack(
  rackId: string,
  patch: Record<string, unknown>,
) {
  const response = await apiClient.patch<
    ApiEnvelope<LayoutApiResponse["racks"][number]> | LayoutApiResponse["racks"][number]
  >(`/location/racks/${encodeURIComponent(rackId)}`, patch);
  return unwrapApiData(response.data);
}

export async function patchAisle(
  aisleId: string,
  patch: Record<string, unknown>,
) {
  const response = await apiClient.patch<
    ApiEnvelope<WarehouseLayoutAisle> | WarehouseLayoutAisle
  >(`/location/aisles/${encodeURIComponent(aisleId)}`, patch);
  return unwrapApiData(response.data);
}

export async function patchGate(
  gateId: string,
  patch: Record<string, unknown>,
) {
  const response = await apiClient.patch<
    ApiEnvelope<WarehouseLayoutGate> | WarehouseLayoutGate
  >(`/location/gates/${encodeURIComponent(gateId)}`, patch);
  return unwrapApiData(response.data);
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd fe-pbvm-warehouse && npx vitest run tests/unit/warehouse-layout-service.test.ts`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `cd fe-pbvm-warehouse && npx tsc --noEmit`
Expected: không lỗi liên quan file mới. (Lưu ý: `WarehouseLayoutRack.shelfCodes` giờ luôn `[]` từ BE thật — component nào dựa vào `shelfCodes` để tự sinh shelf ảo (`layoutToWarehouseShelves` trong `putaway-navigation.ts`) sẽ cần sửa ở Task 9 để dùng shelf thật thay vì suy diễn.)

- [ ] **Step 6: Commit**

```bash
cd fe-pbvm-warehouse && git add src/features/warehouse-layout/services/warehouse-layout.service.ts tests/unit/warehouse-layout-service.test.ts
git commit -m "feat: thêm warehouse-layout.service gọi API layout thật thay vì fallback mock"
```

---

### Task 9: Tạo `warehouse-shelves.service.ts` — lấy danh sách shelf thật theo rack + nội dung shelf

**Files:**
- Create: `fe-pbvm-warehouse/src/features/warehouse-layout/services/warehouse-shelves.service.ts`
- Create: `fe-pbvm-warehouse/tests/unit/warehouse-shelves-service.test.ts`

**Interfaces:**
- Consumes: `GET /location/shelves?rackId=` (đã có sẵn — dùng bởi `warehouse-structure.service.ts.listShelves`), `GET /location/shelves/:id/contents` (Task 7).
- Produces: `fetchShelvesForRacks(rackIds: string[]): Promise<Map<string, WarehouseStructureShelf[]>>` — gọi song song `listShelves` cho từng rack, trả map `rackId → shelves`. Đây là nguồn thật thay thế `rack.shelfCodes` suy diễn.
- Produces: `fetchShelfContents(shelfId: string): Promise<ShelfContentItem[]>` — map response BE (`sku/itemName/unit/quantity/lotNumber/expiryDate`) sang `ShelfContentItem` FE type (không có `placement`/`dimensions`/`containerType`/`status` — để `undefined`, UI đã tự fallback sang "vị trí tương đối" khi `!item.placement`, xem `normalizeShelfBoxPlacement` đã đọc ở bước khảo sát).

- [ ] **Step 1: Viết test cho `fetchShelfContents` map đúng field**

Tạo `fe-pbvm-warehouse/tests/unit/warehouse-shelves-service.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn() },
}));

import { apiClient } from "@/lib/api-client";
import {
  fetchShelfContents,
  fetchShelvesForRacks,
} from "@/features/warehouse-layout/services/warehouse-shelves.service";

describe("fetchShelfContents", () => {
  it("map response BE sang ShelfContentItem", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: [
        {
          id: "inv1",
          sku: "SKU-1",
          itemName: "Cốc 500ml",
          unit: "cái",
          quantity: 24,
          lotNumber: "LOT-01",
          expiryDate: "2026-12-31",
        },
      ],
    });

    const items = await fetchShelfContents("shelf1");

    expect(items).toEqual([
      {
        id: "inv1",
        sku: "SKU-1",
        itemName: "Cốc 500ml",
        unit: "cái",
        quantity: 24,
        lotNumber: "LOT-01",
        expiryDate: "2026-12-31",
      },
    ]);
  });
});

describe("fetchShelvesForRacks", () => {
  it("gọi listShelves song song cho từng rackId, trả map", async () => {
    vi.mocked(apiClient.get).mockImplementation((url: string, config) => {
      const rackId = (config as { params?: { rackId?: string } })?.params
        ?.rackId;
      return Promise.resolve({
        data: [{ id: `shelf-${rackId}`, rackId, level: 1, code: `${rackId}-S01`, isStaging: false, createdAt: "", updatedAt: "" }],
      });
    });

    const map = await fetchShelvesForRacks(["rack1", "rack2"]);

    expect(map.get("rack1")).toHaveLength(1);
    expect(map.get("rack2")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd fe-pbvm-warehouse && npx vitest run tests/unit/warehouse-shelves-service.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Tạo service**

Tạo `fe-pbvm-warehouse/src/features/warehouse-layout/services/warehouse-shelves.service.ts`:

```typescript
import { apiClient } from "@/lib/api-client";
import { type ApiEnvelope, unwrapApiData } from "@/lib/api-contract";
import {
  listShelves,
  type WarehouseStructureShelf,
} from "@/features/warehouse-structure/services/warehouse-structure.service";
import type { ShelfContentItem } from "@/types/api";

type ShelfContentApiRow = {
  id: string;
  sku: string;
  itemName: string;
  unit: string;
  quantity: number;
  lotNumber: string | null;
  expiryDate: string | null;
};

export async function fetchShelvesForRacks(
  rackIds: string[],
): Promise<Map<string, WarehouseStructureShelf[]>> {
  const entries = await Promise.all(
    rackIds.map(
      async (rackId) => [rackId, await listShelves(rackId)] as const,
    ),
  );
  return new Map(entries);
}

export async function fetchShelfContents(
  shelfId: string,
): Promise<ShelfContentItem[]> {
  const response = await apiClient.get<
    ApiEnvelope<ShelfContentApiRow[]> | ShelfContentApiRow[]
  >(`/location/shelves/${encodeURIComponent(shelfId)}/contents`);
  const rows = unwrapApiData(response.data);

  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    itemName: row.itemName,
    unit: row.unit,
    quantity: row.quantity,
    lotNumber: row.lotNumber,
    expiryDate: row.expiryDate,
  }));
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd fe-pbvm-warehouse && npx vitest run tests/unit/warehouse-shelves-service.test.ts`
Expected: PASS

- [ ] **Step 5: Type-check**

Run: `cd fe-pbvm-warehouse && npx tsc --noEmit`
Expected: không lỗi mới.

- [ ] **Step 6: Commit**

```bash
cd fe-pbvm-warehouse && git add src/features/warehouse-layout/services/warehouse-shelves.service.ts tests/unit/warehouse-shelves-service.test.ts
git commit -m "feat: thêm warehouse-shelves.service — shelf thật theo rack + nội dung tồn kho"
```

---

## Phần E — Frontend: Trang Map + wiring component có sẵn

### Task 10: Sửa `layoutToWarehouseShelves` dùng shelf thật thay vì suy diễn từ `shelfCodes`

**Files:**
- Modify: `fe-pbvm-warehouse/src/features/warehouse-navigation/utils/putaway-navigation.ts`
- Modify: `fe-pbvm-warehouse/tests/unit/warehouse-navigation.test.ts`

**Interfaces:**
- Consumes: `WarehouseStructureShelf` (từ `warehouse-structure.service.ts`, Task 9's `fetchShelvesForRacks`).
- Produces: `layoutToWarehouseShelves(layout, shelvesByRackId: Map<string, WarehouseStructureShelf[]>): WarehouseShelf[]` — **signature đổi**, thêm tham số bắt buộc thứ 2. Đây là breaking change nội bộ — cần sửa mọi call site.

**Lý do bắt buộc:** hàm cũ tự sinh `shelfCodes` giả từ `buildShelfCodes` khi tạo rack (`levelCount` lần lặp `${code}-S01`, `S02`...) — với BE thật, `rack.shelfCodes` giờ luôn rỗng (Task 8 đã set cứng `[]` vì BE không lưu mảng này, shelf là entity riêng). Nếu không sửa, floor plan sẽ hiển thị 0 shelf cho mọi rack.

- [ ] **Step 1: Đọc test hiện có cho `layoutToWarehouseShelves`**

Run: `grep -n "layoutToWarehouseShelves" fe-pbvm-warehouse/tests/unit/warehouse-navigation.test.ts`

Đọc đoạn test để biết input/output mẫu hiện tại trước khi sửa.

- [ ] **Step 2: Sửa test để truyền `shelvesByRackId` thật**

Sửa lời gọi `layoutToWarehouseShelves(layout)` trong test thành `layoutToWarehouseShelves(layout, shelvesByRackId)` với `shelvesByRackId` là `Map` chứa dữ liệu shelf mẫu tương ứng — dùng field thật (`rackId, level, code, innerDepth, innerWidth, innerHeight, fillFactor, isStaging`) thay vì để hàm tự suy ra.

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `cd fe-pbvm-warehouse && npx vitest run tests/unit/warehouse-navigation.test.ts`
Expected: FAIL — signature không khớp.

- [ ] **Step 4: Sửa `layoutToWarehouseShelves`**

Sửa `fe-pbvm-warehouse/src/features/warehouse-navigation/utils/putaway-navigation.ts`:

```typescript
import type { WarehouseStructureShelf } from "@/features/warehouse-structure/services/warehouse-structure.service";

export function layoutToWarehouseShelves(
  layout: WarehouseLayout,
  shelvesByRackId: Map<string, WarehouseStructureShelf[]>,
): WarehouseShelf[] {
  const zonesById = new Map(layout.zones.map((zone) => [zone.id, zone]));

  return layout.racks.flatMap((rack): WarehouseShelf[] => {
    const zone = zonesById.get(rack.zoneId);
    const zoneCode = zone?.code ?? rack.zoneId;
    const zoneName = zone?.name ?? zoneCode;
    const levelCount = Math.max(1, rack.levelCount);
    const shelves = shelvesByRackId.get(rack.id) ?? [];

    return shelves.map((shelf): WarehouseShelf => {
      const visualTop =
        rack.yM + (levelCount - shelf.level) * (rack.depthM + 0.2);

      return {
        id: shelf.id,
        barcode: shelf.code,
        code: shelf.code,
        fillFactor: shelf.fillFactor ?? undefined,
        height: rack.depthM,
        innerDepth: shelf.innerDepth,
        innerHeight: shelf.innerHeight,
        innerWidth: shelf.innerWidth,
        isStaging: shelf.isStaging,
        level: shelf.level,
        rackCode: rack.code,
        rackName: rack.name,
        width: rack.widthM,
        x: rack.xM,
        y: visualTop,
        zoneCode,
        zoneName,
      };
    });
  });
}
```

Xoá hàm `parseShelfLevel` nếu không còn nơi nào khác dùng (kiểm tra bằng `grep -rn "parseShelfLevel" fe-pbvm-warehouse/src` trước khi xoá).

- [ ] **Step 5: Sửa các call site khác của `layoutToWarehouseShelves`**

Run: `grep -rln "layoutToWarehouseShelves" fe-pbvm-warehouse/src`

Với mỗi file tìm được (ví dụ `buildLayoutShelfSuggestions` trong cùng file `putaway-navigation.ts`), cập nhật để nhận và truyền tiếp `shelvesByRackId`:

```typescript
export function buildLayoutShelfSuggestions({
  layout,
  reason,
  shelvesByRackId,
  suggestions,
}: {
  layout: WarehouseLayout;
  reason: string;
  shelvesByRackId: Map<string, WarehouseStructureShelf[]>;
  suggestions: Array<{ capacity: number; shelfCode: string }>;
}): PutawaySuggestion[] {
  const shelvesByCode = new Map(
    layoutToWarehouseShelves(layout, shelvesByRackId).map((shelf) => [
      shelf.code,
      shelf,
    ]),
  );
  // ... phần còn lại giữ nguyên
}
```

Và `buildLayoutPutawaySuggestions` (wrapper gọi `buildLayoutShelfSuggestions`) cũng cần nhận thêm `shelvesByRackId` và truyền tiếp.

- [ ] **Step 6: Chạy test, xác nhận PASS**

Run: `cd fe-pbvm-warehouse && npx vitest run tests/unit/warehouse-navigation.test.ts`
Expected: PASS

- [ ] **Step 7: Type-check toàn bộ**

Run: `cd fe-pbvm-warehouse && npx tsc --noEmit`
Expected: sạch — nếu còn lỗi ở component khác gọi `layoutToWarehouseShelves`/`buildLayoutPutawaySuggestions` với signature cũ, sửa tiếp ở Task 12 (nơi các component này được wire vào page thật).

- [ ] **Step 8: Commit**

```bash
cd fe-pbvm-warehouse && git add src/features/warehouse-navigation/utils/putaway-navigation.ts tests/unit/warehouse-navigation.test.ts
git commit -m "refactor: layoutToWarehouseShelves dùng shelf thật từ BE thay vì suy diễn shelfCodes"
```

---

### Task 11: Nối `onPatch`/`onApply` trong `WarehouseLayoutInspector`/`RackConfigurationDialog` gọi API thật

**Files:**
- Modify: `fe-pbvm-warehouse/tests/unit/warehouse-navigation-components.test.tsx` (hoặc file test tương ứng inspector nếu tách riêng — kiểm tra trước)

**Interfaces:**
- Consumes: `patchZone/patchRack/patchAisle/patchGate` (Task 8).
- Không sửa `WarehouseLayoutInspector.tsx`/`RackConfigurationDialog.tsx` component nội bộ — chúng **đã đúng thiết kế "dumb component"**: nhận `onPatch`/`onApply`/`onDelete`/`onRotate` như callback prop, không tự gọi API. Việc "nối API thật" thuộc về **component cha** (trang Map, Task 12) — nơi implement các callback này để gọi service tương ứng theo `selection.kind`.

**Quyết định thiết kế:** giữ nguyên 2 file component vì chúng đã tách đúng trách nhiệm (UI thuần, logic gọi API ở page cha). Task này chỉ xác nhận qua test rằng props đã đúng type — không có code thay đổi trong chính 2 component. Gộp việc "nối callback thật" vào Task 12 vì đó là nơi callback được implement.

- [ ] **Step 1: Xác nhận không cần sửa gì ở 2 file component**

Run: `grep -n "onPatch\|onApply\|onDelete\|onRotate" fe-pbvm-warehouse/src/features/warehouse-layout/components/warehouse-layout-inspector.tsx fe-pbvm-warehouse/src/features/warehouse-layout/components/rack-configuration-dialog.tsx`

Xác nhận cả 2 file chỉ gọi callback ra ngoài, không có `apiClient`/`fetch` nội bộ. Nếu đúng như khảo sát ban đầu, không cần sửa gì — chuyển sang Task 12.

- [ ] **Step 2: Không commit gì ở task này** — đây là bước xác nhận, việc implement thực tế nằm ở Task 12.

---

### Task 12: Tạo trang `/locations/map` — wiring toàn bộ floor plan + inspector + rack elevation

**Files:**
- Create: `fe-pbvm-warehouse/src/app/(dashboard)/locations/map/page.tsx`
- Create: `fe-pbvm-warehouse/src/features/warehouse-layout/components/warehouse-map-client.tsx`
- Create: `fe-pbvm-warehouse/tests/unit/warehouse-map-client.test.tsx`
- Modify: `fe-pbvm-warehouse/src/app/(dashboard)/locations/page.tsx` (thêm link sang `/locations/map`)

**Interfaces:**
- Consumes: `fetchWarehouseLayout` (Task 8), `patchZone/patchRack/patchAisle/patchGate` (Task 8), `fetchShelvesForRacks/fetchShelfContents` (Task 9), `layoutToWarehouseShelves` (Task 10, signature mới), `WarehouseFloorPlan`, `WarehouseLayoutInspector`, `RackConfigurationDialog`, `WarehouseArchitectureScene` (component có sẵn, không sửa).
- Produces: page `/locations/map` — MANAGER/ADMIN xem + chỉnh sơ đồ kho, bấm vào rack để xem rack elevation với tồn kho thật.

- [ ] **Step 1: Viết test cho `WarehouseMapClient` — render floor plan khi có layout**

Tạo `fe-pbvm-warehouse/tests/unit/warehouse-map-client.test.tsx`:

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/features/warehouse-layout/services/warehouse-layout.service", () => ({
  fetchWarehouseLayout: vi.fn().mockResolvedValue({
    id: "single-warehouse-layout",
    revision: 1,
    status: "PUBLISHED",
    canvas: { widthM: 20, heightM: 20, gridM: 0.5 },
    zones: [
      { id: "z1", code: "A", name: "Zone A", xM: 1, yM: 1, widthM: 10, heightM: 10, rotation: 0 },
    ],
    racks: [],
    aisles: [],
    gates: [],
  }),
  patchZone: vi.fn(),
  patchRack: vi.fn(),
  patchAisle: vi.fn(),
  patchGate: vi.fn(),
}));

vi.mock("@/features/warehouse-layout/services/warehouse-shelves.service", () => ({
  fetchShelvesForRacks: vi.fn().mockResolvedValue(new Map()),
  fetchShelfContents: vi.fn().mockResolvedValue([]),
}));

import { WarehouseMapClient } from "@/features/warehouse-layout/components/warehouse-map-client";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("WarehouseMapClient", () => {
  it("hiển thị sơ đồ kho sau khi tải layout thành công", async () => {
    renderWithClient(<WarehouseMapClient />);

    await waitFor(() => {
      expect(screen.getByLabelText("Sơ đồ kho")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `cd fe-pbvm-warehouse && npx vitest run tests/unit/warehouse-map-client.test.tsx`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Tạo `WarehouseMapClient`**

Tạo `fe-pbvm-warehouse/src/features/warehouse-layout/components/warehouse-map-client.tsx`:

```typescript
"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getApiErrorMessage } from "@/lib/api-contract";
import { hasAnyRole } from "@/lib/rbac";
import { useSessionUser } from "@/hooks/use-session-user";
import { WmsRole } from "@/lib/rbac";

import {
  fetchWarehouseLayout,
  patchAisle,
  patchGate,
  patchRack,
  patchZone,
} from "../services/warehouse-layout.service";
import {
  fetchShelfContents,
  fetchShelvesForRacks,
} from "../services/warehouse-shelves.service";
import {
  WarehouseFloorPlan,
  type LayoutSelection,
} from "./warehouse-floor-plan";
import { WarehouseLayoutInspector } from "./warehouse-layout-inspector";
import { RackConfigurationDialog } from "./rack-configuration-dialog";
import { applyRackConfiguration } from "../utils/warehouse-layout";
import { WarehouseArchitectureScene } from "@/features/warehouse-navigation/components/warehouse-architecture-scene";
import {
  groupShelvesByRack,
  layoutToWarehouseShelves,
} from "@/features/warehouse-navigation/utils/putaway-navigation";
import type { RackConfigurationScope } from "../utils/warehouse-layout";
import type { WarehouseShelf } from "@/types/api";

const layoutKeys = {
  detail: ["warehouse-layout"] as const,
};

export function WarehouseMapClient() {
  const { user } = useSessionUser();
  const canEdit = hasAnyRole(user, [WmsRole.MANAGER, WmsRole.ADMIN]);
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<LayoutSelection>(null);
  const [sceneMode, setSceneMode] = useState<"map" | "rack">("map");
  const [selectedRackCode, setSelectedRackCode] = useState<string | null>(
    null,
  );
  const [selectedShelfCode, setSelectedShelfCode] = useState<string | null>(
    null,
  );

  const layoutQuery = useQuery({
    queryKey: layoutKeys.detail,
    queryFn: fetchWarehouseLayout,
  });

  const rackIds = useMemo(
    () => layoutQuery.data?.racks.map((rack) => rack.id) ?? [],
    [layoutQuery.data],
  );

  const shelvesQuery = useQuery({
    queryKey: ["warehouse-shelves", rackIds],
    queryFn: () => fetchShelvesForRacks(rackIds),
    enabled: rackIds.length > 0,
  });

  const shelves: WarehouseShelf[] = useMemo(() => {
    if (!layoutQuery.data || !shelvesQuery.data) return [];
    return layoutToWarehouseShelves(layoutQuery.data, shelvesQuery.data);
  }, [layoutQuery.data, shelvesQuery.data]);

  const rackGroup = useMemo(() => {
    if (!selectedRackCode) return null;
    return (
      groupShelvesByRack(shelves, { rackCode: selectedRackCode })[0] ?? null
    );
  }, [shelves, selectedRackCode]);

  const contentsQuery = useQuery({
    queryKey: ["shelf-contents", selectedShelfCode],
    queryFn: () => {
      const shelf = shelves.find((s) => s.code === selectedShelfCode);
      if (!shelf) return Promise.resolve([]);
      return fetchShelfContents(shelf.id);
    },
    enabled: sceneMode === "rack" && Boolean(selectedShelfCode),
  });

  const patchMutation = useMutation({
    mutationFn: async (params: {
      kind: LayoutSelection extends infer S
        ? S extends { kind: infer K }
          ? K
          : never
        : never;
      id: string;
      patch: Record<string, unknown>;
    }) => {
      if (params.kind === "zone") return patchZone(params.id, params.patch);
      if (params.kind === "rack") return patchRack(params.id, params.patch);
      if (params.kind === "aisle") return patchAisle(params.id, params.patch);
      return patchGate(params.id, params.patch);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: layoutKeys.detail });
    },
  });

  function handlePatch(patch: Record<string, unknown>) {
    if (!selection) return;
    patchMutation.mutate({ kind: selection.kind, id: selection.id, patch });
  }

  function handleOpenRack(rackCode: string, shelfCode: string) {
    setSelectedRackCode(rackCode);
    setSelectedShelfCode(shelfCode);
    setSceneMode("rack");
  }

  if (layoutQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Đang tải sơ đồ kho…</div>;
  }

  if (layoutQuery.isError || !layoutQuery.data) {
    return (
      <div className="p-6 text-sm text-destructive">
        Không tải được sơ đồ kho.
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>Sơ đồ kho</CardTitle>
        </CardHeader>
        <CardContent>
          <WarehouseArchitectureScene
            contentsByShelf={{
              [selectedShelfCode ?? ""]: contentsQuery.data ?? [],
            }}
            erroredShelfCodes={new Set()}
            layout={layoutQuery.data}
            layoutSource="api"
            loadingShelfCodes={
              contentsQuery.isLoading && selectedShelfCode
                ? new Set([selectedShelfCode])
                : new Set()
            }
            onBackToMap={() => setSceneMode("map")}
            onOpenRack={handleOpenRack}
            onRetryShelf={() => void contentsQuery.refetch()}
            onSelectShelf={setSelectedShelfCode}
            rackGroup={rackGroup}
            route={null}
            sceneMode={sceneMode}
            selectedRackCode={selectedRackCode}
            selectedShelfCode={selectedShelfCode}
            suggestions={[]}
            suggestedShelfCodes={new Set()}
            unsupportedShelfCodes={new Set()}
          />
        </CardContent>
      </Card>

      <WarehouseLayoutInspector
        canEdit={canEdit}
        layout={layoutQuery.data}
        onApplyRackConfiguration={(scope: RackConfigurationScope) => {
          if (!selection || selection.kind !== "rack") return;
          const next = applyRackConfiguration(
            layoutQuery.data,
            selection.id,
            scope,
          );
          const changedRacks = next.racks.filter((rack, index) => {
            const before = layoutQuery.data.racks[index];
            return (
              rack.widthM !== before.widthM ||
              rack.depthM !== before.depthM ||
              rack.levelCount !== before.levelCount ||
              rack.bayCount !== before.bayCount ||
              rack.rotation !== before.rotation
            );
          });
          changedRacks.forEach((rack) => {
            patchMutation.mutate({
              kind: "rack",
              id: rack.id,
              patch: {
                widthM: rack.widthM,
                depthM: rack.depthM,
                levelCount: rack.levelCount,
                bayCount: rack.bayCount,
                rotation: rack.rotation,
              },
            });
          });
        }}
        onDelete={() => {
          // Xoá không nằm trong scope task này — vô hiệu hoá nút xoá qua canEdit=false
          // ở component cha nếu cần; để trống handler an toàn (không throw).
        }}
        onPatch={handlePatch}
        onRotate={() => {
          if (!selection) return;
          const current =
            selection.kind === "zone"
              ? layoutQuery.data.zones.find((z) => z.id === selection.id)
              : selection.kind === "rack"
                ? layoutQuery.data.racks.find((r) => r.id === selection.id)
                : null;
          if (!current) return;
          handlePatch({ rotation: current.rotation === 0 ? 90 : 0 });
        }}
        selection={selection}
      />
    </div>
  );
}
```

**Lưu ý cho implementer:** `RackConfigurationDialog` được render **bên trong** `WarehouseLayoutInspector` (đã xác nhận ở Task 11 Step 1 — inspector tự import và render dialog khi `selection.kind === 'rack'`), nên không cần import/render riêng ở `WarehouseMapClient`. `onDelete` để trống có chủ đích — xoá zone/rack/aisle/gate qua map là hành động phá huỷ cấu trúc đang được Shelf/PutAway tham chiếu, không nằm trong scope "map + suggestion" của plan này; nếu cần, làm ở 1 plan riêng sau khi có review UX rõ ràng về ảnh hưởng dây chuyền.

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `cd fe-pbvm-warehouse && npx vitest run tests/unit/warehouse-map-client.test.tsx`
Expected: PASS

- [ ] **Step 5: Tạo page route**

Tạo `fe-pbvm-warehouse/src/app/(dashboard)/locations/map/page.tsx`:

```typescript
import { WarehouseMapClient } from "@/features/warehouse-layout/components/warehouse-map-client";

export default function LocationsMapPage() {
  return <WarehouseMapClient />;
}
```

- [ ] **Step 6: Thêm link từ `/locations` sang `/locations/map`**

Đọc `fe-pbvm-warehouse/src/app/(dashboard)/locations/page.tsx` hiện tại (chỉ 5 dòng, xem Task khảo sát) — nó chỉ render `<LocationStructureClient />`. Thêm link điều hướng bằng cách sửa `LocationStructureClient` (đọc phần header/toolbar của component 644 dòng để tìm chỗ đặt nút phù hợp — ví dụ cạnh tiêu đề trang) để thêm:

```typescript
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MapPinned } from "lucide-react";
```

```typescript
<Link href="/locations/map">
  <Button variant="outline">
    <MapPinned data-icon="inline-start" />
    Xem sơ đồ kho
  </Button>
</Link>
```

Đặt trong vùng header/toolbar hiện có của component — vị trí chính xác tuỳ theo cấu trúc JSX đọc được, giữ nhất quán với style nút khác trong cùng toolbar.

- [ ] **Step 7: Type-check toàn bộ FE**

Run: `cd fe-pbvm-warehouse && npx tsc --noEmit`
Expected: sạch.

- [ ] **Step 8: Chạy toàn bộ test suite FE liên quan**

Run: `cd fe-pbvm-warehouse && npx vitest run tests/unit/warehouse-layout.test.ts tests/unit/warehouse-navigation.test.ts tests/unit/warehouse-navigation-components.test.tsx tests/unit/warehouse-layout-service.test.ts tests/unit/warehouse-shelves-service.test.ts tests/unit/warehouse-map-client.test.tsx`
Expected: tất cả PASS.

- [ ] **Step 9: Lint**

Run: `cd fe-pbvm-warehouse && npx eslint src/features/warehouse-layout src/app/\(dashboard\)/locations --fix`
Expected: không lỗi còn lại.

- [ ] **Step 10: Commit**

```bash
cd fe-pbvm-warehouse && git add src/app/\(dashboard\)/locations src/features/warehouse-layout/components/warehouse-map-client.tsx tests/unit/warehouse-map-client.test.tsx
git commit -m "feat: thêm trang /locations/map — nối floor plan + rack elevation với API thật"
```

---

## Phần F — Xác minh cuối (chạy thủ công qua UI thật)

### Task 13: Kiểm thử end-to-end thủ công

**Files:** Không tạo/sửa file — chỉ chạy và quan sát.

- [ ] **Step 1: Chạy BE**

Run: `cd be && pnpm start:wms` (đảm bảo `WMS_DATABASE_URL`, Redis đã cấu hình theo `.env`).

- [ ] **Step 2: Tạo dữ liệu mẫu qua Swagger (`/api/wms/docs` hoặc endpoint tương ứng)**

Tạo tuần tự qua Swagger UI hoặc `curl`:
1. 1 zone với `xM=1, yM=1, widthM=16, heightM=22`.
2. 2 rack trong zone đó, mỗi rack `widthM/depthM/levelCount/bayCount` **khác nhau** (xác nhận yêu cầu "mỗi rack kích thước riêng").
3. 2-3 shelf mỗi rack, 1 shelf đánh dấu `isStaging=true`.
4. 1 aisle loại `MAIN`, 1 gate.

- [ ] **Step 3: Gọi `GET /api/wms/location/layout`, xác nhận response chứa đủ 4 mảng với toạ độ đúng đã tạo.**

- [ ] **Step 4: Chạy FE**

Run: `cd fe-pbvm-warehouse && pnpm dev`

- [ ] **Step 5: Mở `/locations/map`, xác nhận:**
- Floor plan hiển thị đúng zone/rack/aisle/gate theo toạ độ đã tạo.
- Bấm chọn 1 rack → inspector hiện đúng thông số (kích thước riêng của rack đó, không bị trộn với rack khác).
- Sửa toạ độ qua inspector → gọi `PATCH /location/racks/:id` thành công, floor plan cập nhật ngay (invalidate query).
- Bấm vào 1 rack → chuyển sang rack elevation, thấy đúng số tầng shelf đã tạo.
- Nếu đã tạo `InventoryStock` mẫu cho 1 shelf (qua GRN flow hoặc seed), xác nhận rack elevation hiển thị đúng SKU/số lượng thật.

- [ ] **Step 6: Gọi `GET /api/wms/putaway/suggestions?sku=<sku>&qty=<n>` với SKU có kích thước phù hợp nhiều shelf — xác nhận shelf gần staging (theo toạ độ vừa tạo) được ưu tiên khi các tiêu chí khác ngang nhau.**

- [ ] **Step 7: Ghi lại kết quả quan sát — nếu có lệch so với kỳ vọng, quay lại task tương ứng để sửa trước khi coi plan hoàn thành.**

---

## Tổng kết phạm vi đã bao phủ (đối chiếu spec `2026-07-27-warehouse-2d-map-design.md`)

| Quyết định trong spec | Task tương ứng |
|---|---|
| Zone/Rack toạ độ 2D | Task 1, 2 |
| Mỗi rack kích thước riêng | Task 2 |
| Aisle/Gate | Task 3, 4 |
| API layout tổng hợp | Task 5 |
| Singleton 1 kho | Toàn bộ (không có `warehouseId` ở bất kỳ đâu) |
| Chỉnh trực tiếp, không DRAFT/PUBLISH | Task 5 (không có field `status` điều khiển ở BE), Task 12 (patch áp dụng ngay) |
| Weighted scoring put-away (không AI) | Task 6 |
| Rack elevation đầy đủ với tồn kho thật | Task 7, 9, 12 |
| Nối UI có sẵn thay vì viết lại (Phương án A) | Task 8–12 (tái sử dụng `WarehouseFloorPlan`, `WarehouseLayoutInspector`, `RackConfigurationDialog`, `WarehouseArchitectureScene` nguyên vẹn) |
