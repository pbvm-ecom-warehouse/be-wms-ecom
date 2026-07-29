import { RackTemplateSchema } from './rack-template.schema';

describe('RackTemplate schema', () => {
  it('có đủ field kích thước chuẩn dùng chung', () => {
    const paths = RackTemplateSchema.paths;
    expect(paths['widthM']).toBeDefined();
    expect(paths['depthM']).toBeDefined();
    expect(paths['heightM']).toBeDefined();
    expect(paths['levelCount']).toBeDefined();
    expect(paths['bayCount']).toBeDefined();
  });

  it('collection tên rack_templates', () => {
    expect(RackTemplateSchema.get('collection')).toBe('rack_templates');
  });

  it('levelCount và bayCount mặc định 1', () => {
    expect(RackTemplateSchema.path('heightM').getDefault()).toBe(1);
    expect(RackTemplateSchema.path('levelCount').getDefault()).toBe(1);
    expect(RackTemplateSchema.path('bayCount').getDefault()).toBe(1);
  });
});
