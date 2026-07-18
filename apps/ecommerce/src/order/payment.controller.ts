import { Controller, Get, Post, Param, Query, Body, HttpCode, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiOkResponse,
} from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Lấy URL thanh toán VietQR (PayOS) cho đơn hàng ONLINE' })
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
  async handlePayosWebhook(@Body() body: any) {
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
  @ApiOkResponse({ type: PaymentReturnResponseDto })
  payosReturn(@Query() query: Record<string, string>) {
    const status = query['status'];
    const success = status === 'PAID';
    const orderCodeNum = query['orderCode'] ? parseInt(query['orderCode'], 10) : 0;
    const orderCodeStr = orderCodeNum ? numberToOrderCode(orderCodeNum) : '';

    const payload = {
      success,
      orderCode: orderCodeStr,
      message: success
        ? 'Thanh toán đơn hàng thành công'
        : 'Thanh toán đơn hàng thất bại hoặc đã hủy',
    };
    return plainToInstance(PaymentReturnResponseDto, payload, {
      excludeExtraneousValues: true,
    });
  }

  /** Redirect cancel page khi khách hủy thanh toán trên cổng PayOS */
  @Get('payos/cancel')
  @ApiOperation({
    summary: 'PayOS cancel URL (redirect từ cổng về khi hủy)',
  })
  @ApiOkResponse({ type: PaymentReturnResponseDto })
  payosCancel(@Query() query: Record<string, string>) {
    const orderCodeNum = query['orderCode'] ? parseInt(query['orderCode'], 10) : 0;
    const orderCodeStr = orderCodeNum ? numberToOrderCode(orderCodeNum) : '';

    const payload = {
      success: false,
      orderCode: orderCodeStr,
      message: 'Người dùng hủy thanh toán đơn hàng',
    };
    return plainToInstance(PaymentReturnResponseDto, payload, {
      excludeExtraneousValues: true,
    });
  }
}
