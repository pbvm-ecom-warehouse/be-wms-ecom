# Cup SKU and EAN-13 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay form nhập SKU/barcode thủ công của `CUP_BLANK` bằng lựa chọn thuộc tính, SKU preview read-only và màn hình kết quả barcode EAN-13.

**Architecture:** Service layer giữ toàn bộ API types/functions. Dialog tạo item được tách khỏi `warehouse-items-client.tsx`; component template fields chỉ render contract BE trả về. React Query quản lý template/preview/options và debounce preview 400 ms.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, TanStack Query, shadcn/Radix, Vitest, Testing Library.

## Global Constraints

- Repo: `pbvm-ecom-warehouse/fe-pbvm-warehouse`, branch mặc định `main`.
- Không sinh barcode nội bộ ở FE và không gửi `sku`/`barcode` khi tạo `CUP_BLANK`.
- SKU preview luôn read-only; BE response sau create là nguồn sự thật.
- ADMIN quản lý option; MANAGER chỉ dùng option active để tạo item.
- Giữ form legacy cho item type chưa có template.

---

### Task 1: Extend product service contract

**Files:**
- Modify: `src/features/products/services/warehouse-items.service.ts`
- Test: `tests/unit/warehouse-items-service.test.ts`

**Interfaces:**
- Produces: `SkuTemplate`, `AttributeOption`, `previewWarehouseItemSku`, option CRUD and discriminated create input.

- [ ] **Step 1: Write failing service tests**

```ts
await getWarehouseItemSkuTemplate('CUP_BLANK');
expect(apiClient.get).toHaveBeenCalledWith('/stock/item-types/CUP_BLANK/sku-template');

await previewWarehouseItemSku(input);
expect(apiClient.post).toHaveBeenCalledWith('/stock/items/sku-preview', input);
```

Also assert CUP_BLANK create payload contains `attributeOptionIds` and omits `sku`/`barcode`.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/unit/warehouse-items-service.test.ts`  
Expected: FAIL because functions/types do not exist.

- [ ] **Step 3: Implement exact API types**

```ts
export type AttributeKey = 'CUP_STYLE' | 'MATERIAL' | 'CAPACITY' | 'COLOR';
export type AttributeOption = {
  id: string; key: AttributeKey; name: string; code: string;
  isActive: boolean; sortOrder: number; used: boolean;
};
export type SkuTemplateField = {
  key: AttributeKey; label: string; required: true; options: AttributeOption[];
};
export type SkuTemplate = {
  type: 'CUP_BLANK'; prefix: 'CUP'; fields: SkuTemplateField[];
};
export type CupBlankCreateInput = Omit<CreateWarehouseItemInput, 'sku' | 'barcode' | 'attributes'> & {
  type: 'CUP_BLANK';
  attributeOptionIds: Record<AttributeKey, string>;
};
```

Add GET template, POST preview, GET/POST/PATCH option and POST code-suggestion functions using `unwrapApiData`.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test -- tests/unit/warehouse-items-service.test.ts`  
Expected: PASS.  
Commit: `feat(products): add generated SKU API contract`

---

### Task 2: CUP_BLANK create dialog and SKU preview

**Files:**
- Create: `src/features/products/components/create-warehouse-item-dialog.tsx`
- Create: `src/features/products/components/cup-sku-template-fields.tsx`
- Modify: `src/features/products/components/warehouse-items-client.tsx`
- Test: `tests/unit/create-warehouse-item-dialog.test.tsx`

**Interfaces:**
- Consumes: service types/functions from Task 1, `useDebounce`, session roles.
- Produces: `CreateWarehouseItemDialog({open,onOpenChange})`.

- [ ] **Step 1: Write failing UI tests**

Render dialog with mocked template. Assert four selects render in BE order; selecting HRT/PET/500/CLR renders `CUP-HRT-PET-500-CLR`; there is no editable SKU or primary barcode input; preview fires once after 400 ms; duplicate preview disables submit.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/unit/create-warehouse-item-dialog.test.tsx`  
Expected: FAIL because dialog does not exist.

- [ ] **Step 3: Implement template-driven fields**

```tsx
{template.fields.map((field) => (
  <Select
    key={field.key}
    value={selection[field.key] ?? ''}
    onValueChange={(id) => setSelection((old) => ({ ...old, [field.key]: id }))}
  >
    <SelectTrigger aria-label={field.label}><SelectValue /></SelectTrigger>
    <SelectContent>{field.options.map((option) => (
      <SelectItem key={option.id} value={option.id}>
        {option.name} ({option.code})
      </SelectItem>
    ))}</SelectContent>
  </Select>
))}
```

Compute immediate preview from selected option codes; debounce complete selection 400 ms and confirm with preview API. Incomplete selection never calls preview. Keep legacy fields for non-CUP_BLANK type.

- [ ] **Step 4: Submit canonical payload and show API errors**

For CUP_BLANK send option IDs, name/unit/stock metadata and alternate barcodes only. Map `STOCK_ITEM_SKU_CONFLICT` and `STOCK_ITEM_BARCODE_CONFLICT` into inline banners; keep toast for connection/unexpected errors.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- tests/unit/create-warehouse-item-dialog.test.tsx`  
Expected: PASS.  
Commit: `feat(products): create cups from read-only generated SKU`

