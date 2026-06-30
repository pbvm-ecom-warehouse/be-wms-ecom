import { getConnectionToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { ClientSession } from 'mongoose';
import { StockTransactionHelper } from './with-stock-transaction.helper';

describe('StockTransactionHelper', () => {
  let helper: StockTransactionHelper;
  let mockSession: Partial<ClientSession>;
  let withTransactionMock: jest.Mock;
  let endSessionMock: jest.Mock;

  beforeEach(async () => {
    withTransactionMock = jest.fn();
    endSessionMock = jest.fn().mockResolvedValue(undefined);
    mockSession = { withTransaction: withTransactionMock, endSession: endSessionMock };

    const mockConnection = {
      startSession: jest.fn().mockResolvedValue(mockSession),
    };

    const module = await Test.createTestingModule({
      providers: [
        StockTransactionHelper,
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    helper = module.get(StockTransactionHelper);
    jest.clearAllMocks();
  });

  it('gọi fn bên trong withTransaction và trả về kết quả', async () => {
    const expected = { ok: true };
    withTransactionMock.mockImplementation(async (fn: (s: ClientSession) => Promise<unknown>) => {
      return fn(mockSession as ClientSession);
    });

    const fn = jest.fn().mockResolvedValue(expected);
    const result = await helper.withStockTransaction(fn);

    expect(fn).toHaveBeenCalledWith(mockSession);
    expect(result).toBe(expected);
  });

  it('luôn gọi endSession dù fn throw', async () => {
    withTransactionMock.mockImplementation(async (fn: (s: ClientSession) => Promise<unknown>) => {
      return fn(mockSession as ClientSession);
    });

    const fn = jest.fn().mockRejectedValue(new Error('db error'));
    await expect(helper.withStockTransaction(fn)).rejects.toThrow('db error');
    expect(endSessionMock).toHaveBeenCalled();
  });

  it('endSession luôn được gọi sau khi fn thành công', async () => {
    withTransactionMock.mockImplementation(async (fn: (s: ClientSession) => Promise<unknown>) => {
      return fn(mockSession as ClientSession);
    });

    await helper.withStockTransaction(jest.fn().mockResolvedValue(null));
    expect(endSessionMock).toHaveBeenCalled();
  });
});
