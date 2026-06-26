import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
import { CatalogService } from '../catalog/catalog.service';
import { FulfillmentType } from '../catalog/schemas/product-variant.schema';
import { CartRepository } from './cart.repository';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import { Types } from 'mongoose';

@Injectable()
export class CartService {
  constructor(
    private readonly repo: CartRepository,
    private readonly catalog: CatalogService,
  ) {}

  async getCart(customerId: string) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }
    return this.repo.getOrCreateActive(customerId);
  }

  async addItem(customerId: string, dto: AddCartItemDto) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }

    const variant = await this.catalog.findVariantBySku(dto.sku);
    if (!variant) {
      throw new AppException('CART_VARIANT_NOT_AVAILABLE', `SKU ${dto.sku} không tồn tại`);
    }
    if (!variant.isActive) {
      throw new AppException('CART_VARIANT_NOT_AVAILABLE', 'Sản phẩm đã bị ẩn hoặc ngừng kinh doanh');
    }

    const isPrintItem = variant.fulfillmentType === FulfillmentType.CUSTOM_PRINT;

    // CUSTOM_PRINT bắt buộc kèm designFile
    if (isPrintItem && !dto.designFile) {
      throw new AppException('CART_PRINT_ITEM_REQUIRES_DESIGN');
    }

    // Verify thiết kế có thuộc về khách hàng này không
    if (dto.designId) {
      const design = await this.catalog.findDesign(dto.designId, customerId);
      if (!design) {
        throw new AppException('CATALOG_DESIGN_NOT_FOUND');
      }
    }

    const cart = await this.repo.getOrCreateActive(customerId);
    const cartId = cart._id.toString();
    const items = [...(cart.items ?? [])];
    const idx = items.findIndex((i) => i.sku === dto.sku);

    if (idx >= 0) {
      // Đã có trong giỏ → cộng dồn quantity
      items[idx] = {
        ...items[idx],
        quantity: items[idx].quantity + dto.quantity,
        unitPrice: variant.price, // cập nhật giá mới nhất
      };
    } else {
      items.push({
        sku: dto.sku,
        quantity: dto.quantity,
        isPrintItem,
        designId: dto.designId,
        designFile: dto.designFile,
        unitPrice: variant.price,
      });
    }

    // Cập nhật lastUsedAt cho design nếu tái dùng
    if (dto.designId) {
      await this.catalog.touchDesign(dto.designId);
    }

    return this.repo.saveCart(cartId, items);
  }

  async updateItem(customerId: string, sku: string, dto: UpdateCartItemDto) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }

    const cart = await this.repo.getOrCreateActive(customerId);
    const items = [...(cart.items ?? [])];
    const idx = items.findIndex((i) => i.sku === sku);
    if (idx < 0) {
      throw new AppException('CART_ITEM_NOT_FOUND');
    }

    items[idx] = { ...items[idx], quantity: dto.quantity };
    return this.repo.saveCart(cart._id.toString(), items);
  }

  async removeItem(customerId: string, sku: string) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }

    const cart = await this.repo.getOrCreateActive(customerId);
    const items = (cart.items ?? []).filter((i) => i.sku !== sku);
    return this.repo.saveCart(cart._id.toString(), items);
  }

  async clearCart(customerId: string) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }

    const cart = await this.repo.getOrCreateActive(customerId);
    return this.repo.clearCart(cart._id.toString());
  }
}
