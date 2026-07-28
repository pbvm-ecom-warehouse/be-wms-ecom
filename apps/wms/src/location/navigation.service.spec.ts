import {
  calculateNavigationPath,
  findNearestAisleAccessPoint,
} from './navigation.service';

const horizontalAisle = {
  id: 'main',
  xM: 0,
  yM: 4,
  widthM: 12,
  heightM: 2,
};

describe('calculateNavigationPath', () => {
  it('trả đường từ gate tới access point của rack và khoảng cách thực', () => {
    const path = calculateNavigationPath({
      aisles: [horizontalAisle],
      gates: [{ code: 'GATE-01', xM: 0, yM: 5 }],
      racks: [{ id: 'rack-1', accessPointXM: 10, accessPointYM: 5 }],
      startGateCode: 'GATE-01',
      targetRackId: 'rack-1',
    });

    expect(path).toEqual({
      startGateCode: 'GATE-01',
      targetRackId: 'rack-1',
      points: [
        { xM: 0, yM: 5 },
        { xM: 10, yM: 5 },
      ],
      distanceM: 10,
    });
  });

  it('đi qua giao điểm của hai aisle vuông góc', () => {
    const path = calculateNavigationPath({
      aisles: [
        horizontalAisle,
        { id: 'cross', xM: 7, yM: 4, widthM: 2, heightM: 10 },
      ],
      gates: [{ code: 'GATE-01', xM: 1, yM: 5 }],
      racks: [{ id: 'rack-2', accessPointXM: 8, accessPointYM: 12 }],
      startGateCode: 'GATE-01',
      targetRackId: 'rack-2',
    });

    expect(path.points).toEqual([
      { xM: 1, yM: 5 },
      { xM: 8, yM: 5 },
      { xM: 8, yM: 12 },
    ]);
    expect(path.distanceM).toBe(14);
  });

  it('nối được lối ngang chạm cạnh lối dọc dù hai đường tâm không cắt nhau', () => {
    const path = calculateNavigationPath({
      aisles: [
        { id: 'vertical', xM: 28, yM: 0, widthM: 3, heightM: 24 },
        { id: 'rack-aisle', xM: 15, yM: 4.5, widthM: 13, heightM: 1 },
      ],
      gates: [{ code: 'GATE-01', xM: 29.5, yM: 24 }],
      racks: [{ id: 'rack-6', accessPointXM: 21.5, accessPointYM: 4.5 }],
      startGateCode: 'GATE-01',
      targetRackId: 'rack-6',
    });

    expect(path.points).toEqual([
      { xM: 29.5, yM: 24 },
      { xM: 29.5, yM: 5 },
      { xM: 28, yM: 5 },
      { xM: 21.5, yM: 5 },
      { xM: 21.5, yM: 4.5 },
    ]);
    expect(path.distanceM).toBe(27.5);
  });

  it('nối được hai aisle cùng phương chồng một phần', () => {
    const path = calculateNavigationPath({
      aisles: [
        { id: 'main', xM: 0, yM: 4, widthM: 10, heightM: 2 },
        { id: 'rack-aisle', xM: 8, yM: 4, widthM: 10, heightM: 2 },
      ],
      gates: [{ code: 'GATE-01', xM: 1, yM: 5 }],
      racks: [{ id: 'rack-overlap', accessPointXM: 17, accessPointYM: 5 }],
      startGateCode: 'GATE-01',
      targetRackId: 'rack-overlap',
    });

    expect(path.points).toEqual([
      { xM: 1, yM: 5 },
      { xM: 8, yM: 5 },
      { xM: 17, yM: 5 },
    ]);
    expect(path.distanceM).toBe(16);
  });

  it('nối được hai aisle cùng phương chạm đầu', () => {
    const path = calculateNavigationPath({
      aisles: [
        { id: 'left', xM: 0, yM: 4, widthM: 8, heightM: 2 },
        { id: 'right', xM: 8, yM: 4, widthM: 8, heightM: 2 },
      ],
      gates: [{ code: 'GATE-01', xM: 1, yM: 5 }],
      racks: [{ id: 'rack-touch', accessPointXM: 15, accessPointYM: 5 }],
      startGateCode: 'GATE-01',
      targetRackId: 'rack-touch',
    });

    expect(path.points).toEqual([
      { xM: 1, yM: 5 },
      { xM: 8, yM: 5 },
      { xM: 15, yM: 5 },
    ]);
    expect(path.distanceM).toBe(14);
  });

  it('chọn aisle giữa rack khi khoảng cách bằng đường chính', () => {
    expect(
      findNearestAisleAccessPoint({ xM: 8, yM: 8, widthM: 2, heightM: 2 }, [
        {
          id: 'main',
          type: 'MAIN',
          xM: 4,
          yM: 8,
          widthM: 2,
          heightM: 2,
        },
        {
          id: 'rack',
          type: 'RACK',
          xM: 12,
          yM: 8,
          widthM: 2,
          heightM: 2,
        },
      ]),
    ).toEqual({ xM: 12, yM: 9 });
  });
  it('chặn rack có access point không nối aisle', () => {
    expect(() =>
      calculateNavigationPath({
        aisles: [horizontalAisle],
        gates: [{ code: 'GATE-01', xM: 0, yM: 5 }],
        racks: [{ id: 'rack-1', accessPointXM: 30, accessPointYM: 20 }],
        startGateCode: 'GATE-01',
        targetRackId: 'rack-1',
      }),
    ).toThrow(
      expect.objectContaining({ code: 'NAVIGATION_RACK_NOT_CONNECTED' }),
    );
  });

  it('báo không có đường khi gate và rack nằm trên hai aisle tách rời', () => {
    expect(() =>
      calculateNavigationPath({
        aisles: [
          horizontalAisle,
          { id: 'isolated', xM: 20, yM: 10, widthM: 10, heightM: 2 },
        ],
        gates: [{ code: 'GATE-01', xM: 1, yM: 5 }],
        racks: [{ id: 'rack-3', accessPointXM: 25, accessPointYM: 11 }],
        startGateCode: 'GATE-01',
        targetRackId: 'rack-3',
      }),
    ).toThrow(expect.objectContaining({ code: 'NAVIGATION_PATH_NOT_FOUND' }));
  });
});
