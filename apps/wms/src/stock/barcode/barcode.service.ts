import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { ClientSession, Types } from 'mongoose';
import { BarcodeRepository } from './barcode.repository';
import { buildEan13 } from './ean13';
import { BarcodeKind } from '../schemas/barcode-registry.schema';

const PRIMARY_PREFIX = '20';
const MAX_RETRIES = 3;

export function isMongoDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000
  );
}

@Injectable()
export class BarcodeService {
  constructor(private readonly repo: BarcodeRepository) {}

  /**
   * Sequence từ barcode_counters gần như không bao giờ trùng (atomic $inc),
   * nhưng vẫn retry khi gặp 11000 thay vì throw ngay — phòng trường hợp registry
   * đã có sẵn 1 code trùng do dữ liệu backfill cũ (xem backfill-barcode-registry.ts),
   * đúng yêu cầu issue #25: "Hai request khác SKU nhận hai EAN-13 khác nhau".
   */
  async generateAndReservePrimaryBarcode(
    itemId: Types.ObjectId,
    session: ClientSession,
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const seq = await this.repo.nextSequence(PRIMARY_PREFIX, session);
      const code = buildEan13(PRIMARY_PREFIX, seq);
      try {
        await this.repo.insertRegistryEntry(
          code,
          itemId,
          BarcodeKind.PRIMARY,
          session,
        );
        return code;
      } catch (err) {
        if (!isMongoDuplicateKeyError(err)) throw err;
      }
    }
    throw new AppException('STOCK_ITEM_BARCODE_CONFLICT');
  }

  async findItemIdByCode(code: string): Promise<Types.ObjectId | null> {
    const entry = await this.repo.findByCode(code);
    return entry?.itemId ?? null;
  }
}
