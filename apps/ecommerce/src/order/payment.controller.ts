import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiOkResponse,
} from '@nestjs/swagger';
import type { Webhook } from '@payos/node';
import { JwtAuthGuard, CustomerGuard } from '@app/auth';
import { PaymentService, numberToOrderCode } from './payment.service';
import { plainToInstance } from 'class-transformer';
import {
  PaymentUrlResponseDto,
  PaymentReturnResponseDto,
  PayosWebhookResponseDto,
} from './dto/payment.dto';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly svc: PaymentService) {}

  /** Tạo URL thanh toán VietQR qua PayOS — khách hàng redirect sang cổng */
  @Get('payos/create-url/:orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CustomerGuard)
  @ApiOperation({
    summary: 'Lấy URL thanh toán VietQR (PayOS) cho đơn hàng ONLINE',
  })
  @ApiParam({ name: 'orderId', example: '64abc...' })
  @ApiOkResponse({ type: PaymentUrlResponseDto })
  async createPayosUrl(@Param('orderId') orderId: string) {
    const url = await this.svc.createPayosPaymentLink(orderId);
    return plainToInstance(
      PaymentUrlResponseDto,
      { payUrl: url },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Webhook endpoint nhận tin nhắn thanh toán từ PayOS.
   */
  @Post('payos/webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'PayOS Webhook (POST server-to-server, không cần auth)',
  })
  @ApiOkResponse({ type: PayosWebhookResponseDto })
  async handlePayosWebhook(@Body() body: Webhook) {
    const res = await this.svc.handlePayosWebhook(body);
    return plainToInstance(PayosWebhookResponseDto, res, {
      excludeExtraneousValues: true,
    });
  }

  /** Redirect return page khi khách thanh toán xong trên PayOS */
  @Get('payos/return')
  @ApiOperation({
    summary: 'PayOS return URL (redirect từ cổng về, không cần auth)',
  })
  payosReturn(@Query() query: Record<string, string>, @Res() res: any) {
    const status = query['status'];
    const success = status === 'PAID';
    const orderCodeNum = query['orderCode']
      ? parseInt(query['orderCode'], 10)
      : 0;
    const orderCodeStr = orderCodeNum ? numberToOrderCode(orderCodeNum) : '';

    if (success) {
      const redirectUrl = this.svc.getSuccessRedirectUrl(orderCodeStr);
      return res.redirect(redirectUrl);
    } else {
      const redirectUrl = this.svc.getCancelRedirectUrl(orderCodeStr, true);
      return res.redirect(redirectUrl);
    }
  }

  /** Redirect cancel page khi khách hủy thanh toán trên cổng PayOS */
  @Get('payos/cancel')
  @ApiOperation({
    summary: 'PayOS cancel URL (redirect từ cổng về khi hủy)',
  })
  payosCancel(@Query() query: Record<string, string>, @Res() res: any) {
    const orderCodeNum = query['orderCode']
      ? parseInt(query['orderCode'], 10)
      : 0;
    const orderCodeStr = orderCodeNum ? numberToOrderCode(orderCodeNum) : '';

    const redirectUrl = this.svc.getCancelRedirectUrl(orderCodeStr);
    return res.redirect(redirectUrl);
  }
}
