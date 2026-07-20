import { Types } from 'mongoose';

/**
 * Actor giả cho các StockMovement tự sinh từ event (không có nhân viên WMS
 * nào thao tác trực tiếp — checkout/hủy đơn khởi phát từ khách hàng bên Ecom).
 */
export const SYSTEM_ACTOR_ID = new Types.ObjectId('000000000000000000000000');
