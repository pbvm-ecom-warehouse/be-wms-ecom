import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common/errors/app.exception';
import { LocationRepository } from './location.repository';

export interface NavigationPoint {
  xM: number;
  yM: number;
}

export interface NavigationPath {
  startGateCode: string;
  targetRackId: string;
  points: NavigationPoint[];
  distanceM: number;
}

export interface AisleGeometry {
  id: string;
  type?: 'MAIN' | 'RACK';
  xM: number;
  yM: number;
  widthM: number;
  heightM: number;
}

interface GateGeometry extends NavigationPoint {
  code: string;
}

interface RackGeometry {
  id: string;
  accessPointXM: number;
  accessPointYM: number;
}

interface CenterLine {
  id: string;
  orientation: 'H' | 'V';
  min: number;
  max: number;
  fixed: number;
  rect: AisleGeometry;
  points: NavigationPoint[];
}

type Edge = { to: string; distance: number };

const EPSILON = 0.001;
const CONNECTION_TOLERANCE_M = 0.35;

export function findNearestAisleAccessPoint(
  rack: { xM: number; yM: number; widthM: number; heightM: number },
  aisles: AisleGeometry[],
): NavigationPoint | null {
  const center = {
    xM: rack.xM + rack.widthM / 2,
    yM: rack.yM + rack.heightM / 2,
  };
  const candidates = aisles.map((aisle) => {
    const point = {
      xM: Math.min(Math.max(center.xM, aisle.xM), aisle.xM + aisle.widthM),
      yM: Math.min(Math.max(center.yM, aisle.yM), aisle.yM + aisle.heightM),
    };
    const deltaX = Math.max(
      aisle.xM - (rack.xM + rack.widthM),
      rack.xM - (aisle.xM + aisle.widthM),
      0,
    );
    const deltaY = Math.max(
      aisle.yM - (rack.yM + rack.heightM),
      rack.yM - (aisle.yM + aisle.heightM),
      0,
    );
    return {
      point,
      distance: Math.hypot(deltaX, deltaY),
      priority: aisle.type === 'RACK' ? 0 : 1,
    };
  });
  candidates.sort(
    (left, right) =>
      left.distance - right.distance || left.priority - right.priority,
  );
  return candidates[0]?.point ?? null;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pointKey(point: NavigationPoint): string {
  return `${round(point.xM)}:${round(point.yM)}`;
}

function distance(left: NavigationPoint, right: NavigationPoint): number {
  return Math.hypot(left.xM - right.xM, left.yM - right.yM);
}

function appendUnique(points: NavigationPoint[], point: NavigationPoint): void {
  if (!points.some((item) => distance(item, point) < EPSILON)) {
    points.push({ xM: round(point.xM), yM: round(point.yM) });
  }
}

function toCenterLine(aisle: AisleGeometry): CenterLine {
  const horizontal = aisle.widthM >= aisle.heightM;
  return horizontal
    ? {
        id: aisle.id,
        orientation: 'H',
        min: aisle.xM,
        max: aisle.xM + aisle.widthM,
        fixed: aisle.yM + aisle.heightM / 2,
        rect: aisle,
        points: [
          { xM: aisle.xM, yM: aisle.yM + aisle.heightM / 2 },
          {
            xM: aisle.xM + aisle.widthM,
            yM: aisle.yM + aisle.heightM / 2,
          },
        ],
      }
    : {
        id: aisle.id,
        orientation: 'V',
        min: aisle.yM,
        max: aisle.yM + aisle.heightM,
        fixed: aisle.xM + aisle.widthM / 2,
        rect: aisle,
        points: [
          { xM: aisle.xM + aisle.widthM / 2, yM: aisle.yM },
          {
            xM: aisle.xM + aisle.widthM / 2,
            yM: aisle.yM + aisle.heightM,
          },
        ],
      };
}

function containsPoint(
  aisle: AisleGeometry,
  point: NavigationPoint,
  tolerance = CONNECTION_TOLERANCE_M,
): boolean {
  return (
    point.xM >= aisle.xM - tolerance &&
    point.xM <= aisle.xM + aisle.widthM + tolerance &&
    point.yM >= aisle.yM - tolerance &&
    point.yM <= aisle.yM + aisle.heightM + tolerance
  );
}

function project(line: CenterLine, point: NavigationPoint): NavigationPoint {
  return line.orientation === 'H'
    ? {
        xM: Math.max(line.min, Math.min(line.max, point.xM)),
        yM: line.fixed,
      }
    : {
        xM: line.fixed,
        yM: Math.max(line.min, Math.min(line.max, point.yM)),
      };
}

function intersection(
  left: CenterLine,
  right: CenterLine,
): NavigationPoint | null {
  if (left.orientation === right.orientation) return null;
  const horizontal = left.orientation === 'H' ? left : right;
  const vertical = left.orientation === 'V' ? left : right;
  if (
    vertical.fixed < horizontal.min - EPSILON ||
    vertical.fixed > horizontal.max + EPSILON ||
    horizontal.fixed < vertical.min - EPSILON ||
    horizontal.fixed > vertical.max + EPSILON
  ) {
    return null;
  }
  return { xM: vertical.fixed, yM: horizontal.fixed };
}

function rectanglesTouchOrOverlap(
  left: AisleGeometry,
  right: AisleGeometry,
): boolean {
  return (
    left.xM <= right.xM + right.widthM + EPSILON &&
    left.xM + left.widthM + EPSILON >= right.xM &&
    left.yM <= right.yM + right.heightM + EPSILON &&
    left.yM + left.heightM + EPSILON >= right.yM
  );
}

function aisleBridge(
  left: CenterLine,
  right: CenterLine,
): { left: NavigationPoint; right: NavigationPoint } | null {
  if (!rectanglesTouchOrOverlap(left.rect, right.rect)) return null;
  if (left.orientation === right.orientation) {
    const sharedAxisStart = Math.max(left.min, right.min);
    const sharedAxisEnd = Math.min(left.max, right.max);
    if (sharedAxisStart > sharedAxisEnd + EPSILON) return null;
    const sharedAxis = sharedAxisStart;
    return left.orientation === 'H'
      ? {
          left: { xM: sharedAxis, yM: left.fixed },
          right: { xM: sharedAxis, yM: right.fixed },
        }
      : {
          left: { xM: left.fixed, yM: sharedAxis },
          right: { xM: right.fixed, yM: sharedAxis },
        };
  }
  const horizontal = left.orientation === 'H' ? left : right;
  const vertical = left.orientation === 'V' ? left : right;
  const horizontalPoint = {
    xM: Math.max(horizontal.min, Math.min(horizontal.max, vertical.fixed)),
    yM: horizontal.fixed,
  };
  const verticalPoint = {
    xM: vertical.fixed,
    yM: Math.max(vertical.min, Math.min(vertical.max, horizontal.fixed)),
  };
  return left.orientation === 'H'
    ? { left: horizontalPoint, right: verticalPoint }
    : { left: verticalPoint, right: horizontalPoint };
}

function connect(
  graph: Map<string, Edge[]>,
  left: NavigationPoint,
  right: NavigationPoint,
): void {
  const leftKey = pointKey(left);
  const rightKey = pointKey(right);
  const weight = distance(left, right);
  if (weight < EPSILON) return;
  graph.set(leftKey, [
    ...(graph.get(leftKey) ?? []),
    { to: rightKey, distance: weight },
  ]);
  graph.set(rightKey, [
    ...(graph.get(rightKey) ?? []),
    { to: leftKey, distance: weight },
  ]);
}

function shortestPath(
  graph: Map<string, Edge[]>,
  start: string,
  target: string,
): string[] | null {
  const distances = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const unvisited = new Set(graph.keys());
  unvisited.add(start);
  unvisited.add(target);

  while (unvisited.size > 0) {
    let current: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const node of unvisited) {
      const candidate = distances.get(node) ?? Number.POSITIVE_INFINITY;
      if (candidate < currentDistance) {
        current = node;
        currentDistance = candidate;
      }
    }
    if (!current || !Number.isFinite(currentDistance)) break;
    if (current === target) break;
    unvisited.delete(current);
    for (const edge of graph.get(current) ?? []) {
      const nextDistance = currentDistance + edge.distance;
      if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, current);
      }
    }
  }

  if (!distances.has(target)) return null;
  const result = [target];
  let cursor = target;
  while (cursor !== start) {
    const parent = previous.get(cursor);
    if (!parent) return null;
    result.unshift(parent);
    cursor = parent;
  }
  return result;
}

