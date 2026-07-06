import { model, Model } from 'mongoose';
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
