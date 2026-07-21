# Cup SKU and EAN-13 Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sinh SKU có ý nghĩa và barcode EAN-13 duy nhất khi WMS tạo `CUP_BLANK`, đồng thời cung cấp danh mục thuộc tính do ADMIN quản lý.

**Architecture:** Giữ template `CUP-{CUP_STYLE}-{MATERIAL}-{CAPACITY}-{COLOR}` trong BE; option value nằm trong MongoDB. `SkuBuilderService` là nguồn sinh SKU duy nhất. `BarcodeService` cấp sequence atomic, tính checksum; `barcode_registry` là nguồn định danh quét duy nhất cho primary/alternate barcode.

**Tech Stack:** NestJS 11, TypeScript, Mongoose, MongoDB transaction, class-validator, Jest.

## Global Constraints

- Chỉ thay contract tạo tự động cho `type=CUP_BLANK`; item type khác giữ contract cũ.
- SKU `CUP_BLANK` không nhận từ client, immutable và unique kể cả item soft-delete.
- Barcode nội bộ gồm prefix `20`, sequence 10 chữ số và checksum EAN-13.
- ADMIN quản lý option; ADMIN và MANAGER được đọc option active/template.
- Không đọc chéo Ecommerce DB và không thêm dependency mới.

---

### Task 1: Attribute option persistence and seed

**Files:**
- Create: `apps/wms/src/stock/schemas/item-attribute-option.schema.ts`
- Create: `apps/wms/src/stock/dto/item-attribute-option.dto.ts`
- Create: `apps/wms/src/stock/services/attribute-code.service.ts`
- Test: `apps/wms/src/stock/services/attribute-code.service.spec.ts`
- Modify: `apps/wms/src/stock/stock.module.ts`
- Modify: `apps/wms/src/seed/seed.ts`

**Interfaces:**
- Produces: `AttributeKey`, `ItemAttributeOption`, `suggestAttributeCode(name)`.

- [ ] **Step 1: Write failing code-suggestion tests**

```ts
expect(suggestAttributeCode('Ly nắp tim')).toBe('LNT');
expect(suggestAttributeCode('Trong suốt')).toBe('TS');
expect(suggestAttributeCode('PET')).toBe('PET');
expect(() => suggestAttributeCode('---')).toThrow();
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm test -- --runInBand apps/wms/src/stock/services/attribute-code.service.spec.ts`  
Expected: FAIL because `attribute-code.service.ts` does not exist.

- [ ] **Step 3: Implement schema, DTO and deterministic suggestion**

```ts
export enum AttributeKey {
  CUP_STYLE = 'CUP_STYLE',
  MATERIAL = 'MATERIAL',
  CAPACITY = 'CAPACITY',
  COLOR = 'COLOR',
}

@Schema({ collection: 'item_attribute_options', timestamps: true })
export class ItemAttributeOption {
  @Prop({ enum: AttributeKey, required: true }) key!: AttributeKey;
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, trim: true, uppercase: true, match: /^[A-Z0-9]{1,6}$/ })
  code!: string;
  @Prop({ default: true }) isActive!: boolean;
  @Prop({ default: 0 }) sortOrder!: number;
  @Prop({ type: Types.ObjectId }) createdBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) updatedBy?: Types.ObjectId;
  @Prop({ type: Date, default: null }) deletedAt?: Date | null;
}

ItemAttributeOptionSchema.index({ key: 1, code: 1 }, { unique: true });
```

Suggestion: bỏ dấu bằng `normalize('NFD')`, loại combining marks, tách token chữ/số; nhiều token lấy chữ đầu tối đa 6, một token lấy tối đa 6 ký tự.

- [ ] **Step 4: Register schema and seed idempotently**

