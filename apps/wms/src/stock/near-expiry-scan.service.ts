import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { EVENTS, QUEUES, type StockNearExpiryPayload } from '@app/events';
import { Queue } from 'bullmq';
import { Model, PipelineStage } from 'mongoose';
import { Lot, LotStatus } from './schemas/lot.schema';

interface NearExpiryRow {
  lotNumber: string;
  expiryDate: Date;
  sku: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_NEAR_EXPIRY_DAYS = 7;

/**
 * Cron quét hằng ngày (06:00) mọi Lot ACTIVE có expiryDate trong ngưỡng
 * item.nearExpiryDays (fallback 7 ngày), phát stock.near_expiry cho MỖI lô —
 * KHÔNG dedup (theo quyết định thiết kế: chấp nhận báo lại mỗi ngày cho tới khi
 * lô được xử lý, không cần lưu bảng "đã báo"). Aggregation trực tiếp trên Lot
 * (không qua InventoryStock) vì chỉ cần sku+lotNumber+expiryDate để soạn thông
 * báo, không cần vị trí/số lượng.
 */
@Injectable()
export class NearExpiryScanService {
  private readonly logger = new Logger(NearExpiryScanService.name);

  constructor(
    @InjectModel(Lot.name) private readonly lotModel: Model<Lot>,
    @InjectQueue(QUEUES.NOTIFICATION)
    private readonly notificationQueue: Queue,
  ) {}

  @Cron('0 6 * * *')
  async scanNearExpiryLots(): Promise<void> {
    const now = new Date();
    const pipeline: PipelineStage[] = [
      { $match: { status: LotStatus.ACTIVE } },
      {
        $lookup: {
          from: 'warehouse_items',
          localField: 'itemId',
          foreignField: '_id',
          as: 'item',
        },
      },
      { $unwind: '$item' },
      {
        $addFields: {
          thresholdDate: {
            $add: [
              now,
              {
                $multiply: [
                  {
                    $ifNull: ['$item.nearExpiryDays', DEFAULT_NEAR_EXPIRY_DAYS],
                  },
                  MS_PER_DAY,
                ],
              },
            ],
          },
        },
      },
      { $match: { $expr: { $lte: ['$expiryDate', '$thresholdDate'] } } },
      {
        $project: {
          _id: 0,
          lotNumber: 1,
          expiryDate: 1,
          sku: '$item.sku',
        },
      },
    ];

    const rows = await this.lotModel.aggregate<NearExpiryRow>(pipeline).exec();

    for (const row of rows) {
      const payload: StockNearExpiryPayload = {
        sku: row.sku,
        lotNumber: row.lotNumber,
        expiryDate: row.expiryDate.toISOString(),
      };
      await this.notificationQueue.add(EVENTS.STOCK_NEAR_EXPIRY, payload);
    }
    this.logger.log(`Quét lot sắp hết hạn: ${rows.length} lô cần cảnh báo.`);
  }
}
