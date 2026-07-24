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

  describe('getTemplate', () => {
    it('CUP_BLANK trả template ngay', () => {
      const template = svc.getTemplate(ItemType.CUP_BLANK);
      expect(template.templateId).toBe('CUP_BLANK');
    });

    it('MATERIAL trả template gộp duy nhất, không cần category trước', () => {
      const template = svc.getTemplate(ItemType.MATERIAL);
      expect(template.templateId).toBe('MATERIAL');
    });

    it('PACKAGING trả template gộp duy nhất', () => {
      const template = svc.getTemplate(ItemType.PACKAGING);
      expect(template.templateId).toBe('PACKAGING');
    });
  });

  describe('resolveAndBuildSku', () => {
    const materialOptions = [
      {
        _id: 'opt-category',
        key: AttributeOptionKey.MATERIAL_CATEGORY,
        code: 'SYRUP',
        name: 'Syrup',
        isActive: true,
      },
      {
        _id: 'opt-type',
        key: AttributeOptionKey.MATERIAL_TYPE,
        code: 'SYR',
        name: 'Siro',
        isActive: true,
      },
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

    it('sinh đúng SKU MAT-SYRUP-SYR-PEACH-750ML + snapshot đúng field order', async () => {
      optionRepo.findByIds.mockResolvedValue(materialOptions);

      const result = await svc.resolveAndBuildSku(
        'MATERIAL',
        ItemType.MATERIAL,
        ['opt-category', 'opt-type', 'opt-flavor', 'opt-spec'],
      );

      expect(result.sku).toBe('MAT-SYRUP-SYR-PEACH-750ML');
      expect(result.attributeSnapshot.map((s) => s.key)).toEqual([
        'MATERIAL_CATEGORY',
        'MATERIAL_TYPE',
        'FLAVOR',
        'SPEC',
      ]);
    });

    it('không gửi FLAVOR (optional) vẫn thành công, SKU không có segment flavor', async () => {
      optionRepo.findByIds.mockResolvedValue(
        materialOptions.filter((o) => o.key !== AttributeOptionKey.FLAVOR),
      );

      const result = await svc.resolveAndBuildSku(
        'MATERIAL',
        ItemType.MATERIAL,
        ['opt-category', 'opt-type', 'opt-spec'],
      );

      expect(result.sku).toBe('MAT-SYRUP-SYR-750ML');
      expect(result.attributeSnapshot.map((s) => s.key)).toEqual([
        'MATERIAL_CATEGORY',
        'MATERIAL_TYPE',
        'SPEC',
      ]);
    });

    it('PACKAGING không gửi SIZE/COLOR (optional) vẫn thành công, SKU chỉ còn PKG-<CATEGORY>', async () => {
      optionRepo.findByIds.mockResolvedValue([
        {
          _id: 'opt-pkg-category',
          key: AttributeOptionKey.PACKAGING_CATEGORY,
          code: 'LID',
          name: 'Nắp ly',
          isActive: true,
        },
      ]);

      const result = await svc.resolveAndBuildSku(
        'PACKAGING',
        ItemType.PACKAGING,
        ['opt-pkg-category'],
      );

      expect(result.sku).toBe('PKG-LID');
      expect(result.attributeSnapshot.map((s) => s.key)).toEqual([
        'PACKAGING_CATEGORY',
      ]);
    });

    it('throw STOCK_SKU_TEMPLATE_NOT_FOUND nếu templateId không tồn tại', async () => {
      await expect(
        svc.resolveAndBuildSku('NOPE', ItemType.MATERIAL, []),
      ).rejects.toMatchObject({ code: 'STOCK_SKU_TEMPLATE_NOT_FOUND' });
    });

    it('throw STOCK_SKU_TEMPLATE_MISMATCH nếu template.itemType khác itemType truyền vào', async () => {
      await expect(
        svc.resolveAndBuildSku('MATERIAL', ItemType.PACKAGING, []),
      ).rejects.toMatchObject({ code: 'STOCK_SKU_TEMPLATE_MISMATCH' });
    });

    it('throw STOCK_ATTRIBUTE_OPTION_NOT_FOUND nếu thiếu option cho 1 field bắt buộc', async () => {
      optionRepo.findByIds.mockResolvedValue([materialOptions[0]]);
      await expect(
        svc.resolveAndBuildSku('MATERIAL', ItemType.MATERIAL, ['opt-category']),
      ).rejects.toMatchObject({ code: 'STOCK_ATTRIBUTE_OPTION_NOT_FOUND' });
    });

    it('throw STOCK_ATTRIBUTE_OPTION_INACTIVE nếu option bị deactivate', async () => {
      optionRepo.findByIds.mockResolvedValue([
        { ...materialOptions[0], isActive: false },
        materialOptions[1],
        materialOptions[3],
      ]);
      await expect(
        svc.resolveAndBuildSku('MATERIAL', ItemType.MATERIAL, [
          'opt-category',
          'opt-type',
          'opt-spec',
        ]),
      ).rejects.toMatchObject({ code: 'STOCK_ATTRIBUTE_OPTION_INACTIVE' });
    });
  });
});
