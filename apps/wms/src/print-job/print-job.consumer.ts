import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EVENTS, QUEUES, type PrintRequestedPayload } from '@app/events';
import { PrintJobService } from './print-job.service';

/**
 * Consumer nhận print.requested (Ecom→WMS) — tự sinh PrintJob (UC-04).
 * Đơn có ly-in CUSTOM_PRINT sau khi payment.success (PAID) bắn event này.
 */
@Processor(QUEUES.PRINT)
export class PrintJobConsumer extends WorkerHost {
  private readonly logger = new Logger(PrintJobConsumer.name);

  constructor(private readonly printJobService: PrintJobService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EVENTS.PRINT_REQUESTED: {
        const data = job.data as PrintRequestedPayload;
        this.logger.log(
          `Nhận print.requested cho đơn ${data.orderId} → sinh PrintJob.`,
        );
        await this.printJobService.createFromPrintRequested(
          data.orderId,
          data.warehouseId,
          data.items,
        );
        break;
      }
      default:
        this.logger.warn(`Bỏ qua job lạ trên print-queue: ${job.name}`);
    }
  }
}
