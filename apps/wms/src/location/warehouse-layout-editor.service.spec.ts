import 'reflect-metadata';
import { Types } from 'mongoose';
import {
  LayoutEntity,
  LayoutOperation,
  type SaveWarehouseLayoutDto,
} from './dto/layout-change.dto';
import { WarehouseLayoutEditorService } from './warehouse-layout-editor.service';

const actorId = new Types.ObjectId().toString();
const zoneId = new Types.ObjectId();
const rackId = new Types.ObjectId();
const shelfId = new Types.ObjectId();
const session = {} as never;

const makeRepo = () => ({
  runInTransaction: jest.fn(
    async (work: (session: never) => Promise<unknown>) => work(session),
  ),
  getLayoutConfig: jest.fn(),
  getRackTemplate: jest.fn(),
  findZoneByCode: jest.fn(),
  findZoneById: jest.fn(),
  createZone: jest.fn(),
  findRackByCode: jest.fn(),
  findRackById: jest.fn(),
  createRack: jest.fn(),
  findShelfByCode: jest.fn(),
  findShelfById: jest.fn(),
  createShelf: jest.fn(),
  findAisleByCode: jest.fn(),
  createAisle: jest.fn(),
  findGateByCode: jest.fn(),
  createGate: jest.fn(),
  updateLayoutConfig: jest.fn(),
  updateRackTemplate: jest.fn(),
  updateZone: jest.fn(),
  updateRack: jest.fn(),
  updateShelf: jest.fn(),
  updateAisle: jest.fn(),
  updateGate: jest.fn(),
  hasRacksInZone: jest.fn(),
  hasShelvesInRack: jest.fn(),
  softDeleteZone: jest.fn(),
  softDeleteRack: jest.fn(),
  softDeleteShelf: jest.fn(),
  softDeleteAisle: jest.fn(),
  softDeleteGate: jest.fn(),
  findAllZones: jest.fn(),
  findAllRacks: jest.fn(),
  findAllShelves: jest.fn(),
  findAllAisles: jest.fn(),
  findAllGates: jest.fn(),
  incrementLayoutRevision: jest.fn(),
});

const makeStockRepo = () => ({
  hasPositiveInventoryOnShelf: jest.fn(),
});

