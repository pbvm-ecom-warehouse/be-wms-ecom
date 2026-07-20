import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Carrier,
  CarrierDocument,
  CarrierStatus,
} from './schemas/carrier.schema';

export interface CreateCarrierInput {
  name: string;
  code: string;
  contactInfo?: Record<string, unknown>;
  note?: string;
  createdBy: Types.ObjectId;
}

export interface UpdateCarrierInput {
  name?: string;
  contactInfo?: Record<string, unknown>;
  note?: string;
  status?: CarrierStatus;
  updatedBy: Types.ObjectId;
}

export interface QueryCarrierInput {
  status?: CarrierStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class CarrierRepository {
  constructor(
    @InjectModel(Carrier.name) private readonly model: Model<Carrier>,
  ) {}

  findById(id: string): Promise<CarrierDocument | null> {
    return this.model.findOne({ _id: id, deletedAt: null }).exec();
  }

  findByCode(code: string): Promise<CarrierDocument | null> {
    return this.model.findOne({ code, deletedAt: null }).exec();
  }

  async create(input: CreateCarrierInput): Promise<CarrierDocument> {
    const [doc] = await this.model.create([
      {
        name: input.name,
        code: input.code,
        contactInfo: input.contactInfo,
        note: input.note,
        createdBy: input.createdBy,
      },
    ]);
    return doc;
  }

  update(
    id: string,
    input: UpdateCarrierInput,
  ): Promise<CarrierDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: id, deletedAt: null },
        { $set: input },
        { new: true },
      )
      .exec();
  }

  async findAll(
    query: QueryCarrierInput,
  ): Promise<{ data: CarrierDocument[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = { deletedAt: null };
    if (query.status) filter['status'] = query.status;

    const [data, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { data, total };
  }
}
