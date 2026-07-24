import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWarehouseItemDto } from './create-warehouse-item.dto';
import { ItemType } from '../schemas/warehouse-item.schema';

const BASE = {
  templateId: 'MATERIAL',
  attributeOptionIds: ['66a10000000000000000a001'],
  name: 'Item 1',
  type: ItemType.MATERIAL,
  unit: 'cái',
};

describe('CreateWarehouseItemDto — minQuantity', () => {
  it('không truyền minQuantity vẫn hợp lệ (optional)', async () => {
    const dto = plainToInstance(CreateWarehouseItemDto, { ...BASE });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('minQuantity âm → validation error', async () => {
    const dto = plainToInstance(CreateWarehouseItemDto, {
      ...BASE,
      minQuantity: -1,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'minQuantity')).toBe(true);
  });

  it('minQuantity hợp lệ (số nguyên không âm) → không lỗi', async () => {
    const dto = plainToInstance(CreateWarehouseItemDto, {
      ...BASE,
      minQuantity: 10,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
