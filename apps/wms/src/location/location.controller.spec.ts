import 'reflect-metadata';
import { Types } from 'mongoose';
import {
  LayoutEntity,
  LayoutOperation,
  type SaveWarehouseLayoutDto,
} from './dto/layout-change.dto';
import { LocationController } from './location.controller';

const doc = (value: Record<string, unknown>) => ({
  ...value,
  toObject: () => value,
});

describe('LocationController layout endpoints', () => {
  const actorId = new Types.ObjectId().toString();
  const locationService = {
    getLayout: jest.fn(),
  };
  const editorService = {
    saveLayout: jest.fn(),
  };
  let controller: LocationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new LocationController(
      locationService as never,
      editorService as never,
    );
  });

  it('GET layout trả metadata, canvas và shelves', async () => {
    locationService.getLayout.mockResolvedValue({
      id: 'single-warehouse-layout',
      revision: 4,
      updatedAt: new Date('2026-07-27T10:00:00Z'),
      canvas: { widthM: 40, heightM: 24, gridM: 0.5 },
      zones: [],
      racks: [],
      shelves: [
        doc({
          _id: new Types.ObjectId(),
          rackId: new Types.ObjectId(),
          code: 'A1-L1',
          level: 1,
        }),
      ],
      aisles: [],
      gates: [],
      rackTemplate: doc({
        widthM: 4,
        depthM: 1.5,
        levelCount: 3,
        bayCount: 2,
      }),
    });

    const result = await controller.getLayout();

    expect(result.revision).toBe(4);
    expect(result.canvas).toMatchObject({
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
    });
    expect(result.shelves).toHaveLength(1);
  });

  it('PATCH layout chuyển actor và change-set sang editor service', async () => {
    const dto: SaveWarehouseLayoutDto = {
      expectedRevision: 4,
      operations: [
        {
          op: LayoutOperation.UPDATE,
          entity: LayoutEntity.CANVAS,
          patch: { widthM: 50 },
        },
      ],
    };
    editorService.saveLayout.mockResolvedValue({
      revision: 5,
      idMap: {},
      layout: {
        id: 'single-warehouse-layout',
        revision: 5,
        updatedAt: new Date('2026-07-27T10:01:00Z'),
        canvas: { widthM: 50, heightM: 24, gridM: 0.5 },
        zones: [],
        racks: [],
        shelves: [],
        aisles: [],
        gates: [],
        rackTemplate: doc({
          widthM: 4,
          depthM: 1.5,
          levelCount: 3,
          bayCount: 2,
        }),
      },
    });

    const result = await controller.saveLayout(dto, actorId);

    expect(editorService.saveLayout).toHaveBeenCalledWith(dto, actorId);
    expect(result).toMatchObject({ revision: 5, idMap: {} });
    expect(result.layout.canvas.widthM).toBe(50);
  });

  it('POST layout/reset chuyển actor sang location service và trả snapshot mới', async () => {
    locationService.resetLayout = jest.fn().mockResolvedValue({
      id: 'single-warehouse-layout',
      revision: 2,
      updatedAt: new Date('2026-07-27T11:00:00Z'),
      canvas: { widthM: 40, heightM: 24, gridM: 0.5 },
      zones: [],
      racks: [],
      shelves: [],
      aisles: [],
      gates: [],
      rackTemplate: doc({
        widthM: 10,
        depthM: 1.5,
        heightM: 1,
        levelCount: 1,
        bayCount: 1,
      }),
    });

    const result = await controller.resetLayout(
      { expectedRevision: 1 },
      actorId,
    );

    expect(locationService.resetLayout).toHaveBeenCalledWith(1, actorId);
    expect(result).toMatchObject({
      revision: 2,
      canvas: { widthM: 40, heightM: 24, gridM: 0.5 },
      shelves: [],
    });
  });
});
