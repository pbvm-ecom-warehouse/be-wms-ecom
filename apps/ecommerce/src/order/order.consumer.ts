import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EVENTS, QUEUES } from '@app/events';
import { OrderService } from './order.service';

/**
 * Consumer nhận các sự kiện từ WMS liên quan đến tiến trình hoàn thành đơn hàng.
 */
@Processor(QUEUES.SHIPMENT)
export class ShipmentConsumer extends WorkerHost {
  private readonly logger = new Logger(ShipmentConsumer.name);

  constructor(private readonly orderService: OrderService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { orderId } = job.data;
    if (!orderId) return;

    this.logger.log(`Nhận sự kiện fulfillment: ${job.name} cho đơn hàng ${orderId}`);

    switch (job.name) {
      case EVENTS.GOODS_ISSUED:
        await this.orderService.onGoodsIssued(orderId, job.data.goodsIssueId);
        break;
      case EVENTS.PRINT_COMPLETED:
        await this.orderService.onPrintCompleted(orderId, job.data.printJobId);
        break;
      case EVENTS.SHIPMENT_SHIPPED:
        await this.orderService.onShipped(orderId);
        break;
      case EVENTS.SHIPMENT_DELIVERED:
        await this.orderService.onDelivered(orderId);
        break;
      default:
        // Bỏ qua các sự kiện khác
    }
  }
}
