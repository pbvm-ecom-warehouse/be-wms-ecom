import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  LayoutEntity,
  LayoutOperation,
  SaveWarehouseLayoutDto,
} from './layout-change.dto';

async function errorsFor(input: unknown) {
  return validate(plainToInstance(SaveWarehouseLayoutDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('SaveWarehouseLayoutDto', () => {
  it('chấp nhận CREATE zone với clientId tạm hợp lệ', async () => {
    await expect(
      errorsFor({
        expectedRevision: 2,
        operations: [
          {
            op: LayoutOperation.CREATE,
            entity: LayoutEntity.ZONE,
            clientId: 'tmp:550e8400-e29b-41d4-a716-446655440000',
            data: { code: 'A', name: 'Khu A' },
          },
        ],
      }),
    ).resolves.toEqual([]);
  });

  it('chấp nhận UUID v7 trong clientId tạm', async () => {
    await expect(
      errorsFor({
        expectedRevision: 2,
        operations: [
          {
            op: LayoutOperation.CREATE,
            entity: LayoutEntity.ZONE,
            clientId: 'tmp:018f6f9e-7b2d-7a31-8e6f-123456789abc',
            data: { code: 'A', name: 'Khu A' },
          },
        ],
      }),
    ).resolves.toEqual([]);
  });
  it('từ chối revision nhỏ hơn 1 và operations rỗng', async () => {
    const errors = await errorsFor({ expectedRevision: 0, operations: [] });

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['expectedRevision', 'operations']),
    );
  });

  it('từ chối clientId CREATE không dùng namespace tmp', async () => {
    const errors = await errorsFor({
      expectedRevision: 1,
      operations: [
        {
          op: LayoutOperation.CREATE,
          entity: LayoutEntity.RACK,
          clientId: 'rack-local-1',
          data: { code: 'A1', name: 'Kệ A1', zoneId: 'zone-1' },
        },
      ],
    });

    expect(
      errors[0]?.children?.[0]?.children?.map((child) => child.property),
    ).toContain('clientId');
  });
});
