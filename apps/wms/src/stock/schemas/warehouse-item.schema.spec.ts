import { model, Model, Types } from 'mongoose';
import {
  ItemType,
  WarehouseItem,
  WarehouseItemSchema,
} from './warehouse-item.schema';

const WarehouseItemModel: Model<WarehouseItem> = model<WarehouseItem>(
  'WarehouseItemSpec',
  WarehouseItemSchema,
);

describe('WarehouseItem schema', () => {
  it('ItemType enum có đủ 4 giá trị', () => {
    expect(Object.values(ItemType)).toEqual([
      'MATERIAL',
      'CUP_BLANK',
      'CUP_PRINTED',
      'PACKAGING',
    ]);
  });

  it('schema có field sku, barcode, name, type, unit, isPerishable, isActive', () => {
    const paths = WarehouseItemSchema.paths;
    expect(paths['sku']).toBeDefined();
    expect(paths['barcode']).toBeDefined();
    expect(paths['name']).toBeDefined();
    expect(paths['type']).toBeDefined();
    expect(paths['unit']).toBeDefined();
    expect(paths['isPerishable']).toBeDefined();
    expect(paths['isActive']).toBeDefined();
    expect(paths['deletedAt']).toBeDefined();
    expect(paths['createdBy']).toBeDefined();
    expect(paths['updatedBy']).toBeDefined();
  });
});

describe('kích thước (depth/width/height)', () => {
  it('cho phép tạo item không khai kích thước (optional)', () => {
    const doc = new WarehouseItemModel({
      sku: 'SKU-NO-DIM',
      name: 'Không khai kích thước',
      type: ItemType.MATERIAL,
      unit: 'cái',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.depth).toBeUndefined();
    expect(doc.width).toBeUndefined();
    expect(doc.height).toBeUndefined();
  });

  it('lưu đúng depth/width/height khi khai đủ', () => {
    const doc = new WarehouseItemModel({
      sku: 'SKU-DIM',
      name: 'Có khai kích thước',
      type: ItemType.MATERIAL,
      unit: 'cái',
      depth: 10,
      width: 20,
      height: 5,
    });
    expect(doc.depth).toBe(10);
    expect(doc.width).toBe(20);
    expect(doc.height).toBe(5);
  });
});

describe('blankItemId (CUP_PRINTED → CUP_BLANK gốc)', () => {
  it('cho phép tạo CUP_PRINTED không khai blankItemId (optional)', () => {
    const doc = new WarehouseItemModel({
      sku: 'CUP-PRINTED-NO-BLANK',
      name: 'Ly in chưa gắn blank',
      type: ItemType.CUP_PRINTED,
      unit: 'cái',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.blankItemId).toBeUndefined();
  });

  it('lưu đúng blankItemId khi khai', () => {
    const blankId = new Types.ObjectId();
    const doc = new WarehouseItemModel({
      sku: 'CUP-PRINTED-WITH-BLANK',
      name: 'Ly in đã gắn blank',
      type: ItemType.CUP_PRINTED,
      unit: 'cái',
      blankItemId: blankId,
    });
    expect(doc.blankItemId?.toString()).toBe(blankId.toString());
  });
});

describe('minQuantity (ngưỡng cảnh báo stock.low)', () => {
  it('cho phép tạo item không khai minQuantity (optional, không cảnh báo)', () => {
    const doc = new WarehouseItemModel({
      sku: 'SKU-NO-MINQTY',
      name: 'Không khai ngưỡng',
      type: ItemType.MATERIAL,
      unit: 'cái',
    });
    const err = doc.validateSync();
    expect(err).toBeUndefined();
    expect(doc.minQuantity).toBeUndefined();
  });

  it('lưu đúng minQuantity khi khai', () => {
    const doc = new WarehouseItemModel({
      sku: 'SKU-MINQTY',
      name: 'Có khai ngưỡng',
      type: ItemType.MATERIAL,
      unit: 'cái',
      minQuantity: 10,
    });
    expect(doc.minQuantity).toBe(10);
  });
});
