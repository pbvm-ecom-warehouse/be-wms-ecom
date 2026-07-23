import { SkuTemplate } from './sku-template.registry';

/**
 * Ghép prefix + code của từng field THEO ĐÚNG THỨ TỰ template.fields — cố ý
 * không dựa vào thứ tự key trong object đầu vào (JS object key order không
 * phải hợp đồng ổn định, và request từ client có thể gửi field theo bất kỳ
 * thứ tự nào — issue #25 checklist: "SKU builder đúng order, không phụ thuộc
 * order key request").
 */
export function buildSku(
  template: SkuTemplate,
  codesByKey: Record<string, string>,
): string {
  const parts = [template.prefix];
  for (const field of template.fields) {
    const code = codesByKey[field.key];
    if (!code) {
      throw new Error(
        `Thiếu code cho field ${field.key} của template ${template.templateId}`,
      );
    }
    parts.push(code);
  }
  return parts.join('-');
}
