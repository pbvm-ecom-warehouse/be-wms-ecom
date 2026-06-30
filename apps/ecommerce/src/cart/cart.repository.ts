import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cart, CartStatus } from './schemas/cart.schema';

@Injectable()
export class CartRepository {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<Cart>,
  ) {}

  /** Lấy giỏ ACTIVE của khách, tạo mới nếu chưa có */
  async getOrCreateActive(
    customerId: string,
  ): Promise<Cart & { _id: Types.ObjectId }> {
    const existing = await this.cartModel
      .findOne({
        customerId: new Types.ObjectId(customerId),
        status: CartStatus.ACTIVE,
      })
      .lean();
    if (existing) return existing;
    const created = await this.cartModel.create({
      customerId: new Types.ObjectId(customerId),
    });
    return created.toObject();
  }

  async saveCart(cartId: string, items: Cart['items']) {
    return this.cartModel
      .findByIdAndUpdate(cartId, { items }, { new: true })
      .lean();
  }

  async markConverted(cartId: string) {
    return this.cartModel
      .findByIdAndUpdate(
        cartId,
        { status: CartStatus.CONVERTED },
        { new: true },
      )
      .lean();
  }

  async clearCart(cartId: string) {
    return this.cartModel
      .findByIdAndUpdate(cartId, { items: [] }, { new: true })
      .lean();
  }
}
