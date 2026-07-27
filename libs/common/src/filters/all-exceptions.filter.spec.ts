import { BadRequestException, ArgumentsHost } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from '../errors/app.exception';
import { AllExceptionsFilter } from './all-exceptions.filter';

function mockHost(): {
  host: ArgumentsHost;
  json: jest.Mock;
  status: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const req = { method: 'GET', url: '/api/wms/x', id: 'req-1', headers: {} };
  const res = { status };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, json, status };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('AppException → giữ nguyên code/message/details + status', () => {
    const { host, json, status } = mockHost();
    filter.catch(
      new AppException('STOCK_INSUFFICIENT', 'Không đủ tồn', 409, [
        { issue: 'x' },
      ]),
      host,
    );
    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'STOCK_INSUFFICIENT',
        message: 'Không đủ tồn',
        details: [{ issue: 'x' }],
      },
      meta: {
        requestId: 'req-1',
        timestamp: expect.any(String),
        path: '/api/wms/x',
      },
    });
  });

  it('layout revision conflict → giữ details trong error envelope chuẩn', () => {
    const { host, json, status } = mockHost();
    filter.catch(
      new AppException('LAYOUT_REVISION_CONFLICT', undefined, undefined, {
        expectedRevision: 7,
        currentRevision: 8,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'LAYOUT_REVISION_CONFLICT',
          message: 'Sơ đồ kho đã được cập nhật bởi phiên khác',
          details: { expectedRevision: 7, currentRevision: 8 },
        },
        meta: expect.any(Object),
      }),
    );
  });
  it('ValidationPipe (message mảng) → VALIDATION_FAILED + details', () => {
    const { host, json } = mockHost();
    filter.catch(new BadRequestException(['name không được trống']), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Dữ liệu không hợp lệ',
          details: ['name không được trống'],
        },
      }),
    );
  });

  it('ThrottlerException → RATE_LIMITED 429', () => {
    const { host, json, status } = mockHost();
    filter.catch(new ThrottlerException(), host);
    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'RATE_LIMITED' }),
      }),
    );
  });

  it('lỗi lạ → INTERNAL 500, giấu chi tiết', () => {
    const { host, json, status } = mockHost();
    filter.catch(new Error('db down secret'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: { code: 'INTERNAL', message: 'Lỗi hệ thống' },
      }),
    );
  });
});
