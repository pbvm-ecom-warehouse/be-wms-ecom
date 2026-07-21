import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Query,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  JwtAuthGuard,
  CustomerGuard,
  Roles,
  RolesGuard,
  EcomRole,
} from '@app/auth';
import { CheckoutService } from './checkout.service';
import { OrderService } from './order.service';
import { CheckoutDto } from './dto/checkout.dto';
import {
  CancelOrderDto,
  OrderFilterQueryDto,
  OrderResponseDto,
  SuccessResponseDto,
} from './dto/order.dto';
import { plainToInstance } from 'class-transformer';
import { Types } from 'mongoose';
import { AppException } from '@app/common';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CustomerGuard)
@Controller('orders')
export class OrderController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly orderService: OrderService,
  ) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Đặt hàng từ giỏ hàng hiện tại' })
  @ApiOkResponse({ type: OrderResponseDto })
  async checkout(
    @CurrentUser('sub') customerId: string,
    @Body() dto: CheckoutDto,
  ) {
    const order = await this.checkoutService.checkout(customerId, dto);
    return plainToInstance(OrderResponseDto, order, {
      excludeExtraneousValues: true,
    });
  }

  @Get()
  @ApiOperation({
    summary:
      'Lấy lịch sử đơn hàng của tôi (hỗ trợ lọc orderStatus, paymentStatus, fulfillmentStatus)',
  })
  @ApiOkResponse({ type: [OrderResponseDto] })
  async getMyOrders(
    @CurrentUser('sub') customerId: string,
    @Query() query: OrderFilterQueryDto,
  ) {
    const orders = await this.orderService.listByCustomer(customerId, query);
    return plainToInstance(OrderResponseDto, orders, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết đơn hàng' })
  @ApiParam({ name: 'id', description: 'ID đơn hàng' })
  @ApiOkResponse({ type: OrderResponseDto })
  async getOrderDetail(
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID đơn hàng không hợp lệ');
    }
    const order = await this.orderService.findById(id);
    if (order.customerId.toString() !== customerId) {
      throw new AppException(
        'FORBIDDEN',
        'Bạn không có quyền xem đơn hàng này',
      );
    }
    return plainToInstance(OrderResponseDto, order, {
      excludeExtraneousValues: true,
    });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Hủy đơn hàng' })
  @ApiParam({ name: 'id', description: 'ID đơn hàng' })
  @ApiOkResponse({ type: SuccessResponseDto })
  async cancelOrder(
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID đơn hàng không hợp lệ');
    }
    const order = await this.orderService.findById(id);
    if (order.customerId.toString() !== customerId) {
      throw new AppException(
        'FORBIDDEN',
        'Bạn không có quyền thao tác trên đơn hàng này',
      );
    }
    await this.orderService.cancelOrder(id, dto.reason);
    return plainToInstance(SuccessResponseDto, {
      message: 'Hủy đơn hàng thành công',
    });
  }

  @Post(':id/return')
  @HttpCode(200)
  @ApiOperation({ summary: 'Yêu cầu trả hàng' })
  @ApiParam({ name: 'id', description: 'ID đơn hàng' })
  @ApiOkResponse({ type: OrderResponseDto })
  async returnOrder(
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID đơn hàng không hợp lệ');
    }
    const order = await this.orderService.returnOrder(id, customerId);
    return plainToInstance(OrderResponseDto, order, {
      excludeExtraneousValues: true,
    });
  }
}

/** Admin routes — cần JWT và role ECOM_MANAGER */
@ApiTags('admin-orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(EcomRole.ECOM_MANAGER)
@Controller('admin/orders')
export class OrderAdminController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiOperation({
    summary:
      '[Admin] Lấy tất cả đơn hàng (hỗ trợ lọc orderStatus, paymentStatus, fulfillmentStatus)',
  })
  @ApiOkResponse({ type: [OrderResponseDto] })
  async getAllOrders(@Query() query: OrderFilterQueryDto) {
    const orders = await this.orderService.listAll(query);
    return plainToInstance(OrderResponseDto, orders, {
      excludeExtraneousValues: true,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '[Admin] Chi tiết đơn hàng bất kỳ' })
  @ApiParam({ name: 'id', description: 'ID đơn hàng' })
  @ApiOkResponse({ type: OrderResponseDto })
  async getOrderDetail(@Param('id') id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID đơn hàng không hợp lệ');
    }
    const order = await this.orderService.findById(id);
    return plainToInstance(OrderResponseDto, order, {
      excludeExtraneousValues: true,
    });
  }
}
