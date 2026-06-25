import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { ReactElement } from 'react';

interface SendArgs {
  to: string;
  subject: string;
  react: ReactElement;
  idempotencyKey: string; // = job.id → Resend dedupe khi BullMQ retry
}

/** Bọc Resend SDK. Tắt mềm khi thiếu config để dev không cần Resend vẫn chạy. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from?: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('RESEND_API_KEY');
    this.from = config.get<string>('RESEND_FROM');
    this.resend = apiKey ? new Resend(apiKey) : null;
    if (!this.isEnabled()) {
      this.logger.warn('Email tat — can RESEND_API_KEY + RESEND_FROM.');
    }
  }

  isEnabled(): boolean {
    return this.resend !== null && !!this.from;
  }

  async send({ to, subject, react, idempotencyKey }: SendArgs): Promise<void> {
    if (!this.resend || !this.from) {
      this.logger.warn(`Bo gui email "${subject}" -> ${to} (email tat).`);
      return;
    }
    await this.resend.emails.send(
      { from: this.from, to, subject, react },
      { idempotencyKey },
    );
  }
}