export function calculateNavigationPath(input: {
  aisles: AisleGeometry[];
  gates: GateGeometry[];
  racks: RackGeometry[];
  startGateCode: string;
  targetRackId: string;
}): NavigationPath {
  const gate = input.gates.find((item) => item.code === input.startGateCode);
  if (!gate) throw new AppException('NAVIGATION_GATE_NOT_FOUND');
  const rack = input.racks.find((item) => item.id === input.targetRackId);
  if (!rack) throw new AppException('NAVIGATION_RACK_NOT_FOUND');

  const lines = input.aisles.map(toCenterLine);
  const gateLine = lines.find((line) => containsPoint(line.rect, gate));
  if (!gateLine) throw new AppException('NAVIGATION_GATE_NOT_CONNECTED');
  const rackPoint = {
    xM: rack.accessPointXM,
    yM: rack.accessPointYM,
  };
  const rackLine = lines.find((line) => containsPoint(line.rect, rackPoint));
  if (!rackLine) throw new AppException('NAVIGATION_RACK_NOT_CONNECTED');

  const bridges: Array<{ left: NavigationPoint; right: NavigationPoint }> = [];
  for (let left = 0; left < lines.length; left += 1) {
    for (let right = left + 1; right < lines.length; right += 1) {
      const point = intersection(lines[left], lines[right]);
      if (point) {
        appendUnique(lines[left].points, point);
        appendUnique(lines[right].points, point);
        continue;
      }
      const bridge = aisleBridge(lines[left], lines[right]);
      if (bridge) {
        appendUnique(lines[left].points, bridge.left);
        appendUnique(lines[right].points, bridge.right);
        bridges.push(bridge);
      }
    }
  }

  const gateProjection = project(gateLine, gate);
  const rackProjection = project(rackLine, rackPoint);
  appendUnique(gateLine.points, gateProjection);
  appendUnique(rackLine.points, rackProjection);

  const graph = new Map<string, Edge[]>();
  const pointsByKey = new Map<string, NavigationPoint>();
  for (const line of lines) {
    line.points.sort((left, right) =>
      line.orientation === 'H' ? left.xM - right.xM : left.yM - right.yM,
    );
    for (const point of line.points) pointsByKey.set(pointKey(point), point);
    for (let index = 1; index < line.points.length; index += 1) {
      connect(graph, line.points[index - 1], line.points[index]);
    }
  }
  for (const bridge of bridges) connect(graph, bridge.left, bridge.right);

  const routeKeys = shortestPath(
    graph,
    pointKey(gateProjection),
    pointKey(rackProjection),
  );
  if (!routeKeys) throw new AppException('NAVIGATION_PATH_NOT_FOUND');

  const points: NavigationPoint[] = [];
  appendUnique(points, gate);
  for (const key of routeKeys) {
    const point = pointsByKey.get(key);
    if (point) appendUnique(points, point);
  }
  appendUnique(points, rackPoint);

  const distanceM = points.reduce(
    (total, point, index) =>
      index === 0 ? total : total + distance(points[index - 1], point),
    0,
  );

  return {
    startGateCode: gate.code,
    targetRackId: rack.id,
    points,
    distanceM: Math.round(distanceM * 10) / 10,
  };
}

@Injectable()
export class WarehouseNavigationService {
  constructor(private readonly locationRepo: LocationRepository) {}

  async getPath(
    targetRackId: string,
    startGateCode = 'GATE-01',
  ): Promise<NavigationPath> {
    const [aisles, gates, racks] = await Promise.all([
      this.locationRepo.findAllAisles(),
      this.locationRepo.findAllGates(),
      this.locationRepo.findAllRacks(),
    ]);

    return calculateNavigationPath({
      aisles: aisles.map((aisle) => ({
        id: aisle._id.toString(),
        xM: aisle.xM,
        yM: aisle.yM,
        widthM: aisle.widthM,
        heightM: aisle.heightM,
      })),
      gates: gates.map((gate) => ({
        code: gate.code,
        xM: gate.xM,
        yM: gate.yM,
      })),
      racks: racks.map((rack) => ({
        id: rack._id.toString(),
        accessPointXM: rack.accessPointXM,
        accessPointYM: rack.accessPointYM,
      })),
      startGateCode,
      targetRackId,
    });
  }
}
