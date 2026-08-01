import { NestFactory } from '@nestjs/core';
import { EcommerceModule } from '../ecommerce.module';
import { CheckoutService } from '../order/checkout.service';
import { OrderService } from '../order/order.service';
import { PaymentMethod } from '../order/schemas/order.schema';
import { CatalogRepository } from '../catalog/catalog.repository';
import { UserRepository } from '../auth/repositories/user.repository';

async function run() {
  const app = await NestFactory.createApplicationContext(EcommerceModule);
  
  try {
    const checkoutService = app.get(CheckoutService);
    const orderService = app.get(OrderService);
    const catalogRepo = app.get(CatalogRepository);
    const userRepo = app.get(UserRepository);

    console.log('1. Lấy thông tin khách hàng mẫu...');
    const customer = await userRepo.findActiveByEmail('seed_customer1@ecom.local');
    if (!customer) {
      console.log('Không tìm thấy seed_customer1@ecom.local. Vui lòng seed:ecom trước.');
      return;
    }
    const customerId = customer._id.toString();
    const addressId = customer.addresses[0]?._id?.toString();
    if (!addressId) {
      console.log('Khách hàng mẫu không có địa chỉ nào.');
      return;
    }

    // SKU thật đã được seed:wms đồng bộ sang
    const targetSku = 'CUP-HRT-PET-500-CLR';
    console.log(`2. Kiểm tra SKU ${targetSku} trong catalog Ecommerce...`);
    const variant = await catalogRepo.findVariantBySku(targetSku);
    if (!variant) {
      console.log(`Chưa đồng bộ SKU ${targetSku} sang Ecommerce. Vui lòng seed WMS trước.`);
      return;
    }

    console.log(`3. Thực hiện checkout mua ngay sản phẩm ${targetSku}...`);
    const order = await checkoutService.checkout(customerId, {
      paymentMethod: PaymentMethod.ONLINE,
      addressId,
      directItem: {
        sku: targetSku,
        quantity: 2,
      }
    });
    console.log(`Checkout thành công! Mã đơn: ${order.code}, ID: ${order._id}`);

    console.log('4. Giả lập thanh toán 100% qua manualPayment...');
    await orderService.onPaymentSuccess(
      order._id.toString(),
      `TXN_E2E_TEST_${Date.now()}`,
      order.total,
      'MANUAL_ADMIN',
      { reason: 'Test tự động đồng bộ' }
    );
    console.log('Thanh toán thành công! Trạng thái đơn đã cập nhật. Đang chờ 5s để queue xử lý...');
    
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log('Hoàn tất test E2E. Hãy kiểm tra goods_issues collection trong WMS DB.');

  } catch (err) {
    console.error('Lỗi chạy test E2E:', err);
  } finally {
    await app.close();
  }
}

run();
