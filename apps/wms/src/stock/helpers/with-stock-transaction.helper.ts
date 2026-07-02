import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';

/**
 * Wrap MongoDB session.withTransaction để các nghiệp vụ (GRN, Issue, StockCount...)
 * ghi đồng thời vào stock_balances + inventory_stocks + stock_movements một cách atomic.
 * Cần replica set (Atlas hoặc local --replSet rs0).
 */
@Injectable()
export class StockTransactionHelper {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async withStockTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      return await session.withTransaction(fn);
    } finally {
      await session.endSession();
    }
  }
}
