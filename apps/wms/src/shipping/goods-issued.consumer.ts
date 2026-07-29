import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EVENTS, QUEUES, type GoodsIssuedPayload } from '@app/events';
import { ShipmentService } from './shipment.service';
import { GoodsIssueRepository } from '../goods-issue/goods-issue.repository';

/**
 * Consumer nội bộ WMS — nhận goods.issued trên QUEUES.SHIPMENT_INTERNAL (KHÔNG
 * phải QUEUES.SHIPMENT mà Ecommerce dùng). BullMQ Worker là competing consumer:
 * nếu dùng chung 1 queue, mỗi job chỉ được 1 trong 2 process nhận — Ecom hoặc WMS
 * sẽ ngẫu nhiên bỏ lỡ xử lý. GoodsIssueService.emitGoodsIssued phát goods.issued
 * lên CẢ 2 queue (SHIPMENT cho Ecom, SHIPMENT_INTERNAL cho WMS) để cả 2 side đều
 * nhận được. Tiền lệ: QUEUES.ORDER_REPLY tách khỏi QUEUES.ORDER vì lý do tương tự.
 */
@Processor(QUEUES.SHIPMENT_INTERNAL)
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
          orderCode: gi.orderCode,
          goodsIssueId: data.goodsIssueId,
          recipient: {
            name: gi.recipient.name,
            phone: gi.recipient.phone,
            address: gi.shippingAddress,
          },
          paymentMethod: gi.paymentMethod,
          codAmount: gi.codAmount,
          ...(gi.assignedShipperId
            ? { assignedShipperId: gi.assignedShipperId.toString() }
            : {}),
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
