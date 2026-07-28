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
