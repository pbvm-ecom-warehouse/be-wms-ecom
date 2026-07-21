import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { EVENTS, QUEUES, type StockExpiredPayload } from '@app/events';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { StockRepository } from './stock.repository';
import { StockTransactionHelper } from './helpers/with-stock-transaction.helper';
import { Lot, LotStatus } from './schemas/lot.schema';

/**
 * Cron quét hằng ngày (07:00, sau NearExpiryScanService 06:00) mọi Lot ACTIVE
 * đã qua expiryDate. CHỈ tăng StockBalance.expired (KHÔNG đụng onHand/
 * InventoryStock/StockMovement — hàng vẫn nằm vật lý trên kệ, chưa ai dọn),
 * rồi set Lot.status = EXPIRED và phát stock.expired. Dọn hàng vật lý thật
 * vẫn là ScrapNote thủ công (UC-08) — xem ScrapNoteService.approveScrapNote.
 * available = onHand-reserved-expired giảm đúng 1 lần qua bước này.
 */
@Injectable()
export class ExpiredLotScanService {
  private readonly logger = new Logger(ExpiredLotScanService.name);

  constructor(
    @InjectModel(Lot.name) private readonly lotModel: Model<Lot>,
    private readonly stockRepo: StockRepository,
    private readonly stockTransactionHelper: StockTransactionHelper,
    @InjectQueue(QUEUES.STOCK) private readonly stockQueue: Queue,
  ) {}

  @Cron('0 7 * * *')
  async scanExpiredLots(): Promise<void> {
    const now = new Date();
    const expiredLots = await this.lotModel
      .find({ status: LotStatus.ACTIVE, expiryDate: { $lt: now } })
      .exec();

    let lotsProcessed = 0;
    let eventsEmitted = 0;

    for (const lot of expiredLots) {
      const rows = await this.stockRepo.sumInventoryByLot(lot._id);

      await this.stockTransactionHelper.withStockTransaction(
        async (session) => {
          for (const row of rows) {
            await this.stockRepo.upsertBalance(
              row.itemId,
              row.warehouseId,
              0,
              0,
              row.qty,
              session,
            );
          }
          await this.lotModel
            .updateOne(
              { _id: lot._id },
              { status: LotStatus.EXPIRED },
              { session },
            )
            .exec();
        },
      );

      if (rows.length > 0) {
        const bySku = new Map<string, number>();
        for (const row of rows) {
          bySku.set(row.sku, (bySku.get(row.sku) ?? 0) + row.qty);
        }
        for (const [sku, totalQty] of bySku) {
          const payload: StockExpiredPayload = { sku, delta: -totalQty };
          const jobId = `lot_expire:${lot._id.toString()}:${sku}`;
          await this.stockQueue.add(EVENTS.STOCK_EXPIRED, payload, { jobId });
          eventsEmitted += 1;
        }
      }
      lotsProcessed += 1;
    }

    this.logger.log(
      `Quét lot hết hạn: ${lotsProcessed} lô xử lý, ${eventsEmitted} job stock.expired đã phát.`,
    );
  }
}
