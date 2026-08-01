import { ItemType } from '../../stock/schemas/warehouse-item.schema';
import { ZonePurpose, ZoneSchema } from './zone.schema';

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

  it('zone lưu mục đích và các loại hàng được phép', () => {
    expect(ZoneSchema.path('zonePurpose').getDefault()).toBe(
      ZonePurpose.STORAGE,
    );
    expect(ZoneSchema.path('allowedItemTypes').getDefault()).toEqual([]);
    expect(
      Object.values(ZoneSchema.path('allowedItemTypes').options.enum),
    ).toEqual(expect.arrayContaining(Object.values(ItemType)));
  });

  it('database chỉ cho phép một khu HỦY đang hoạt động', () => {
    const scrapIndex = ZoneSchema.indexes().find(
      ([keys]) => keys['zonePurpose'] === 1,
    );

    expect(scrapIndex).toEqual([
      { zonePurpose: 1 },
      {
        unique: true,
        partialFilterExpression: {
          zonePurpose: ZonePurpose.SCRAP,
          deletedAt: null,
        },
      },
    ]);
  });
});
