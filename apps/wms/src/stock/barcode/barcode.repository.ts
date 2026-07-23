import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { BarcodeCounter } from '../schemas/barcode-counter.schema';
import {
  BarcodeKind,
  BarcodeRegistryEntry,
} from '../schemas/barcode-registry.schema';

@Injectable()
export class BarcodeRepository {
  constructor(
    @InjectModel(BarcodeCounter.name)
    private readonly counterModel: Model<BarcodeCounter>,
    @InjectModel(BarcodeRegistryEntry.name)
    private readonly registryModel: Model<BarcodeRegistryEntry>,
  ) {}

  /** $inc atomic — an toàn dưới concurrent request nhờ Mongo single-document atomicity. */
  async nextSequence(prefix: string, session: ClientSession): Promise<number> {
    const doc = await this.counterModel.findOneAndUpdate(
      { prefix },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, session },
    );
    return doc.seq;
  }

  /** Không catch lỗi 11000 ở đây — để caller (BarcodeService) quyết định retry hay map lỗi. */
  async insertRegistryEntry(
    code: string,
    itemId: Types.ObjectId,
    kind: BarcodeKind,
    session: ClientSession,
  ): Promise<void> {
    await this.registryModel.create([{ code, itemId, kind }], { session });
  }

  findByCode(code: string): Promise<{ itemId: Types.ObjectId } | null> {
    return this.registryModel.findOne({ code }).lean().exec();
  }

  async deleteByCode(code: string, session?: ClientSession): Promise<void> {
    await this.registryModel.deleteOne({ code }, { session }).exec();
  }
}