describe('WarehouseLayoutEditorService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let stockRepo: ReturnType<typeof makeStockRepo>;
  let service: WarehouseLayoutEditorService;

  beforeEach(() => {
    repo = makeRepo();
    stockRepo = makeStockRepo();
    service = new WarehouseLayoutEditorService(
      repo as never,
      stockRepo as never,
    );
  });

  it('trả 409 khi expectedRevision không còn hiện hành', async () => {
    repo.getLayoutConfig.mockResolvedValue({ revision: 9 });

    await expect(
      service.saveLayout(
        {
          expectedRevision: 8,
          operations: [
            {
              op: LayoutOperation.UPDATE,
              entity: LayoutEntity.CANVAS,
              patch: { widthM: 50 },
            },
          ],
        },
        actorId,
      ),
    ).rejects.toMatchObject({
      code: 'LAYOUT_REVISION_CONFLICT',
      details: { expectedRevision: 8, currentRevision: 9 },
    });
    expect(repo.updateLayoutConfig).not.toHaveBeenCalled();
    expect(repo.incrementLayoutRevision).not.toHaveBeenCalled();
  });

  it('resolve temp id khi tạo Zone → Rack → Shelf và chỉ tăng revision một lần', async () => {
    const zoneClientId = 'tmp:550e8400-e29b-41d4-a716-446655440000';
    const rackClientId = 'tmp:550e8400-e29b-41d4-a716-446655440001';
    const shelfClientId = 'tmp:550e8400-e29b-41d4-a716-446655440002';
    const zone = {
      _id: zoneId,
      code: 'A',
      name: 'Khu A',
      xM: 1,
      yM: 1,
      widthM: 18,
      heightM: 10,
      rotation: 0,
    };
    const rack = {
      _id: rackId,
      zoneId,
      code: 'A1',
      name: 'Kệ A1',
      xM: 3,
      yM: 3,
      rotation: 0,
    };
    const shelf = {
      _id: shelfId,
      rackId,
      code: 'A1-L1',
      level: 1,
      isStaging: false,
    };
    repo.getLayoutConfig.mockResolvedValue({
      revision: 4,
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
      updatedAt: new Date('2026-07-27T09:00:00Z'),
    });
    repo.getRackTemplate.mockResolvedValue({
      widthM: 4,
      depthM: 1.5,
      levelCount: 3,
      bayCount: 2,
    });
    repo.findZoneByCode.mockResolvedValue(null);
    repo.createZone.mockResolvedValue(zone);
    repo.findZoneById.mockResolvedValue(zone);
    repo.findRackByCode.mockResolvedValue(null);
    repo.createRack.mockResolvedValue(rack);
    repo.findRackById.mockResolvedValue(rack);
    repo.findShelfByCode.mockResolvedValue(null);
    repo.createShelf.mockResolvedValue(shelf);
    repo.findAllZones.mockResolvedValue([zone]);
    repo.findAllRacks.mockResolvedValue([rack]);
    repo.findAllShelves.mockResolvedValue([shelf]);
    repo.findAllAisles.mockResolvedValue([]);
    repo.findAllGates.mockResolvedValue([]);
    repo.incrementLayoutRevision.mockResolvedValue({
      revision: 5,
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
      updatedAt: new Date('2026-07-27T10:00:00Z'),
    });

    const dto: SaveWarehouseLayoutDto = {
      expectedRevision: 4,
      operations: [
        {
          op: LayoutOperation.CREATE,
          entity: LayoutEntity.ZONE,
          clientId: zoneClientId,
          data: {
            code: 'A',
            name: 'Khu A',
            xM: 1,
            yM: 1,
            widthM: 18,
            heightM: 10,
            rotation: 0,
          },
        },
        {
          op: LayoutOperation.CREATE,
          entity: LayoutEntity.RACK,
          clientId: rackClientId,
          data: {
            zoneId: zoneClientId,
            code: 'A1',
            name: 'Kệ A1',
            xM: 3,
            yM: 3,
            rotation: 0,
          },
        },
        {
          op: LayoutOperation.CREATE,
          entity: LayoutEntity.SHELF,
          clientId: shelfClientId,
          data: {
            rackId: rackClientId,
            code: 'A1-L1',
            level: 1,
          },
        },
      ],
    };

    const result = await service.saveLayout(dto, actorId);

    expect(repo.createRack).toHaveBeenCalledWith(
      expect.objectContaining({ zoneId: zoneId.toString() }),
      actorId,
      session,
    );
    expect(repo.createShelf).toHaveBeenCalledWith(
      expect.objectContaining({ rackId: rackId.toString() }),
      actorId,
      session,
    );
    expect(repo.incrementLayoutRevision).toHaveBeenCalledTimes(1);
    expect(result.idMap).toEqual({
      [zoneClientId]: zoneId.toString(),
      [rackClientId]: rackId.toString(),
      [shelfClientId]: shelfId.toString(),
    });
    expect(result.layout.revision).toBe(5);
    expect(result.layout.shelves).toEqual([shelf]);
  });

  it('ném lỗi giữa change-set nên không tăng revision', async () => {
    const zoneClientId = 'tmp:550e8400-e29b-41d4-a716-446655440010';
    repo.getLayoutConfig.mockResolvedValue({ revision: 3 });
    repo.findZoneByCode.mockResolvedValue(null);
    repo.createZone.mockResolvedValue({ _id: zoneId });

    await expect(
      service.saveLayout(
        {
          expectedRevision: 3,
          operations: [
            {
              op: LayoutOperation.CREATE,
              entity: LayoutEntity.ZONE,
              clientId: zoneClientId,
              data: {
                code: 'A',
                name: 'Khu A',
                widthM: 10,
                heightM: 10,
              },
            },
            {
              op: LayoutOperation.CREATE,
              entity: LayoutEntity.RACK,
              clientId: 'tmp:550e8400-e29b-41d4-a716-446655440011',
              data: {
                zoneId: 'tmp:550e8400-e29b-41d4-a716-446655440099',
                code: 'A1',
                name: 'Kệ A1',
              },
            },
          ],
        },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'LAYOUT_INVALID_REFERENCE' });

    expect(repo.createZone).toHaveBeenCalledTimes(1);
    expect(repo.incrementLayoutRevision).not.toHaveBeenCalled();
  });

  it('từ chối field audit ngoài whitelist để chống mass assignment', async () => {
    repo.getLayoutConfig.mockResolvedValue({ revision: 1 });
    repo.findZoneByCode.mockResolvedValue(null);

    await expect(
      service.saveLayout(
        {
          expectedRevision: 1,
          operations: [
            {
              op: LayoutOperation.CREATE,
              entity: LayoutEntity.ZONE,
              clientId: 'tmp:550e8400-e29b-41d4-a716-446655440020',
              data: {
                code: 'A',
                name: 'Khu A',
                createdBy: new Types.ObjectId().toString(),
              },
            },
          ],
        },
        actorId,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({ entity: LayoutEntity.ZONE }),
        ]),
      },
    });

    expect(repo.createZone).not.toHaveBeenCalled();
    expect(repo.incrementLayoutRevision).not.toHaveBeenCalled();
  });

  it('kiểm tra code hiệu lực khi chỉ chuyển rack sang zone khác', async () => {
    const destinationZoneId = new Types.ObjectId();
    const duplicateRackId = new Types.ObjectId();
    repo.getLayoutConfig.mockResolvedValue({ revision: 3 });
    repo.findRackById.mockResolvedValue({
      _id: rackId,
      zoneId,
      code: 'A1',
    });
    repo.findZoneById.mockResolvedValue({ _id: destinationZoneId });
    repo.findRackByCode.mockResolvedValue({
      _id: duplicateRackId,
      zoneId: destinationZoneId,
      code: 'A1',
    });

    await expect(
      service.saveLayout(
        {
          expectedRevision: 3,
          operations: [
            {
              op: LayoutOperation.UPDATE,
              entity: LayoutEntity.RACK,
              id: rackId.toString(),
              patch: { zoneId: destinationZoneId.toString() },
            },
          ],
        },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'RACK_CODE_EXISTS' });

    expect(repo.findRackByCode).toHaveBeenCalledWith(
      destinationZoneId.toString(),
      'A1',
      session,
    );
    expect(repo.updateRack).not.toHaveBeenCalled();
  });

  it('map duplicate-key race khi cập nhật rack thành RACK_CODE_EXISTS', async () => {
    const destinationZoneId = new Types.ObjectId();
    repo.getLayoutConfig.mockResolvedValue({ revision: 3 });
    repo.findRackById.mockResolvedValue({
      _id: rackId,
      zoneId,
      code: 'A1',
    });
    repo.findZoneById.mockResolvedValue({ _id: destinationZoneId });
    repo.findRackByCode.mockResolvedValue(null);
    repo.updateRack.mockRejectedValue({ code: 11000 });

    await expect(
      service.saveLayout(
        {
          expectedRevision: 3,
          operations: [
            {
              op: LayoutOperation.UPDATE,
              entity: LayoutEntity.RACK,
              id: rackId.toString(),
              patch: { zoneId: destinationZoneId.toString() },
            },
          ],
        },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'RACK_CODE_EXISTS' });
  });

  it('map lỗi geometry của entity vừa tạo về clientId và không lộ ObjectId tạm thời phía server', async () => {
    const zoneClientId = 'tmp:550e8400-e29b-41d4-a716-446655440030';
    const createdZone = {
      _id: zoneId,
      code: 'OUTSIDE',
      name: 'Ngoài canvas',
      xM: 39,
      yM: 1,
      widthM: 5,
      heightM: 5,
      rotation: 0,
    };
    repo.getLayoutConfig.mockResolvedValue({
      revision: 2,
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
    });
    repo.getRackTemplate.mockResolvedValue({
      widthM: 4,
      depthM: 1.5,
      levelCount: 3,
      bayCount: 2,
    });
    repo.findZoneByCode.mockResolvedValue(null);
    repo.createZone.mockResolvedValue(createdZone);
    repo.findAllZones.mockResolvedValue([createdZone]);
    repo.findAllRacks.mockResolvedValue([]);
    repo.findAllShelves.mockResolvedValue([]);
    repo.findAllAisles.mockResolvedValue([]);
    repo.findAllGates.mockResolvedValue([]);

    let thrown: unknown;
    try {
      await service.saveLayout(
        {
          expectedRevision: 2,
          operations: [
            {
              op: LayoutOperation.CREATE,
              entity: LayoutEntity.ZONE,
              clientId: zoneClientId,
              data: {
                code: 'OUTSIDE',
                name: 'Ngoài canvas',
                xM: 39,
                yM: 1,
                widthM: 5,
                heightM: 5,
              },
            },
          ],
        },
        actorId,
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: 'LAYOUT_VALIDATION_FAILED',
      details: {
        issues: [
          {
            entity: LayoutEntity.ZONE,
            clientId: zoneClientId,
            code: 'ZONE_OUTSIDE_CANVAS',
          },
        ],
      },
    });
    const issue = (
      thrown as { details: { issues: Array<Record<string, unknown>> } }
    ).details.issues[0];
    expect(issue).not.toHaveProperty('id');
    expect(repo.incrementLayoutRevision).not.toHaveBeenCalled();
  });

  it('chặn batch đổi staging shelf thành thường rồi xóa dựa trên trạng thái đầu request', async () => {
    let isStaging = true;
    repo.getLayoutConfig.mockResolvedValue({
      revision: 5,
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
    });
    repo.findShelfById.mockImplementation(() =>
      Promise.resolve({ _id: shelfId, rackId, isStaging }),
    );
    repo.updateShelf.mockImplementation(() => {
      isStaging = false;
      return Promise.resolve({ _id: shelfId, rackId, isStaging });
    });
    repo.softDeleteShelf.mockResolvedValue(true);
    stockRepo.hasPositiveInventoryOnShelf.mockResolvedValue(false);
    repo.getRackTemplate.mockResolvedValue({
      widthM: 4,
      depthM: 1.5,
      levelCount: 3,
      bayCount: 2,
    });
    repo.findAllZones.mockResolvedValue([]);
    repo.findAllRacks.mockResolvedValue([]);
    repo.findAllShelves.mockResolvedValue([]);
    repo.findAllAisles.mockResolvedValue([]);
    repo.findAllGates.mockResolvedValue([]);
    repo.incrementLayoutRevision.mockResolvedValue({
      revision: 6,
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
      updatedAt: new Date(),
    });

    await expect(
      service.saveLayout(
        {
          expectedRevision: 5,
          operations: [
            {
              op: LayoutOperation.UPDATE,
              entity: LayoutEntity.SHELF,
              id: shelfId.toString(),
              patch: { isStaging: false },
            },
            {
              op: LayoutOperation.DELETE,
              entity: LayoutEntity.SHELF,
              id: shelfId.toString(),
            },
          ],
        },
        actorId,
      ),
    ).rejects.toMatchObject({ code: 'STAGING_SHELF_CANNOT_DELETE' });

    expect(repo.updateShelf).not.toHaveBeenCalled();
    expect(repo.softDeleteShelf).not.toHaveBeenCalled();
    expect(repo.incrementLayoutRevision).not.toHaveBeenCalled();
  });

  it('đọc final snapshot tuần tự trên cùng transaction session', async () => {
    const config = {
      revision: 7,
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
      updatedAt: new Date(),
    };
    const rackTemplate = {
      widthM: 4,
      depthM: 1.5,
      levelCount: 3,
      bayCount: 2,
    };
    let activeReads = 0;
    let maxActiveReads = 0;
    const observedSessions: unknown[] = [];
    const guardedRead =
      <T>(value: T) =>
      async (activeSession: unknown): Promise<T> => {
        observedSessions.push(activeSession);
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        await Promise.resolve();
        activeReads -= 1;
        return value;
      };

    repo.getLayoutConfig
      .mockResolvedValueOnce(config)
      .mockImplementation(guardedRead(config));
    repo.updateLayoutConfig.mockResolvedValue(config);
    repo.getRackTemplate.mockImplementation(guardedRead(rackTemplate));
    repo.findAllZones.mockImplementation(guardedRead([]));
    repo.findAllRacks.mockImplementation(guardedRead([]));
    repo.findAllShelves.mockImplementation(guardedRead([]));
    repo.findAllAisles.mockImplementation(guardedRead([]));
    repo.findAllGates.mockImplementation(guardedRead([]));
    repo.incrementLayoutRevision.mockResolvedValue({
      ...config,
      revision: 8,
    });

    await service.saveLayout(
      {
        expectedRevision: 7,
        operations: [
          {
            op: LayoutOperation.UPDATE,
            entity: LayoutEntity.CANVAS,
            patch: { gridM: 1 },
          },
        ],
      },
      actorId,
    );

    expect(maxActiveReads).toBe(1);
    expect(observedSessions).toEqual(Array(7).fill(session));
  });
  it('cho phép patch một phần rack template và lưu canonical template đầy đủ', async () => {
    const currentTemplate = {
      widthM: 4,
      depthM: 1.5,
      levelCount: 3,
      bayCount: 2,
    };
    repo.getLayoutConfig.mockResolvedValue({
      revision: 6,
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
    });
    repo.getRackTemplate.mockResolvedValue(currentTemplate);
    repo.updateRackTemplate.mockResolvedValue({
      ...currentTemplate,
      widthM: 5,
    });
    repo.findAllZones.mockResolvedValue([]);
    repo.findAllRacks.mockResolvedValue([]);
    repo.findAllShelves.mockResolvedValue([]);
    repo.findAllAisles.mockResolvedValue([]);
    repo.findAllGates.mockResolvedValue([]);
    repo.incrementLayoutRevision.mockResolvedValue({
      revision: 7,
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
      updatedAt: new Date(),
    });

    await service.saveLayout(
      {
        expectedRevision: 6,
        operations: [
          {
            op: LayoutOperation.UPDATE,
            entity: LayoutEntity.RACK_TEMPLATE,
            patch: { widthM: 5 },
          },
        ],
      },
      actorId,
    );

    expect(repo.updateRackTemplate).toHaveBeenCalledWith(
      { ...currentTemplate, widthM: 5 },
      actorId,
      session,
    );
  });
  it('không tăng revision khi final geometry không hợp lệ', async () => {
    repo.getLayoutConfig.mockResolvedValue({
      revision: 2,
      widthM: 40,
      heightM: 24,
      gridM: 0.5,
    });
    repo.getRackTemplate.mockResolvedValue({
      widthM: 4,
      depthM: 1.5,
      levelCount: 3,
      bayCount: 2,
    });
    repo.findAllZones.mockResolvedValue([
      {
        _id: zoneId,
        xM: 1,
        yM: 1,
        widthM: 5,
        heightM: 5,
        rotation: 0,
      },
    ]);
    repo.findAllRacks.mockResolvedValue([
      {
        _id: rackId,
        zoneId,
        xM: 5,
        yM: 5,
        rotation: 0,
      },
    ]);
    repo.findAllShelves.mockResolvedValue([]);
    repo.findAllAisles.mockResolvedValue([]);
    repo.findAllGates.mockResolvedValue([]);

    await expect(
      service.saveLayout(
        {
          expectedRevision: 2,
          operations: [
            {
              op: LayoutOperation.UPDATE,
              entity: LayoutEntity.CANVAS,
              patch: { gridM: 1 },
            },
          ],
        },
        actorId,
      ),
    ).rejects.toMatchObject({
      code: 'LAYOUT_VALIDATION_FAILED',
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({ code: 'RACK_OUTSIDE_ZONE' }),
        ]),
      },
    });
    expect(repo.incrementLayoutRevision).not.toHaveBeenCalled();
  });
});
