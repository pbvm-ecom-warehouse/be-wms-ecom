import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { Types } from 'mongoose';
import {
  AttributeOptionRepository,
  CreateAttributeOptionData,
} from './attribute-option.repository';
import { AttributeOptionKey } from '../schemas/attribute-option.schema';
import { findValidCategoryCodes } from '../sku/sku-template.registry';

/**
 * Gợi ý code từ name: bỏ dấu tiếng Việt, uppercase, ghép chữ cái đầu mỗi từ
 * (name nhiều từ) hoặc cắt 6 ký tự đầu (name 1 từ) — ADMIN luôn phải xác nhận/
 * sửa lại trước khi lưu (issue #25: "Hệ thống gợi ý code; ADMIN phải xác nhận").
 */
export function suggestCodeFromName(name: string): string {
  const stripped = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim();

  const words = stripped.split(/\s+/).filter(Boolean);

  if (words.length > 1) {
    return words
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 6);
  }
  return (words[0] ?? '').toUpperCase().slice(0, 6);
}

export type CreateAttributeOptionDto = CreateAttributeOptionData;
export type UpdateAttributeOptionDto = Partial<{
  /** Chỉ dùng để service phát hiện + từ chối — không bao giờ ghi vào DB
   * (xem check 'code' in dto bên dưới). */
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}>;

@Injectable()
export class AttributeOptionService {
  constructor(private readonly repo: AttributeOptionRepository) {}

  list(key: AttributeOptionKey, includeInactive: boolean) {
    return this.repo.findByKey(key, includeInactive);
  }

  suggestCode(_key: AttributeOptionKey, name: string): { code: string } {
    return { code: suggestCodeFromName(name) };
  }

  async create(dto: CreateAttributeOptionDto, actorId: string) {
    const validCategoryCodes = findValidCategoryCodes(dto.key);
    if (
      validCategoryCodes.length > 0 &&
      !validCategoryCodes.includes(dto.code)
    ) {
      throw new AppException('STOCK_ATTRIBUTE_CATEGORY_CODE_INVALID');
    }

    const existing = await this.repo.findByKeyAndCode(dto.key, dto.code);
    if (existing) {
      throw new AppException('STOCK_ATTRIBUTE_CODE_CONFLICT');
    }
    return this.repo.create(dto, new Types.ObjectId(actorId));
  }

  async update(id: string, dto: UpdateAttributeOptionDto, actorId: string) {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new AppException('STOCK_ATTRIBUTE_OPTION_NOT_FOUND');
    }
    // Code bất biến sau khi tạo — option có thể đã được dùng để build SKU của
    // item đang tồn tại, đổi code sẽ làm sai lệch snapshot attributes[].code
    // trên các item cũ (xem data-and-mongoose.md: "Không sửa code sau khi option đã dùng").
    if ('code' in dto) {
      throw new AppException('STOCK_ATTRIBUTE_CODE_IMMUTABLE');
    }
    return this.repo.update(id, dto, new Types.ObjectId(actorId));
  }
}
