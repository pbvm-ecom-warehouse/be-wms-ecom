import 'reflect-metadata';
import { instanceToPlain, plainToInstance } from 'class-transformer';
import { LayoutResponseDto } from './layout.dto';

describe('LayoutResponseDto', () => {
  it('expose snapshot metadata, canvas và shelves cho editor', () => {
    const dto = plainToInstance(
      LayoutResponseDto,
      {
        id: 'single-warehouse-layout',
        revision: 3,
        updatedAt: new Date('2026-07-27T10:00:00Z'),
        canvas: { widthM: 40, heightM: 24, gridM: 0.5 },
        zones: [],
        racks: [],
        shelves: [{ id: 's1', code: 'A1-L1', rackId: 'r1', level: 1 }],
        aisles: [],
        gates: [],
        rackTemplate: { widthM: 4, depthM: 1.5, levelCount: 3, bayCount: 2 },
      },
      { excludeExtraneousValues: true },
    );

    expect(instanceToPlain(dto)).toEqual(
      expect.objectContaining({
        id: 'single-warehouse-layout',
        revision: 3,
        canvas: { widthM: 40, heightM: 24, gridM: 0.5 },
        shelves: [expect.objectContaining({ code: 'A1-L1' })],
      }),
    );
  });
});