Seed `RND/SQR/HRT`, `PET/PLA`, `350/500`, `CLR/RED` bằng upsert `{key,code}`; không overwrite tên option đã được ADMIN sửa.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- --runInBand apps/wms/src/stock/services/attribute-code.service.spec.ts`  
Expected: PASS.  
Commit: `feat(wms): add SKU attribute option catalog`

---

### Task 2: SKU template and builder

**Files:**
- Create: `apps/wms/src/stock/services/sku-builder.service.ts`
- Create: `apps/wms/src/stock/dto/sku-template.dto.ts`
- Test: `apps/wms/src/stock/services/sku-builder.service.spec.ts`
- Modify: `apps/wms/src/stock/schemas/warehouse-item.schema.ts`
- Modify: `apps/wms/src/stock/stock.module.ts`

**Interfaces:**
- Consumes: `AttributeKey`, active `ItemAttributeOption` rows.
- Produces: `CUP_BLANK_ATTRIBUTE_ORDER`, `buildCupBlankSku(optionsByKey)`, attribute snapshots with `key` and `optionId`.

- [ ] **Step 1: Write failing builder tests**

```ts
const options = new Map([
  [AttributeKey.COLOR, option(AttributeKey.COLOR, 'CLR')],
  [AttributeKey.CAPACITY, option(AttributeKey.CAPACITY, '500')],
  [AttributeKey.CUP_STYLE, option(AttributeKey.CUP_STYLE, 'HRT')],
  [AttributeKey.MATERIAL, option(AttributeKey.MATERIAL, 'PET')],
]);
expect(service.buildCupBlankSku(options)).toBe('CUP-HRT-PET-500-CLR');
expect(() => service.buildCupBlankSku(new Map())).toThrow();
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- --runInBand apps/wms/src/stock/services/sku-builder.service.spec.ts`  
Expected: FAIL because builder is missing.

- [ ] **Step 3: Implement fixed ordered template**

```ts
export const CUP_BLANK_ATTRIBUTE_ORDER = [
  AttributeKey.CUP_STYLE,
  AttributeKey.MATERIAL,
  AttributeKey.CAPACITY,
  AttributeKey.COLOR,
] as const;

buildCupBlankSku(options: Map<AttributeKey, ItemAttributeOption>): string {
  const segments = CUP_BLANK_ATTRIBUTE_ORDER.map((key) => {
    const option = options.get(key);
    if (!option || !option.isActive || option.deletedAt) {
      throw new AppException('STOCK_ATTRIBUTE_OPTION_NOT_FOUND');
    }
    return option.code;
  });
  return ['CUP', ...segments].join('-');
}
```

Extend WarehouseItem attribute subdocument with `key: AttributeKey` and `optionId: ObjectId`, while retaining `name/value/code` snapshots.

- [ ] **Step 4: Run schema and builder tests**

Run: `pnpm test -- --runInBand apps/wms/src/stock/services/sku-builder.service.spec.ts apps/wms/src/stock/schemas/warehouse-item.schema.spec.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(wms): build CUP_BLANK SKU from catalog options`

---

### Task 3: EAN-13 sequence and barcode registry

**Files:**
- Create: `apps/wms/src/stock/schemas/barcode-counter.schema.ts`
- Create: `apps/wms/src/stock/schemas/barcode-registry.schema.ts`
- Create: `apps/wms/src/stock/services/barcode.service.ts`
- Test: `apps/wms/src/stock/services/barcode.service.spec.ts`
- Modify: `apps/wms/src/stock/stock.module.ts`

**Interfaces:**
- Produces: `calculateEan13Checksum(twelveDigits)`, `generateInternalBarcode()`, `BarcodeKind`.

- [ ] **Step 1: Write checksum and concurrent-allocation tests**

```ts
expect(calculateEan13Checksum('200000000123')).toBe('4');
expect(isValidEan13('2000000001234')).toBe(true);
expect(await Promise.all([service.generateInternalBarcode(), service.generateInternalBarcode()]))
  .toEqual(['2000000000015', '2000000000022']);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- --runInBand apps/wms/src/stock/services/barcode.service.spec.ts`  
Expected: FAIL because barcode service is missing.

- [ ] **Step 3: Implement schemas and checksum**

```ts
export enum BarcodeKind { PRIMARY = 'PRIMARY', ALTERNATE = 'ALTERNATE' }

@Schema({ collection: 'barcode_counters' })
export class BarcodeCounter {
  @Prop({ required: true, unique: true }) prefix!: string;
  @Prop({ required: true, default: 0 }) sequence!: number;
}

@Schema({ collection: 'barcode_registry', timestamps: { createdAt: true, updatedAt: false } })
export class BarcodeRegistry {
  @Prop({ required: true, unique: true }) code!: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) itemId!: Types.ObjectId;
  @Prop({ enum: BarcodeKind, required: true }) kind!: BarcodeKind;
}
```

Allocate with atomic `$inc`; pad sequence to 10 digits; prepend `20`; append checksum. Reject sequence above `9_999_999_999`.

- [ ] **Step 4: Run focused tests and commit**

Run: `pnpm test -- --runInBand apps/wms/src/stock/services/barcode.service.spec.ts`  
Expected: PASS.  
Commit: `feat(wms): add atomic internal EAN-13 barcode generation`

---

### Task 4: Preview, create and ADMIN APIs

**Files:**
- Modify: `apps/wms/src/stock/dto/create-warehouse-item.dto.ts`
- Modify: `apps/wms/src/stock/stock.controller.ts`
- Modify: `apps/wms/src/stock/stock.service.ts`
- Modify: `apps/wms/src/stock/stock.repository.ts`
- Modify: `apps/wms/src/common/error-codes.ts`
- Test: `apps/wms/src/stock/stock.service.spec.ts`
- Test: `apps/wms/src/stock/stock.repository.spec.ts`

**Interfaces:**
- Produces: template, preview and option-management endpoints from the design spec.

- [ ] **Step 1: Add failing service tests**

Cover: unordered option IDs build the canonical SKU; inactive/wrong-group option fails; create ignores client SKU for CUP_BLANK; duplicate SKU maps to `STOCK_ITEM_SKU_CONFLICT`; duplicate registry code maps to `STOCK_ITEM_BARCODE_CONFLICT`; used option code is immutable.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- --runInBand apps/wms/src/stock/stock.service.spec.ts apps/wms/src/stock/stock.repository.spec.ts`  
Expected: new expectations FAIL.

