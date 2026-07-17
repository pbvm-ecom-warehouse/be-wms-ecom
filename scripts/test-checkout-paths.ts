import { NestFactory } from '@nestjs/core';
import { EcommerceModule } from '../apps/ecommerce/src/ecommerce.module';
import { CheckoutService } from '../apps/ecommerce/src/order/checkout.service';
import { PaymentMethod } from '../apps/ecommerce/src/order/schemas/order.schema';
import { getConnectionToken } from '@nestjs/mongoose';
import { Types, Connection } from 'mongoose';

async function run() {
  console.log('Bootstrapping EcommerceModule for checkout test...');
  const app = await NestFactory.createApplicationContext(EcommerceModule);
  const checkoutSvc = app.get(CheckoutService);
  const db = app.get<Connection>(getConnectionToken());

  // Find a user with addresses
  const user = await db.collection('users').findOne({ type: 'customer' });
  if (!user) {
    console.error('No customer user found!');
    await app.close();
    return;
  }

  // Ensure they have a default address
  let addressId = user.addresses?.[0]?._id?.toString();
  if (!addressId) {
    console.log('Customer has no address, creating one...');
    const newAddrId = new Types.ObjectId();
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $push: {
          addresses: {
            _id: newAddrId,
            label: 'Home',
            recipientName: 'Nguyen Van A',
            phone: '0901234567',
            line: '123 Test St',
            ward: 'Ward 1',
            district: 'District 1',
            province: 'Ho Chi Minh',
            isDefault: true,
          }
        }
      } as any
    );
    addressId = newAddrId.toString();
  }

  // Ensure they have items in cart
  const cart = await db.collection('carts').findOne({ customerId: user._id });
  if (!cart || !cart.items || cart.items.length === 0) {
    console.log('Cart is empty, adding a dummy item...');
    const variant = await db.collection('product_variants').findOne({ isActive: true });
    if (!variant) {
      console.error('No active variant found to add to cart!');
      await app.close();
      return;
    }
    await db.collection('carts').updateOne(
      { customerId: user._id },
      {
        $set: {
          items: [{
            sku: variant.sku,
            quantity: 1,
            unitPrice: variant.price,
            isPrintItem: false,
          }]
        }
      } as any,
      { upsert: true }
    );
  }

  console.log(`Running checkout for customerId=${user._id.toString()}, addressId=${addressId}...`);
  try {
    const res = await checkoutSvc.checkout(user._id.toString(), {
      addressId,
      paymentMethod: PaymentMethod.ONLINE,
    });
    console.log('Checkout result:', res);
  } catch (err) {
    console.error('CHECKOUT EXCEPTION ENCOUNTERED:');
    console.error(err);
  }

  await app.close();
}

run().catch(console.error);