---

### Task 3: Success result and alternate barcode UX

**Files:**
- Create: `src/features/products/components/warehouse-item-create-result.tsx`
- Create: `src/features/products/components/alternate-barcode-field.tsx`
- Modify: `src/features/products/components/create-warehouse-item-dialog.tsx`
- Test: `tests/unit/create-warehouse-item-result.test.tsx`

**Interfaces:**
- Consumes: created `WarehouseItem` response.
- Produces: deduplicated alternate barcode input and persistent success panel.

- [ ] **Step 1: Write failing tests**

Assert blank/duplicate alternate codes are rejected locally; successful response keeps dialog open; SKU and barcode response values render with copy buttons; “Tạo mặt hàng tiếp” resets form. Assert “In tem” is disabled with explanatory tooltip when no print endpoint/callback exists.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/unit/create-warehouse-item-result.test.tsx`  
Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement result panel**

```tsx
<InfoRow label="SKU" value={item.sku} action={<CopyButton value={item.sku} />} />
<InfoRow label="Barcode" value={item.barcode ?? 'Không có'} action={
  item.barcode ? <CopyButton value={item.barcode} /> : null
} />
```

Use `navigator.clipboard.writeText` with success/error toast. Do not close dialog in create mutation `onSuccess`; replace form with result view.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test -- tests/unit/create-warehouse-item-result.test.tsx`  
Expected: PASS.  
Commit: `feat(products): show generated SKU and barcode after create`

---

### Task 4: ADMIN attribute option management

**Files:**
- Create: `src/features/products/components/attribute-options-admin-dialog.tsx`
- Modify: `src/features/products/components/warehouse-items-client.tsx`
- Test: `tests/unit/attribute-options-admin-dialog.test.tsx`

**Interfaces:**
- Consumes: option CRUD/code suggestion APIs and session role.
- Produces: ADMIN-only management dialog grouped by tabs.

- [ ] **Step 1: Write failing tests**

Assert button/dialog is absent for MANAGER; ADMIN sees tabs Kiểu ly/Chất liệu/Dung tích/Màu sắc; typing “Ly nắp tim” requests and fills suggested `LNT`; submit remains disabled until ADMIN focuses/confirms the code field; used option code is read-only; deactivate replaces delete.

- [ ] **Step 2: Verify RED**

Run: `pnpm test -- tests/unit/attribute-options-admin-dialog.test.tsx`  
Expected: FAIL because dialog does not exist.

- [ ] **Step 3: Implement ADMIN dialog**

Use existing `Tabs`, `Table`, `Dialog`, `Switch`, `Input` and React Query patterns. Track `codeConfirmed` separately from code value; reset it whenever name changes and a new suggestion arrives. Invalidate both option list and template query after mutations.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm test -- tests/unit/attribute-options-admin-dialog.test.tsx`  
Expected: PASS.  
Commit: `feat(products): manage SKU attribute options`

---

### Task 5: Full FE verification

**Files:**
- Modify: `tests/e2e/smoke.spec.ts`

**Interfaces:**
- Verifies the integrated UI contract.

- [ ] **Step 1: Add mocked/integration browser path**

Cover ADMIN opens create dialog, selects CUP_BLANK attributes, sees read-only SKU, creates, sees returned barcode, copies it and resets. Cover conflict response keeping selections intact.

- [ ] **Step 2: Run focused and full checks**

Run: `pnpm test -- tests/unit/warehouse-items-service.test.ts tests/unit/create-warehouse-item-dialog.test.tsx tests/unit/create-warehouse-item-result.test.tsx tests/unit/attribute-options-admin-dialog.test.tsx`  
Expected: PASS.

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`  
Expected: all commands exit 0.

- [ ] **Step 3: Commit**

Commit: `test(products): cover generated cup SKU workflow`