- [ ] **Step 3: Implement request contract and orchestration**

```ts
export class CreateCupBlankAttributeSelectionDto {
  @IsMongoId() CUP_STYLE!: string;
  @IsMongoId() MATERIAL!: string;
  @IsMongoId() CAPACITY!: string;
  @IsMongoId() COLOR!: string;
}

// On type=CUP_BLANK, service requires attributeOptionIds and does not use dto.sku/dto.barcode.
const options = await repo.findActiveAttributeOptions(dto.attributeOptionIds);
const sku = skuBuilder.buildCupBlankSku(toOptionMap(options));
const barcode = await barcodeService.generateInternalBarcode();
return transactionHelper.run((session) =>
  repo.createItemWithBarcodeRegistry({ ...data, sku, barcode, attributes }, session),
);
```

Keep legacy create path for `MATERIAL`, `PACKAGING` and internal `CUP_PRINTED` creation. Catch Mongo `11000` by inspected index/key, never map every duplicate blindly to SKU.

- [ ] **Step 4: Add controller routes and roles**

Implement exact routes and response/error contract in the approved design. Put static `items/sku-preview` and `item-types/:type/sku-template` routes before `items/:id` matching concerns. Apply `@Roles(ADMIN)` to option mutation and `@Roles(ADMIN, MANAGER)` to reads.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- --runInBand apps/wms/src/stock`  
Expected: PASS.  
Commit: `feat(wms): expose generated cup SKU and attribute catalog APIs`

---

### Task 5: Registry backfill and scan resolution

**Files:**
- Create: `apps/wms/src/seed/backfill-barcode-registry.ts`
- Modify: `package.json`
- Modify: `apps/wms/src/stock/stock.repository.ts`
- Test: `apps/wms/src/stock/stock.repository.spec.ts`

**Interfaces:**
- Produces: `pnpm backfill:barcode-registry --dry-run`, deterministic registry-based `findItemByBarcode`.

- [ ] **Step 1: Write failing tests**

Assert dry-run reports `{code,itemIds,kinds}` for primary/alternate collisions and writes zero rows; clean input inserts all registry rows; `findItemByBarcode` queries registry then item ID; update alt barcode registers additions and deletes removals in one session.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- --runInBand apps/wms/src/stock/stock.repository.spec.ts`  
Expected: new registry expectations FAIL.

- [ ] **Step 3: Implement backfill and registry resolution**

Normalize codes with `trim()`, ignore absent values, report empty strings separately, include soft-deleted items, and abort writes when any code has more than one owner. Add package script using the same environment bootstrap pattern as `seed:wms`.

- [ ] **Step 4: Run dry-run against configured development DB**

Run: `pnpm backfill:barcode-registry --dry-run`  
Expected: exit 0 with counts when clean; exit 1 plus collision report when cleanup is required.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- --runInBand apps/wms/src/stock/stock.repository.spec.ts`  
Expected: PASS.  
Commit: `feat(wms): backfill and resolve scan codes through barcode registry`

---

### Task 6: End-to-end verification and documentation

**Files:**
- Modify: `apps/wms/test/happy-path.e2e-spec.ts`
- Modify: `docs/warehouse/data-model.md`
- Modify: `apps/wms/src/stock/dto/warehouse-item.response.dto.ts`

**Interfaces:**
- Validates the complete public contract consumed by FE.

- [ ] **Step 1: Add E2E scenario**

Create/seed options, preview `CUP-HRT-PET-500-CLR`, create CUP_BLANK without SKU/barcode, assert returned EAN-13, assert second create returns 409, and confirm put-away scan resolves the returned barcode.

- [ ] **Step 2: Run E2E and fix only contract defects**

Run: `pnpm test:e2e -- --runInBand apps/wms/test/happy-path.e2e-spec.ts`  
Expected: PASS with Mongo replica set and Redis available.

- [ ] **Step 3: Update docs and run full verification**

Run: `pnpm lint && pnpm test -- --runInBand && pnpm build`  
Expected: all commands exit 0.

- [ ] **Step 4: Commit**

Commit: `test(wms): cover generated cup SKU and barcode workflow`
