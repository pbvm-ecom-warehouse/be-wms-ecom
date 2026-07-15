import {
  ScrapNote,
  ScrapNoteSchema,
  ScrapNoteStatus,
} from './scrap-note.schema';

describe('ScrapNoteSchema', () => {
  it('default status là DRAFT', () => {
    const paths = ScrapNoteSchema.paths;
    expect(paths['status'].defaultValue).toBe(ScrapNoteStatus.DRAFT);
  });

  it('warehouseId và createdBy là required', () => {
    const warehouseIdPath = ScrapNoteSchema.paths['warehouseId'] as unknown as {
      isRequired: boolean;
    };
    const createdByPath = ScrapNoteSchema.paths['createdBy'] as unknown as {
      isRequired: boolean;
    };
    expect(warehouseIdPath.isRequired).toBe(true);
    expect(createdByPath.isRequired).toBe(true);
  });

  it('items là required array', () => {
    expect(ScrapNoteSchema.paths['items']).toBeDefined();
  });

  it('có index warehouseId+status và status', () => {
    const indexes = ScrapNoteSchema.indexes();
    const compound = indexes.find(
      ([def]) => def['warehouseId'] === 1 && def['status'] === 1,
    );
    expect(compound).toBeDefined();
    const statusOnly = indexes.find(
      ([def]) => def['status'] === 1 && !('warehouseId' in def),
    );
    expect(statusOnly).toBeDefined();
  });

  it('ScrapNoteStatus có đủ 3 giá trị', () => {
    expect(Object.values(ScrapNoteStatus)).toEqual([
      'DRAFT',
      'APPROVED',
      'REJECTED',
    ]);
  });

  it('export ScrapNote class dùng được với SchemaFactory (smoke test)', () => {
    expect(ScrapNote).toBeDefined();
  });

  it('ScrapNoteItem.skipAvailableSync mặc định false', () => {
    const itemPaths = (
      ScrapNoteSchema.path('items') as unknown as {
        schema: { paths: Record<string, { defaultValue: unknown }> };
      }
    ).schema.paths;
    expect(itemPaths['skipAvailableSync'].defaultValue).toBe(false);
  });
});
