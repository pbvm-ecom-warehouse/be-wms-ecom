import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DocumentCounter } from './schemas/document-counter.schema';

@Injectable()
export class DocumentNumberService {
  constructor(
    @InjectModel(DocumentCounter.name)
    private readonly model: Model<DocumentCounter>,
  ) {}

  /** Sinh mã `<PREFIX>-YYYYMMDD-xxxx`, sequence tăng atomic theo từng ngày. */
  async next(prefix: string, now = new Date()): Promise<string> {
    const datePart = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('');
    const key = `${prefix}-${datePart}`;
    const counter = await this.model
      .findOneAndUpdate(
        { key },
        { $inc: { sequence: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean()
      .exec();

    return `${key}-${String(counter.sequence).padStart(4, '0')}`;
  }
}
