import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, PaymentStatus } from '../order/schemas/order.schema';
import { User, UserStatus } from '../auth/schemas/user.schema';
import { Product } from '../catalog/schemas/product.schema';
import { ProductVariant } from '../catalog/schemas/product-variant.schema';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariant>,
  ) {}

  async getOverview() {
    // 1. Doanh thu & tổng đơn
    const [
      revenueRes,
      totalOrders,
      totalCustomers,
      totalProducts,
      totalVariants,
      outOfStockVariants,
    ] = await Promise.all([
      this.orderModel.aggregate([
        { $match: { paymentStatus: PaymentStatus.PAID } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      this.orderModel.countDocuments(),
      this.userModel.countDocuments({
        status: UserStatus.ACTIVE,
        type: 'customer',
      }),
      this.productModel.countDocuments({ isActive: true }),
      this.variantModel.countDocuments({ isActive: true }),
      this.variantModel.countDocuments({
        isActive: true,
        availableQty: { $lte: 0 },
      }),
    ]);

    const totalRevenue = revenueRes[0]?.total ?? 0;

    // 2. Thống kê theo orderStatus
    const ordersByOrderStatusRes = await this.orderModel.aggregate([
      { $group: { _id: '$orderStatus', count: { $sum: 1 } } },
    ]);
    const ordersByOrderStatus = ordersByOrderStatusRes.map((item) => ({
      status: item._id,
      count: item.count,
    }));

    // 3. Thống kê theo paymentStatus
    const ordersByPaymentStatusRes = await this.orderModel.aggregate([
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } },
    ]);
    const ordersByPaymentStatus = ordersByPaymentStatusRes.map((item) => ({
      status: item._id,
      count: item.count,
    }));

    // 4. Thống kê theo fulfillmentStatus
    const ordersByFulfillmentStatusRes = await this.orderModel.aggregate([
      { $group: { _id: '$fulfillmentStatus', count: { $sum: 1 } } },
    ]);
    const ordersByFulfillmentStatus = ordersByFulfillmentStatusRes.map(
      (item) => ({
        status: item._id,
        count: item.count,
      }),
    );

    return {
      totalRevenue,
      totalOrders,
      totalCustomers,
      totalProducts,
      totalVariants,
      outOfStockVariants,
      ordersByOrderStatus,
      ordersByPaymentStatus,
      ordersByFulfillmentStatus,
    };
  }

  async getTopSelling(limit = 10) {
    const pipeline: any[] = [
      { $match: { paymentStatus: PaymentStatus.PAID } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.sku',
          name: { $first: '$items.name' },
          totalQuantitySold: { $sum: '$items.quantity' },
          totalRevenue: {
            $sum: { $multiply: ['$items.unitPrice', '$items.quantity'] },
          },
        },
      },
      { $sort: { totalQuantitySold: -1 } },
      { $limit: Number(limit) || 10 },
    ];

    const results = await this.orderModel.aggregate(pipeline);
    return results.map((item) => ({
      sku: item._id,
      name: item.name || item._id,
      totalQuantitySold: item.totalQuantitySold,
      totalRevenue: item.totalRevenue,
    }));
  }

  async getRevenueTimeline(fromDate?: string, toDate?: string) {
    const matchQuery: any = { paymentStatus: PaymentStatus.PAID };
    if (fromDate || toDate) {
      matchQuery.createdAt = {};
      if (fromDate)
        matchQuery.createdAt.$gte = new Date(`${fromDate}T00:00:00.000Z`);
      if (toDate)
        matchQuery.createdAt.$lte = new Date(`${toDate}T23:59:59.999Z`);
    }

    const results = await this.orderModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return results.map((item) => ({
      date: item._id,
      revenue: item.revenue,
      orderCount: item.orderCount,
    }));
  }

  async getMonthlyComparison() {
    const now = new Date();
    
    // Khởi tạo mốc thời gian cho THÁNG NÀY (Từ ngày 1 đầu tháng đến hiện tại)
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = now;

    // Khởi tạo mốc thời gian cho THÁNG TRƯỚC (Song song: ví dụ tháng này từ 1-29/7 thì tháng trước so sánh 1-29/6)
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());

    // 1. Aggregation cho Đơn hàng (Doanh thu & Số lượng đơn)
    const aggregateOrders = async (start: Date, end: Date) => {
      const res = await this.orderModel.aggregate([
        {
          $match: {
            paymentStatus: { $in: [PaymentStatus.PAID, PaymentStatus.DEPOSIT_PAID, PaymentStatus.PROGRESS_PAID] },
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total' },
            totalOrders: { $sum: 1 },
          },
        },
      ]);
      return {
        revenue: res[0]?.totalRevenue ?? 0,
        orders: res[0]?.totalOrders ?? 0,
      };
    };

    // 2. Aggregation cho Khách hàng (Đăng ký mới)
    const countNewCustomers = async (start: Date, end: Date) => {
      return this.userModel.countDocuments({
        type: 'customer',
        createdAt: { $gte: start, $lte: end },
      });
    };

    const [currentMonthData, previousMonthData, currentNewCustomers, previousNewCustomers] = await Promise.all([
      aggregateOrders(startOfCurrentMonth, endOfCurrentMonth),
      aggregateOrders(startOfPreviousMonth, endOfPreviousMonth),
      countNewCustomers(startOfCurrentMonth, endOfCurrentMonth),
      countNewCustomers(startOfPreviousMonth, endOfPreviousMonth),
    ]);

    // Tính toán AOV (Average Order Value)
    const currentAov = currentMonthData.orders > 0 ? currentMonthData.revenue / currentMonthData.orders : 0;
    const previousAov = previousMonthData.orders > 0 ? previousMonthData.revenue / previousMonthData.orders : 0;

    // Hàm tính toán % tăng trưởng
    const calculateGrowth = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 10000) / 100; // Làm tròn 2 chữ số sau dấu phẩy
    };

    return {
      revenue: {
        currentValue: currentMonthData.revenue,
        previousValue: previousMonthData.revenue,
        growthPercentage: calculateGrowth(currentMonthData.revenue, previousMonthData.revenue),
      },
      orders: {
        currentValue: currentMonthData.orders,
        previousValue: previousMonthData.orders,
        growthPercentage: calculateGrowth(currentMonthData.orders, previousMonthData.orders),
      },
      customers: {
        currentValue: currentNewCustomers,
        previousValue: previousNewCustomers,
        growthPercentage: calculateGrowth(currentNewCustomers, previousNewCustomers),
      },
      aov: {
        currentValue: Math.round(currentAov),
        previousValue: Math.round(previousAov),
        growthPercentage: calculateGrowth(currentAov, previousAov),
      },
    };
  }
}
