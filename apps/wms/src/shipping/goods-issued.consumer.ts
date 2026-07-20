import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EVENTS, QUEUES, type GoodsIssuedPayload } from '@app/events';
import { ShipmentService } from './shipment.service';
import { GoodsIssueRepository } from '../goods-issue/goods-issue.repository';

/**
 * Consumer nội bộ WMS — nhận goods.issued (do GoodsIssueService phát trên
 * cùng QUEUES.SHIPMENT mà Ecommerce cũng lắng nghe). 2 process riêng biệt
 * cùng đọc 1 queue Redis, không xung đột.
 */
@Processor(QUEUES.SHIPMENT)
export class GoodsIssuedConsumer extends WorkerHost {
  private readonly logger = new Logger(GoodsIssuedConsumer.name);

  constructor(
    private readonly shipmentService: ShipmentService,
    private readonly goodsIssueRepo: GoodsIssueRepository,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EVENTS.GOODS_ISSUED: {
        const data = job.data as GoodsIssuedPayload;
        const gi = await this.goodsIssueRepo.findById(data.goodsIssueId);
        if (!gi) {
          this.logger.warn(
            `Không tìm thấy GoodsIssue=${data.goodsIssueId} → bỏ qua auto-sinh Shipment.`,
          );
          return;
        }
        await this.shipmentService.createFromGoodsIssue({
          orderId: gi.orderId,
          goodsIssueId: data.goodsIssueId,
          fulfillWarehouseId: gi.warehouseId.toString(),
          recipient: {
            name: gi.recipient.name,
            phone: gi.recipient.phone,
            address: gi.shippingAddress,
          },
          paymentMethod: gi.paymentMethod,
          codAmount: gi.codAmount,
        });
        this.logger.log(
          `Auto-sinh Shipment{PENDING} cho goodsIssueId=${data.goodsIssueId}`,
        );
        break;
      }
      default:
      // Bỏ qua job khác trên cùng queue (vd job của Ecom consumer không liên quan process này)
    }
  }
}
