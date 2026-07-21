import { CarrierSchema, CarrierStatus } from './carrier.schema';

describe('CarrierSchema', () => {
  it('có index unique trên code', () => {
    const indexes = CarrierSchema.indexes();
    const hasUniqueCode = indexes.some(
      ([fields, opts]) => fields['code'] === 1 && opts?.unique === true,
    );
    expect(hasUniqueCode).toBe(true);
  });

  it('status mặc định ACTIVE', () => {
    const path = CarrierSchema.path('status');
    expect(path.defaultValue).toBe(CarrierStatus.ACTIVE);
  });

  it('collection name là carriers', () => {
    expect(CarrierSchema.get('collection')).toBe('carriers');
  });
});
