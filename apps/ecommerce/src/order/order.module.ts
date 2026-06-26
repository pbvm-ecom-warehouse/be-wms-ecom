import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '@app/events';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { Order, OrderSchema } from './schemas/order.schema';
import { PaymentTransaction, PaymentTransactionSchema } from './schemas/payment-transaction.schema';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { CheckoutService } from './checkout.service';
import { PaymentService } from './payment.service';
import { OrderController } from './order.controller';
import { PaymentController } from './payment.controller';
import { ReserveConsumer } from './reserve.consumer';
import { ShipmentConsumer } from './order.consumer';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
    ]),
    BullModule.registerQueue(
      { name: QUEUES.ORDER },
      { name: QUEUES.SHIPMENT },
    ),
    AuthModule,
    CartModule,
  ],
  controllers: [OrderController, PaymentController],
  providers: [
    OrderRepository,
    OrderService,
    CheckoutService,
    PaymentService,
    ReserveConsumer,
    ShipmentConsumer,
  ],
  exports: [OrderService, CheckoutService, PaymentService],
})
export class OrderModule {}
