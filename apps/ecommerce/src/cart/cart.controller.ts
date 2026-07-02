import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, CustomerGuard } from '@app/auth';
import { CartService } from './cart.service';
import {
  AddCartItemDto,
  UpdateCartItemDto,
  CartResponseDto,
} from './dto/cart.dto';
import { plainToInstance } from 'class-transformer';

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CustomerGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly svc: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Xem giỏ hàng hiện tại' })
  @ApiOkResponse({ type: CartResponseDto })
  async getCart(@CurrentUser('sub') customerId: string) {
    const cart = await this.svc.getCart(customerId);
    return plainToInstance(CartResponseDto, cart, {
      excludeExtraneousValues: true,
    });
  }

  @Post('items')
  @ApiOperation({ summary: 'Thêm sản phẩm vào giỏ hàng' })
  @ApiOkResponse({ type: CartResponseDto })
  async addItem(
    @CurrentUser('sub') customerId: string,
    @Body() dto: AddCartItemDto,
  ) {
    const cart = await this.svc.addItem(customerId, dto);
    return plainToInstance(CartResponseDto, cart, {
      excludeExtraneousValues: true,
    });
  }

  @Put('items/:sku')
  @ApiOperation({ summary: 'Cập nhật số lượng sản phẩm trong giỏ hàng' })
  @ApiParam({ name: 'sku', example: 'CUP-PP-350ML' })
  @ApiOkResponse({ type: CartResponseDto })
  async updateItem(
    @CurrentUser('sub') customerId: string,
    @Param('sku') sku: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const cart = await this.svc.updateItem(customerId, sku, dto);
    return plainToInstance(CartResponseDto, cart, {
      excludeExtraneousValues: true,
    });
  }

  @Delete('items/:sku')
  @ApiOperation({ summary: 'Xóa sản phẩm khỏi giỏ hàng' })
  @ApiParam({ name: 'sku', example: 'CUP-PP-350ML' })
  @ApiOkResponse({ type: CartResponseDto })
  async removeItem(
    @CurrentUser('sub') customerId: string,
    @Param('sku') sku: string,
  ) {
    const cart = await this.svc.removeItem(customerId, sku);
    return plainToInstance(CartResponseDto, cart, {
      excludeExtraneousValues: true,
    });
  }

  @Delete()
  @HttpCode(200)
  @ApiOperation({ summary: 'Xóa sạch giỏ hàng' })
  @ApiOkResponse({ type: CartResponseDto })
  async clearCart(@CurrentUser('sub') customerId: string) {
    const cart = await this.svc.clearCart(customerId);
    return plainToInstance(CartResponseDto, cart, {
      excludeExtraneousValues: true,
    });
  }
}
