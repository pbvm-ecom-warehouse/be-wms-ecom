import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AttributeOptionKey,
  ItemAttributeOption,
  ItemAttributeOptionDocument,
} from '../schemas/attribute-option.schema';

export type CreateAttributeOptionData = {
  key: AttributeOptionKey;
  name: string;
  code: string;
};

@Injectable()
export class AttributeOptionRepository {
  constructor(
    @InjectModel(ItemAttributeOption.name)
    private readonly model: Model<ItemAttributeOption>,
  ) {}

  findByKey(
    key: AttributeOptionKey,
    includeInactive: boolean,
  ): Promise<ItemAttributeOptionDocument[]> {
    const filter: Record<string, unknown> = { key, deletedAt: null };
    if (!includeInactive) filter['isActive'] = true;
    return this.model.find(filter).sort({ sortOrder: 1, name: 1 }).exec();
  }

  findById(id: string): Promise<ItemAttributeOptionDocument | null> {
    return this.model.findOne({ _id: id, deletedAt: null }).exec();
  }

  findByKeyAndCode(
    key: AttributeOptionKey,
    code: string,
  ): Promise<ItemAttributeOptionDocument | null> {
    return this.model.findOne({ key, code, deletedAt: null }).exec();
  }

  findByIds(ids: string[]): Promise<ItemAttributeOptionDocument[]> {
    return this.model.find({ _id: { $in: ids }, deletedAt: null }).exec();
  }

  create(
    data: CreateAttributeOptionData,
    createdBy: Types.ObjectId,
  ): Promise<ItemAttributeOptionDocument> {
    return this.model.create({ ...data, createdBy, isActive: true });
  }

  update(
    id: string,
    data: Partial<{ name: string; isActive: boolean; sortOrder: number }>,
    updatedBy: Types.ObjectId,
  ): Promise<ItemAttributeOptionDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { ...data, updatedBy },
        { new: true },
      )
      .exec();
  }
}
