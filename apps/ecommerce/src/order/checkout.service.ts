import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUES, EVENTS } from '@app/events';
import { AppException } from '@app/common';
import { CartService } from '../cart/cart.service';
import { OrderRepository } from './order.repository';
import { CheckoutDto } from './dto/checkout.dto';
import { UserRepository } from '../auth/repositories/user.repository';
import { CacheService } from '../cache/cache.service';
import { CatalogService } from '../catalog/catalog.service';
import { FulfillmentType } from '../catalog/schemas/product-variant.schema';
import {
  FulfillmentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from './schemas/order.schema';
import { Types } from 'mongoose';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly cartService: CartService,
    private readonly orderRepo: OrderRepository,
    private readonly userRepo: UserRepository,
    private readonly config: ConfigService,
    @InjectQueue(QUEUES.ORDER) private readonly orderQueue: Queue,
    private readonly cacheService: CacheService,
    private readonly catalogService: CatalogService,
  ) {}

  async checkout(customerId: string, dto: CheckoutDto) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }

    // 1. Xác định danh sách sản phẩm chuẩn bị mua (itemsToBuy) và hasPrintItems
    let itemsToBuy: {
      sku: string;
      quantity: number;
      unitPrice: number;
      isPrintItem: boolean;
      designFile?: string;
      designId?: string;
    }[] = [];

    let hasPrintItems = false;

    if (dto.directItem) {
      // LUỒNG 1: MUA NGAY TRỰC TIẾP (Bỏ qua giỏ hàng, chỉ dùng cho ly in)
      const variant = await this.catalogService.findVariantBySku(
        dto.directItem.sku,
      );
      if (!variant) {
        throw new AppException(
          'CART_VARIANT_NOT_AVAILABLE',
          `SKU ${dto.directItem.sku} không tồn tại`,
        );
      }
      if (!variant.isActive) {
        throw new AppException(
          'CART_VARIANT_NOT_AVAILABLE',
          'Sản phẩm đã bị ẩn hoặc ngừng kinh doanh',
        );
      }

      // Chỉ metadata server-side của variant được quyết định đây là hàng in.
      // Client không thể biến một SKU thường thành CUP_BLANK bằng cách tự gắn
      // designFile/designId vào request.
      const isPrintItem =
        variant.fulfillmentType === FulfillmentType.CUSTOM_PRINT;
      if (
        !isPrintItem &&
        (dto.directItem.designFile || dto.directItem.designId)
      ) {
        throw new AppException(
          'VALIDATION_FAILED',
          'Chỉ sản phẩm CUSTOM_PRINT mới được đính kèm thiết kế',
        );
      }

      let designFile: string | undefined;
      if (isPrintItem) {
        designFile = dto.directItem.designFile?.trim();
        if (dto.directItem.designId) {
          if (!Types.ObjectId.isValid(dto.directItem.designId)) {
            throw new AppException(
              'VALIDATION_FAILED',
              'ID mẫu thiết kế không hợp lệ',
            );
          }
          const design = await this.catalogService.findDesign(
            dto.directItem.designId,
            customerId,
          );
          if (!design) {
            throw new AppException('CATALOG_DESIGN_NOT_FOUND');
          }
          designFile = design.file;
        }
      }
      if (isPrintItem && !designFile) {
        throw new AppException('CART_PRINT_ITEM_REQUIRES_DESIGN');
      }

      itemsToBuy = [
        {
          sku: dto.directItem.sku,
          quantity: dto.directItem.quantity,
          unitPrice: variant.price,
          isPrintItem,
          designFile,
          designId: dto.directItem.designId,
        },
      ];
      hasPrintItems = isPrintItem;
    } else {
      // LUỒNG 2: THANH TOÁN TỪ GIỎ HÀNG (Mua toàn bộ hoặc chọn lọc)
      const cart = await this.cartService.getCart(customerId);
      if (!cart.items || cart.items.length === 0) {
        throw new AppException('CART_EMPTY');
      }

      if (dto.items && dto.items.length > 0) {
        // Mua một phần giỏ hàng (selected items)
        for (const sel of dto.items) {
          const cartItem = cart.items.find(
            (i) =>
              i.sku === sel.sku &&
              (i.designFile ?? '') === (sel.designFile ?? '') &&
              (i.designId?.toString() ?? '') === (sel.designId ?? ''),
          );
          if (!cartItem) {
            throw new AppException(
              'VALIDATION_FAILED',
              `Sản phẩm với SKU ${sel.sku} không tồn tại hoặc không khớp thông tin thiết kế trong giỏ hàng`,
            );
          }
          itemsToBuy.push({
            sku: cartItem.sku,
            quantity: cartItem.quantity,
            unitPrice: cartItem.unitPrice,
            isPrintItem: cartItem.isPrintItem,
            designFile: cartItem.designFile,
            designId: cartItem.designId,
          });
        }
      } else {
        // Mua toàn bộ giỏ hàng
        itemsToBuy = cart.items.map((i) => ({
          sku: i.sku,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          isPrintItem: i.isPrintItem,
          designFile: i.designFile,
          designId: i.designId,
        }));
      }

      hasPrintItems = itemsToBuy.some((i) => i.isPrintItem);
    }

    // 2. Ràng buộc: Ly in bắt buộc thanh toán riêng biệt, không đi kèm sản phẩm nào khác
    if (hasPrintItems) {
      if (itemsToBuy.length > 1) {
        throw new AppException(
          'VALIDATION_FAILED',
          'Sản phẩm in ấn phải được thanh toán riêng biệt, không đi kèm sản phẩm khác.',
        );
      }
    }

    // Bắt buộc thanh toán ONLINE cho các đơn có ly in custom
    if (hasPrintItems && dto.paymentMethod === PaymentMethod.COD) {
      throw new AppException('ORDER_PRINT_ITEM_REQUIRES_PREPAYMENT');
    }

    // Kiểm tra và lấy địa chỉ giao nhận của khách
    const customer = await this.userRepo.findActiveById(customerId);
    if (!customer) {
      throw new AppException(
        'UNAUTHENTICATED',
        'Khách hàng không hoạt động hoặc không tồn tại',
      );
    }

    const address = customer.addresses.find(
      (addr) => addr._id?.toString() === dto.addressId,
    );
    if (!address) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Địa chỉ giao hàng không tồn tại trong sổ địa chỉ',
      );
    }

    const shippingAddress = {
      recipientName: address.recipientName,
      phone: address.phone,
      line: address.line,
      ward: address.ward,
      district: address.district,
      province: address.province,
    };

    // Tính toán tiền hàng
    const subtotal = itemsToBuy.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const shippingFee = 0; // Mặc định miễn phí giao hàng v1
    const total = subtotal + shippingFee;

    const deadlineMinutes = parseInt(
      String(this.config.get('PAYMENT_DEADLINE_MINUTES') ?? '30'),
      10,
    );
    const paymentDeadline =
      dto.paymentMethod === PaymentMethod.ONLINE
        ? new Date(
            Date.now() +
              (Number.isNaN(deadlineMinutes) ? 30 : deadlineMinutes) *
                60 *
                1000,
          )
        : null;

    const code = await this.orderRepo.generateOrderCode();

    // Tạo đơn hàng ở dạng tạm thời (optimistic)
    const order = await this.orderRepo.createOrder({
      code,
      customerId: new Types.ObjectId(customerId),
      items: itemsToBuy.map((i) => ({
        orderItemId: new Types.ObjectId().toString(),
        sku: i.sku,
        name: i.sku, // v1: dùng sku làm tên
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        isPrintItem: i.isPrintItem,
        designFile: i.designFile,
        designId: i.designId,
        // CUSTOM_PRINT.sku là SKU CUP_BLANK do WMS quản lý. Snapshot
        // server-side để event in không tin dữ liệu blankSku từ client.
        blankSku: i.isPrintItem ? i.sku : undefined,
      })),
      shippingAddress,
      subtotal,
      shippingFee,
      total,
      paymentMethod: dto.paymentMethod,
      paymentStatus: PaymentStatus.UNPAID,
      orderStatus: OrderStatus.PLACED,
      fulfillmentStatus: FulfillmentStatus.NONE,
      hasPrintItems,
      paymentDeadline,
      placedAt: new Date(),
    });

    // 3. Xử lý xóa sản phẩm đã mua khỏi giỏ hàng
    if (!dto.directItem) {
      if (dto.items && dto.items.length > 0) {
        // Chỉ xóa các item được chọn
        await this.cartService.removeItems(customerId, dto.items);
      } else {
        // Xóa sạch giỏ hàng
        await this.cartService.clearCart(customerId);
      }
    }

    // Hàng thường được GoodsIssue xuất đúng SKU đã reserve tại checkout.
    // CUSTOM_PRINT lại xuất printedSku; blankSku do từng PrintJob SAMPLE /
    // PRODUCTION tự reserve để không giữ trùng và không tạo reservation mồ côi.
    const reservableItems = itemsToBuy.filter((item) => !item.isPrintItem);
    if (reservableItems.length > 0) {
      await this.orderQueue.add(EVENTS.STOCK_RESERVE_REQUESTED, {
        orderId: order._id.toString(),
        items: reservableItems.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
        })),
      });
    }

    this.logger.log(
      reservableItems.length > 0
        ? `Đặt đơn tạm thời thành công: ${code} -> Chờ WMS giữ kho`
        : `Đặt đơn in tạm thời thành công: ${code} -> Chờ thanh toán để tạo lệnh in`,
    );

    // Thiết lập tiến trình tự động hủy đơn hàng ONLINE sau 30 phút nếu chưa trả tiền
    if (dto.paymentMethod === PaymentMethod.ONLINE) {
      const delayMs =
        (Number.isNaN(deadlineMinutes) ? 30 : deadlineMinutes) * 60 * 1000;
      await this.orderQueue.add(
        'auto.cancel',
        { orderId: order._id.toString() },
        {
          delay: delayMs,
          jobId: `auto-cancel-${order._id.toString()}`,
        },
      );
    }

    return order;
  }
}
