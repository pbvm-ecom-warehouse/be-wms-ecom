import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
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
        try {
          const orderId =
            typeof data === 'object' && data !== null
              ? data.orderId
              : 'unknown';
          this.logger.log(
            `Nhận print.requested cho đơn ${orderId} → sinh PrintJob.`,
          );
          await this.printJobService.createFromPrintRequested(data);
        } catch (error: unknown) {
          const errorCode =
            typeof error === 'object' && error !== null && 'code' in error
              ? (error as { code?: unknown }).code
              : undefined;
          if (errorCode === 'VALIDATION_FAILED') {
            this.logger.error(
              `print.requested malformed cho orderId=${data?.orderId ?? 'unknown'}; không retry.`,
              error instanceof Error ? error.stack : undefined,
            );
            throw new UnrecoverableError(
              error instanceof Error
                ? error.message
                : 'print.requested malformed',
            );
          }
          throw error;
        }
        break;
      }
      default:
        this.logger.warn(`Bỏ qua job lạ trên print-queue: ${job.name}`);
    }
  }
}
