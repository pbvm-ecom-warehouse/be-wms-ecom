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
