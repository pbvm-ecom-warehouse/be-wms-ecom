import { RackSchema } from './rack.schema';

describe('Rack schema', () => {
  it('có field vị trí (không có kích thước — kích thước dùng chung từ RackTemplate)', () => {
    const paths = RackSchema.paths;
    expect(paths['xM']).toBeDefined();
    expect(paths['yM']).toBeDefined();
    expect(paths['rotation']).toBeDefined();
    expect(paths['accessPointXM']).toBeDefined();
    expect(paths['accessPointYM']).toBeDefined();
    expect(paths['widthM']).toBeUndefined();
    expect(paths['depthM']).toBeUndefined();
    expect(paths['levelCount']).toBeUndefined();
    expect(paths['bayCount']).toBeUndefined();
  });
});
