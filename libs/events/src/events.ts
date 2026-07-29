/**
 * Danh mục event đồng bộ giữa các app (BullMQ + Redis).
 * Nguồn: docs/overview/data-ownership.md (bảng "Các event đồng bộ").
 *
 * Mỗi event = 1 job name trên 1 queue. Producer ở app sở hữu nghiệp vụ,
 * consumer ở app nhận. KHÔNG đọc chéo DB — chỉ truyền payload tối thiểu (sku + id tham chiếu).
 */

/** Tên các queue BullMQ (nhóm theo miền nghiệp vụ). */
export const QUEUES = {
  STOCK: 'stock-queue', // tồn kho: WMS → Ecommerce
  ORDER: 'order-queue', // đơn hàng: Ecommerce ↔ WMS
  ORDER_REPLY: 'order-reply-queue', // phản hồi giữ tồn: WMS → Ecommerce
  PRINT: 'print-queue', // in ly: Ecommerce ↔ WMS
  SHIPMENT: 'shipment-queue', // vận đơn: WMS → Ecommerce
  SHIPMENT_INTERNAL: 'shipment-internal-queue', // goods.issued → Shipment{PENDING} nội bộ WMS (tách khỏi SHIPMENT để tránh 2 worker cùng nhận goods.issued — xem ORDER_REPLY cho tiền lệ)
  NOTIFICATION: 'notification-queue', // thông báo: * → Notification
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Tên event (job name trong queue tương ứng). */
export const EVENTS = {
  // ----- Tồn kho (WMS → Ecommerce) -----
  STOCK_CHANGED: 'stock.changed',
  STOCK_EXPIRED: 'stock.expired',
  ITEM_CREATED: 'warehouse_item.created',
  // ----- Reserve theo saga (Ecommerce → WMS → Ecommerce) -----
  // Vì đồng bộ bằng event (không transaction xuyên DB), reserve lúc checkout là bất đồng bộ:
  STOCK_RESERVE_REQUESTED: 'stock.reserve_requested', // Ecom → WMS
  STOCK_RESERVED: 'stock.reserved', // WMS → Ecom (giữ tồn ok)
  STOCK_RESERVE_FAILED: 'stock.reserve_failed', // WMS → Ecom (không đủ → hủy đơn)
  // ----- Đơn hàng -----
  ORDER_READY_TO_FULFILL: 'order.ready_to_fulfill', // Ecom → WMS (sinh GoodsIssue)
  ORDER_CANCELLED: 'order.cancelled', // Ecom → WMS
  ORDER_RETURNED: 'order.returned', // Ecom → WMS
  GOODS_ISSUED: 'goods.issued', // WMS → Ecom
  // ----- In ly -----
  PRINT_REQUESTED: 'print.requested', // Ecom → WMS
  PRINT_COMPLETED: 'print.completed', // WMS → Ecom
  // ----- Vận đơn (WMS → Ecommerce / Notification) -----
  SHIPMENT_SHIPPED: 'shipment.shipped',
  SHIPMENT_DELIVERED: 'shipment.delivered',
  SHIPMENT_RETURNED: 'shipment.returned',
  // ----- Thông báo (* → Notification) -----
  STOCK_LOW: 'stock.low',
  STOCK_NEAR_EXPIRY: 'stock.near_expiry',
  PAYMENT_SUCCESS: 'payment.success',
  CUSTOMER_VERIFY_REQUESTED: 'customer.verify_requested',
  CUSTOMER_PASSWORD_RESET_REQUESTED: 'customer.password_reset_requested',
  CUSTOMER_GOOGLE_REGISTERED: 'customer.google_registered',
  NEW_ITEM_SYNCED: 'new_item.synced',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// ===================== PAYLOADS =====================

/** delta>0 tăng tồn, delta<0 giảm tồn. Link 2 app DUY NHẤT qua sku. */
export interface StockChangedPayload {
  sku: string;
  delta: number;
}

export interface StockExpiredPayload {
  sku: string;
  delta: number; // số lượng rơi vào expired (âm trên available)
}

export interface StockReserveRequestedPayload {
  orderId: string;
  items: { sku: string; quantity: number }[];
}

export interface StockReservedPayload {
  orderId: string;
}

export interface StockReserveFailedPayload {
  orderId: string;
  reason: string;
  failedSkus: string[];
}

export interface OrderReadyToFulfillPayload {
  orderId: string;
  items: { sku: string; quantity: number }[];
  shippingAddress: Record<string, unknown>;
  recipient: { name: string; phone: string };
  paymentMethod: 'COD' | 'ONLINE';
  codAmount?: number;
  orderDetail?: Record<string, any>;
}

export interface OrderCancelledPayload {
  orderId: string;
  reason?: string;
}

export interface OrderReturnedPayload {
  orderId: string;
  items: { sku: string; quantity: number }[];
}

export interface GoodsIssuedPayload {
  orderId: string;
  goodsIssueId: string;
}

export interface PrintRequestedPayload {
  orderId: string;
  items: {
    sku: string;
    quantity: number;
    designFile?: string;
    blankSku?: string;
  }[];
  /** Toàn bộ thông tin đơn hàng từ Ecom — để WMS có đủ context khi tạo lệnh in */
  orderDetail?: Record<string, any>;
  /** true = in bản mẫu, false = in chính thức */
  isSample?: boolean;
}

export interface PrintCompletedPayload {
  orderId: string;
  printJobId: string;
}

export interface ShipmentEventPayload {
  orderId: string;
  shipmentId: string;
  trackingNumber?: string;
}

export interface StockLowPayload {
  sku: string;
  available: number;
  minQuantity: number;
}

export interface StockNearExpiryPayload {
  sku: string;
  lotNumber: string;
  expiryDate: string;
}

export interface PaymentSuccessPayload {
  orderId: string;
  customerId?: string;
  customerEmail: string;
  amount: number;
}

export interface CustomerEmailActionPayload {
  customerId: string;
  email: string;
  code: string; // mã OTP 6 số (plaintext, chỉ để notification ghép vào email)
}

export interface WarehouseItemCreatedPayload {
  sku: string;
  name: string;
  type: string; // ItemType
  unit: string;
  initialQty: number;
  attributes: {
    code: string;
    value: string;
    name: string;
  }[];
}

/** Bản đồ event → payload (giúp producer/consumer type-safe). */
export interface EventPayloadMap {
  [EVENTS.STOCK_CHANGED]: StockChangedPayload;
  [EVENTS.STOCK_EXPIRED]: StockExpiredPayload;
  [EVENTS.ITEM_CREATED]: WarehouseItemCreatedPayload;
  [EVENTS.STOCK_RESERVE_REQUESTED]: StockReserveRequestedPayload;
  [EVENTS.STOCK_RESERVED]: StockReservedPayload;
  [EVENTS.STOCK_RESERVE_FAILED]: StockReserveFailedPayload;
  [EVENTS.ORDER_READY_TO_FULFILL]: OrderReadyToFulfillPayload;
  [EVENTS.ORDER_CANCELLED]: OrderCancelledPayload;
  [EVENTS.ORDER_RETURNED]: OrderReturnedPayload;
  [EVENTS.GOODS_ISSUED]: GoodsIssuedPayload;
  [EVENTS.PRINT_REQUESTED]: PrintRequestedPayload;
  [EVENTS.PRINT_COMPLETED]: PrintCompletedPayload;
  [EVENTS.SHIPMENT_SHIPPED]: ShipmentEventPayload;
  [EVENTS.SHIPMENT_DELIVERED]: ShipmentEventPayload;
  [EVENTS.SHIPMENT_RETURNED]: ShipmentEventPayload;
  [EVENTS.STOCK_LOW]: StockLowPayload;
  [EVENTS.STOCK_NEAR_EXPIRY]: StockNearExpiryPayload;
  [EVENTS.PAYMENT_SUCCESS]: PaymentSuccessPayload;
  [EVENTS.CUSTOMER_VERIFY_REQUESTED]: CustomerEmailActionPayload;
  [EVENTS.CUSTOMER_PASSWORD_RESET_REQUESTED]: CustomerEmailActionPayload;
  [EVENTS.CUSTOMER_GOOGLE_REGISTERED]: CustomerGoogleRegisteredPayload;
  [EVENTS.NEW_ITEM_SYNCED]: NewItemSyncedPayload;
}

export interface NewItemSyncedPayload {
  sku: string;
  name: string;
}

export interface CustomerGoogleRegisteredPayload {
  customerId: string;
  email: string;
  password?: string;
}
