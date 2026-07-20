import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { Types } from 'mongoose';
import {
  CarrierRepository,
  CreateCarrierInput,
  QueryCarrierInput,
} from './carrier.repository';
import { CarrierDocument, CarrierStatus } from './schemas/carrier.schema';

export interface CreateCarrierDtoInput {
  name: string;
  code: string;
  contactInfo?: Record<string, unknown>;
  note?: string;
}

export interface UpdateCarrierDtoInput {
  name?: string;
  contactInfo?: Record<string, unknown>;
  note?: string;
  status?: CarrierStatus;
}

@Injectable()
export class CarrierService {
  constructor(private readonly repo: CarrierRepository) {}

  async create(
    input: CreateCarrierDtoInput,
    actorId: string,
  ): Promise<CarrierDocument> {
    const existing = await this.repo.findByCode(input.code);
    if (existing) throw new AppException('CARRIER_CODE_CONFLICT');

    const createInput: CreateCarrierInput = {
      name: input.name,
      code: input.code,
      contactInfo: input.contactInfo,
      note: input.note,
      createdBy: new Types.ObjectId(actorId),
    };
    return this.repo.create(createInput);
  }

  async update(
    id: string,
    input: UpdateCarrierDtoInput,
    actorId: string,
  ): Promise<CarrierDocument> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppException('CARRIER_NOT_FOUND');

    const updated = await this.repo.update(id, {
      ...input,
      updatedBy: new Types.ObjectId(actorId),
    });
    if (!updated) throw new AppException('CARRIER_NOT_FOUND');
    return updated;
  }

  async getById(id: string): Promise<CarrierDocument> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new AppException('CARRIER_NOT_FOUND');
    return doc;
  }

  list(
    query: QueryCarrierInput,
  ): Promise<{ data: CarrierDocument[]; total: number }> {
    return this.repo.findAll(query);
  }
}
