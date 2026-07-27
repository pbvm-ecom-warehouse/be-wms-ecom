import { validateWarehouseLayoutGeometry } from './warehouse-layout.validator';

const validLayout = () => ({
  canvas: { widthM: 40, heightM: 24, gridM: 0.5 },
  rackTemplate: { widthM: 4, depthM: 1.5, levelCount: 3, bayCount: 2 },
  zones: [
    {
      id: 'zone-1',
      code: 'A',
      xM: 1,
      yM: 1,
      widthM: 18,
      heightM: 10,
      rotation: 0,
    },
  ],
  racks: [
    {
      id: 'rack-1',
      zoneId: 'zone-1',
      code: 'A1',
      xM: 3,
      yM: 3,
      rotation: 0,
    },
  ],
  aisles: [
    {
      id: 'aisle-1',
      code: 'MAIN',
      xM: 1,
      yM: 8,
      widthM: 16,
      heightM: 2,
    },
  ],
  gates: [{ id: 'gate-1', code: 'G1', xM: 0, yM: 12 }],
});

describe('validateWarehouseLayoutGeometry', () => {
  it('không trả issue cho layout hợp lệ', () => {
    expect(validateWarehouseLayoutGeometry(validLayout())).toEqual([]);
  });

  it('phát hiện rack xoay 90 độ vượt khỏi zone', () => {
    const layout = validLayout();
    layout.racks[0] = {
      ...layout.racks[0],
      xM: 18,
      yM: 8,
      rotation: 90,
    };

    expect(validateWarehouseLayoutGeometry(layout)).toContainEqual({
      entity: 'RACK',
      id: 'rack-1',
      code: 'RACK_OUTSIDE_ZONE',
    });
  });

  it('phát hiện hai rack chồng nhau', () => {
    const layout = validLayout();
    layout.racks.push({
      id: 'rack-2',
      zoneId: 'zone-1',
      code: 'A2',
      xM: 5,
      yM: 3.5,
      rotation: 0,
    });

    const issues = validateWarehouseLayoutGeometry(layout);

    expect(issues).toContainEqual({
      entity: 'RACK',
      id: 'rack-1',
      code: 'RACK_OVERLAPS_RACK',
    });
    expect(issues).toContainEqual({
      entity: 'RACK',
      id: 'rack-2',
      code: 'RACK_OVERLAPS_RACK',
    });
  });

  it('phát hiện rack chồng lên aisle', () => {
    const layout = validLayout();
    layout.aisles[0] = {
      ...layout.aisles[0],
      xM: 2,
      yM: 3,
      widthM: 8,
      heightM: 2,
    };

    expect(validateWarehouseLayoutGeometry(layout)).toContainEqual({
      entity: 'RACK',
      id: 'rack-1',
      code: 'RACK_OVERLAPS_AISLE',
    });
  });

  it('phát hiện zone, aisle và gate vượt canvas', () => {
    const layout = validLayout();
    layout.zones[0].xM = 30;
    layout.aisles[0].yM = 23;
    layout.gates[0].xM = 41;

    expect(validateWarehouseLayoutGeometry(layout)).toEqual(
      expect.arrayContaining([
        { entity: 'ZONE', id: 'zone-1', code: 'ZONE_OUTSIDE_CANVAS' },
        { entity: 'AISLE', id: 'aisle-1', code: 'AISLE_OUTSIDE_CANVAS' },
        { entity: 'GATE', id: 'gate-1', code: 'GATE_OUTSIDE_CANVAS' },
      ]),
    );
  });

  it('phát hiện canvas và rack template có kích thước không dương', () => {
    const layout = validLayout();
    layout.canvas.widthM = 0;
    layout.rackTemplate.depthM = 0;

    expect(validateWarehouseLayoutGeometry(layout)).toEqual(
      expect.arrayContaining([
        { entity: 'CANVAS', field: 'widthM', code: 'VALUE_MUST_BE_POSITIVE' },
        {
          entity: 'RACK_TEMPLATE',
          field: 'depthM',
          code: 'VALUE_MUST_BE_POSITIVE',
        },
      ]),
    );
  });
});
