import { WarehouseLayoutConfigSchema } from './warehouse-layout-config.schema';

describe('WarehouseLayoutConfigSchema', () => {
  it('khai báo singleton canvas mặc định và revision bắt đầu từ 1', () => {
    expect(WarehouseLayoutConfigSchema.path('key').getDefault()).toBe(
      'SINGLETON',
    );
    expect(WarehouseLayoutConfigSchema.path('widthM').getDefault()).toBe(40);
    expect(WarehouseLayoutConfigSchema.path('heightM').getDefault()).toBe(24);
    expect(WarehouseLayoutConfigSchema.path('gridM').getDefault()).toBe(0.5);
    expect(WarehouseLayoutConfigSchema.path('revision').getDefault()).toBe(1);
  });

  it('lưu trong collection warehouse_layout_configs', () => {
    expect(WarehouseLayoutConfigSchema.get('collection')).toBe(
      'warehouse_layout_configs',
    );
  });
});
