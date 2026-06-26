import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard, CustomerGuard } from '@app/auth';
import { PaymentService } from './payment.service';
import { plainToInstance } from 'class-transformer';
import {
  PaymentUrlResponseDto,
  PaymentReturnResponseDto,
  VnpayIpnResponseDto,
} from './dto/payment.dto';

@ApiTags('payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly svc: PaymentService) {}

  /** Tạo URL thanh toán VNPay sandbox — khách hàng redirect sang cổng */
  @Get('vnpay/create-url/:orderId')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, CustomerGuard)
  @ApiOperation({ summary: 'Lấy URL thanh toán VNPay cho đơn hàng ONLINE' })
  @ApiParam({ name: 'orderId', example: '64abc...' })
  @ApiOkResponse({ type: PaymentUrlResponseDto })
  async createVnpayUrl(@Param('orderId') orderId: string, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string) ?? req.socket.remoteAddress ?? '127.0.0.1';
    const cleanIp = ip.split(',')[0].trim();
    const url = await this.svc.createVnpayUrl(orderId, cleanIp);
    return plainToInstance(
      PaymentUrlResponseDto,
      { payUrl: url },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * IPN Webhook endpoint — VNPay gọi server-to-server sau khi thanh toán.
   */
  @Get('vnpay/ipn')
  @ApiOperation({ summary: 'VNPay IPN webhook (server-to-server, không cần auth)' })
  @ApiOkResponse({ type: VnpayIpnResponseDto })
  async handleVnpayIpn(@Query() query: Record<string, string>) {
    const res = await this.svc.handleVnpayIpn(query);
    return plainToInstance(VnpayIpnResponseDto, res, { excludeExtraneousValues: true });
  }

  /** Redirect return page — VNPay redirect trình duyệt của khách hàng về sau khi thanh toán xong */
  @Get('vnpay/return')
  @ApiOperation({ summary: 'VNPay return URL (redirect từ cổng về, không cần auth)' })
  @ApiOkResponse({ type: PaymentReturnResponseDto })
  vnpayReturn(@Query() query: Record<string, string>) {
    const success = query['vnp_ResponseCode'] === '00';
    const payload = {
      success,
      orderCode: query['vnp_TxnRef'] ?? '',
      message: success ? 'Thanh toán đơn hàng thành công' : 'Thanh toán đơn hàng thất bại',
    };
    return plainToInstance(PaymentReturnResponseDto, payload, { excludeExtraneousValues: true });
  }
}
