import { SkuTemplateService } from './sku-template.service';
import { ItemType } from '../schemas/warehouse-item.schema';
import { AttributeOptionKey } from '../schemas/attribute-option.schema';

const makeOptionRepo = () => ({
  findByIds: jest.fn(),
});

describe('SkuTemplateService', () => {
  let svc: SkuTemplateService;
  let optionRepo: ReturnType<typeof makeOptionRepo>;

  beforeEach(() => {
    optionRepo = makeOptionRepo();
    svc = new SkuTemplateService(optionRepo as never);
  });

  describe('getRootOrCategoryOptions', () => {
    it('CUP_BLANK trả template ngay, không cần category', async () => {
      const result = await svc.getRootOrCategoryOptions(ItemType.CUP_BLANK);
      expect(result.kind).toBe('template');
      if (result.kind === 'template') {
        expect(result.template.templateId).toBe('CUP_BLANK');
      }
    });

    it('MATERIAL không truyền categoryOptionId → trả kind=category-options', async () => {
      const result = await svc.getRootOrCategoryOptions(ItemType.MATERIAL);
      expect(result.kind).toBe('category-options');
    });

    it('MATERIAL + categoryOptionId khớp option code=SYRUP → trả template MATERIAL_SYRUP', async () => {
      optionRepo.findByIds.mockResolvedValue([
        {
          _id: 'opt1',
          key: AttributeOptionKey.MATERIAL_CATEGORY,
          code: 'SYRUP',
          isActive: true,
        },
      ]);
      const result = await svc.getRootOrCategoryOptions(
        ItemType.MATERIAL,
        'opt1',
      );
      expect(result.kind).toBe('template');
      if (result.kind === 'template') {
        expect(result.template.templateId).toBe('MATERIAL_SYRUP');
      }
    });

    it('categoryOptionId không khớp option nào → STOCK_ATTRIBUTE_OPTION_NOT_FOUND', async () => {
      optionRepo.findByIds.mockResolvedValue([]);
      await expect(
        svc.getRootOrCategoryOptions(ItemType.MATERIAL, 'bad-id'),
      ).rejects.toMatchObject({ code: 'STOCK_ATTRIBUTE_OPTION_NOT_FOUND' });
    });
  });

  describe('resolveAndBuildSku', () => {
    const activeOptions = [
      {
        _id: 'opt-flavor',
        key: AttributeOptionKey.FLAVOR,
        code: 'PEACH',
        name: 'Đào',
        isActive: true,
      },
      {
        _id: 'opt-spec',
        key: AttributeOptionKey.SPEC,
        code: '750ML',
        name: '750ml',
        isActive: true,
      },
    ];

    it('sinh đúng SKU MAT-SYR-PEACH-750ML + snapshot đúng field order', async () => {
      optionRepo.findByIds.mockResolvedValue(activeOptions);

      const result = await svc.resolveAndBuildSku(
        'MATERIAL_SYRUP',
        ItemType.MATERIAL,
        ['opt-flavor', 'opt-spec'],
      );

      expect(result.sku).toBe('MAT-SYR-PEACH-750ML');
      expect(result.attributeSnapshot.map((s) => s.key)).toEqual([
        'FLAVOR',
        'SPEC',
      ]);
    });

    it('throw STOCK_SKU_TEMPLATE_NOT_FOUND nếu templateId không tồn tại', async () => {
      await expect(
        svc.resolveAndBuildSku('NOPE', ItemType.MATERIAL, []),
      ).rejects.toMatchObject({ code: 'STOCK_SKU_TEMPLATE_NOT_FOUND' });
    });

    it('throw STOCK_SKU_TEMPLATE_MISMATCH nếu template.itemType khác itemType truyền vào', async () => {
      await expect(
        svc.resolveAndBuildSku('MATERIAL_SYRUP', ItemType.PACKAGING, []),
      ).rejects.toMatchObject({ code: 'STOCK_SKU_TEMPLATE_MISMATCH' });
    });

    it('throw STOCK_ATTRIBUTE_OPTION_NOT_FOUND nếu thiếu option cho 1 field', async () => {
      optionRepo.findByIds.mockResolvedValue([activeOptions[0]]);
      await expect(
        svc.resolveAndBuildSku('MATERIAL_SYRUP', ItemType.MATERIAL, [
          'opt-flavor',
        ]),
      ).rejects.toMatchObject({ code: 'STOCK_ATTRIBUTE_OPTION_NOT_FOUND' });
    });

    it('throw STOCK_ATTRIBUTE_OPTION_INACTIVE nếu option bị deactivate', async () => {
      optionRepo.findByIds.mockResolvedValue([
        { ...activeOptions[0], isActive: false },
        activeOptions[1],
      ]);
      await expect(
        svc.resolveAndBuildSku('MATERIAL_SYRUP', ItemType.MATERIAL, [
          'opt-flavor',
          'opt-spec',
        ]),
      ).rejects.toMatchObject({ code: 'STOCK_ATTRIBUTE_OPTION_INACTIVE' });
    });
  });
});
