export type WarehouseLayoutValidationEntity =
  | 'CANVAS'
  | 'RACK_TEMPLATE'
  | 'ZONE'
  | 'RACK'
  | 'SHELF'
  | 'AISLE'
  | 'GATE';

export interface WarehouseLayoutValidationIssue {
  entity: WarehouseLayoutValidationEntity;
  id?: string;
  clientId?: string;
  field?: string;
  code: string;
}

type EntityIdentity = {
  id?: string;
  _id?: string | { toString(): string };
  clientId?: string;
};

type Rect = { xM: number; yM: number; widthM: number; heightM: number };

export interface WarehouseLayoutGeometry {
  canvas: { widthM: number; heightM: number; gridM: number };
  rackTemplate: {
    widthM: number;
    depthM: number;
    levelCount?: number;
    bayCount?: number;
  };
  zones: Array<
    EntityIdentity & {
      code?: string;
      xM: number;
      yM: number;
      widthM: number;
      heightM: number;
      rotation?: number;
    }
  >;
  racks: Array<
    EntityIdentity & {
      zoneId: string | { toString(): string };
      code?: string;
      xM: number;
      yM: number;
      rotation?: number;
    }
  >;
  aisles: Array<
    EntityIdentity & {
      code?: string;
      xM: number;
      yM: number;
      widthM: number;
      heightM: number;
    }
  >;
  gates: Array<EntityIdentity & { code?: string; xM: number; yM: number }>;
}

function identity(entity: EntityIdentity) {
  const id = entity.id ?? entity._id?.toString();
  return {
    ...(id ? { id } : {}),
    ...(entity.clientId ? { clientId: entity.clientId } : {}),
  };
}

function issue(
  entity: WarehouseLayoutValidationEntity,
  subject: EntityIdentity,
  code: string,
): WarehouseLayoutValidationIssue {
  return { entity, ...identity(subject), code };
}

function dimensionsForRotation(widthM: number, heightM: number, rotation = 0) {
  return rotation === 90
    ? { widthM: heightM, heightM: widthM }
    : { widthM, heightM };
}

function contains(outer: Rect, inner: Rect) {
  return (
    inner.xM >= outer.xM &&
    inner.yM >= outer.yM &&
    inner.xM + inner.widthM <= outer.xM + outer.widthM &&
    inner.yM + inner.heightM <= outer.yM + outer.heightM
  );
}

function overlaps(a: Rect, b: Rect) {
  return (
    a.xM < b.xM + b.widthM &&
    a.xM + a.widthM > b.xM &&
    a.yM < b.yM + b.heightM &&
    a.yM + a.heightM > b.yM
  );
}

function zoneRect(zone: WarehouseLayoutGeometry['zones'][number]): Rect {
  return {
    xM: zone.xM,
    yM: zone.yM,
    ...dimensionsForRotation(zone.widthM, zone.heightM, zone.rotation),
  };
}

function rackRect(
  rack: WarehouseLayoutGeometry['racks'][number],
  template: WarehouseLayoutGeometry['rackTemplate'],
): Rect {
  return {
    xM: rack.xM,
    yM: rack.yM,
    ...dimensionsForRotation(template.widthM, template.depthM, rack.rotation),
  };
}

export function validateWarehouseLayoutGeometry(
  layout: WarehouseLayoutGeometry,
): WarehouseLayoutValidationIssue[] {
  const issues: WarehouseLayoutValidationIssue[] = [];
  const canvasRect: Rect = {
    xM: 0,
    yM: 0,
    widthM: layout.canvas.widthM,
    heightM: layout.canvas.heightM,
  };

  for (const field of ['widthM', 'heightM', 'gridM'] as const) {
    if (layout.canvas[field] <= 0) {
      issues.push({
        entity: 'CANVAS',
        field,
        code: 'VALUE_MUST_BE_POSITIVE',
      });
    }
  }
  for (const field of ['widthM', 'depthM'] as const) {
    if (layout.rackTemplate[field] <= 0) {
      issues.push({
        entity: 'RACK_TEMPLATE',
        field,
        code: 'VALUE_MUST_BE_POSITIVE',
      });
    }
  }

  const zonesById = new Map<string, Rect>();
  for (const zone of layout.zones) {
    for (const field of ['widthM', 'heightM'] as const) {
      if (zone[field] <= 0) {
        issues.push({
          entity: 'ZONE',
          ...identity(zone),
          field,
          code: 'VALUE_MUST_BE_POSITIVE',
        });
      }
    }
    const rect = zoneRect(zone);
    const zoneId = zone.id ?? zone._id?.toString() ?? zone.clientId;
    if (zoneId) zonesById.set(zoneId, rect);
    if (!contains(canvasRect, rect)) {
      issues.push(issue('ZONE', zone, 'ZONE_OUTSIDE_CANVAS'));
    }
  }

  const aisleRects = layout.aisles.map((aisle) => {
    for (const field of ['widthM', 'heightM'] as const) {
      if (aisle[field] <= 0) {
        issues.push({
          entity: 'AISLE',
          ...identity(aisle),
          field,
          code: 'VALUE_MUST_BE_POSITIVE',
        });
      }
    }
    const rect: Rect = {
      xM: aisle.xM,
      yM: aisle.yM,
      widthM: aisle.widthM,
      heightM: aisle.heightM,
    };
    if (!contains(canvasRect, rect)) {
      issues.push(issue('AISLE', aisle, 'AISLE_OUTSIDE_CANVAS'));
    }
    return { aisle, rect };
  });

  for (const gate of layout.gates) {
    if (
      gate.xM < 0 ||
      gate.yM < 0 ||
      gate.xM > layout.canvas.widthM ||
      gate.yM > layout.canvas.heightM
    ) {
      issues.push(issue('GATE', gate, 'GATE_OUTSIDE_CANVAS'));
    }
  }

  const rackRects = layout.racks.map((rack) => {
    const rect = rackRect(rack, layout.rackTemplate);
    const zone = zonesById.get(rack.zoneId.toString());
    if (!zone) {
      issues.push(issue('RACK', rack, 'RACK_ZONE_NOT_FOUND'));
    } else if (!contains(zone, rect)) {
      issues.push(issue('RACK', rack, 'RACK_OUTSIDE_ZONE'));
    }
    if (aisleRects.some(({ rect: aisle }) => overlaps(rect, aisle))) {
      issues.push(issue('RACK', rack, 'RACK_OVERLAPS_AISLE'));
    }
    return { rack, rect };
  });

  for (let left = 0; left < rackRects.length; left += 1) {
    for (let right = left + 1; right < rackRects.length; right += 1) {
      if (overlaps(rackRects[left].rect, rackRects[right].rect)) {
        issues.push(
          issue('RACK', rackRects[left].rack, 'RACK_OVERLAPS_RACK'),
          issue('RACK', rackRects[right].rack, 'RACK_OVERLAPS_RACK'),
        );
      }
    }
  }

  return issues;
}
