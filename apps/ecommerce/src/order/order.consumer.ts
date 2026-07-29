import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import {
  EVENTS,
  QUEUES,
  GoodsIssuedPayload,
  PrintCompletedPayload,
  ShipmentEventPayload,
} from '@app/events';
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
    switch (job.name) {
      case EVENTS.GOODS_ISSUED: {
        const data = job.data as GoodsIssuedPayload;
        if (!data.orderId) return;
        this.logger.log(
          `Nhận sự kiện fulfillment: ${job.name} cho đơn hàng ${data.orderId}`,
        );
        await this.orderService.onGoodsIssued(data.orderId, data.goodsIssueId);
        break;
      }
      case EVENTS.PRINT_COMPLETED: {
        const data = job.data as PrintCompletedPayload;
        if (!data.orderId) return;
        this.logger.log(
          `Nhận sự kiện fulfillment: ${job.name} cho đơn hàng ${data.orderId}`,
        );
        await this.orderService.onPrintCompleted(data.orderId, data.printJobId, data.proofImage);
        break;
      }
      case EVENTS.SHIPMENT_SHIPPED: {
        const data = job.data as ShipmentEventPayload;
        if (!data.orderId) return;
        this.logger.log(
          `Nhận sự kiện fulfillment: ${job.name} cho đơn hàng ${data.orderId}`,
        );
        await this.orderService.onShipped(data.orderId);
        break;
      }
      case EVENTS.SHIPMENT_DELIVERED: {
        const data = job.data as ShipmentEventPayload;
        if (!data.orderId) return;
        this.logger.log(
          `Nhận sự kiện fulfillment: ${job.name} cho đơn hàng ${data.orderId}`,
        );
        await this.orderService.onDelivered(data.orderId);
        break;
      }
      case EVENTS.SHIPMENT_RETURNED: {
        const data = job.data as ShipmentEventPayload;
        if (!data.orderId) return;
        this.logger.log(
          `Nhận sự kiện fulfillment: ${job.name} cho đơn hàng ${data.orderId}`,
        );
        await this.orderService.onReturned(data.orderId);
        break;
      }
      default:
      // Bỏ qua các sự kiện khác
    }
  }
}
