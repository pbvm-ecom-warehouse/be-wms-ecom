import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { PaginatedResult } from '../pagination/paginated-result';
import { ResponseInterceptor } from './response.interceptor';

function ctx(handlerMeta = false): ExecutionContext {
  const req = { id: 'req-9', headers: {} };
  return {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function reflectorWith(raw: boolean): Reflector {
  return { getAllAndOverride: () => raw } as unknown as Reflector;
}

describe('ResponseInterceptor', () => {
  it('bọc payload thường thành { data, meta }', async () => {
    const interceptor = new ResponseInterceptor(reflectorWith(false));
    const next: CallHandler = { handle: () => of({ id: 1 }) };
    const out = await lastValueFrom(interceptor.intercept(ctx(), next));
    expect(out).toEqual({
      data: { id: 1 },
      meta: { requestId: 'req-9', timestamp: expect.any(String) },
    });
  });

  it('PaginatedResult → data=items, meta.pagination', async () => {
    const interceptor = new ResponseInterceptor(reflectorWith(false));
    const paged = new PaginatedResult([{ id: 1 }], {
      type: 'cursor',
      limit: 20,
      nextCursor: null,
      hasNext: false,
    });
    const next: CallHandler = { handle: () => of(paged) };
    const out = await lastValueFrom(interceptor.intercept(ctx(), next));
    expect(out).toEqual({
      data: [{ id: 1 }],
      meta: {
        requestId: 'req-9',
        timestamp: expect.any(String),
        pagination: paged.pagination,
      },
    });
  });

  it('payload undefined → data=null', async () => {
    const interceptor = new ResponseInterceptor(reflectorWith(false));
    const next: CallHandler = { handle: () => of(undefined) };
    const out = await lastValueFrom(interceptor.intercept(ctx(), next));
    expect(out).toMatchObject({ data: null });
  });

  it('@RawResponse → trả nguyên payload, không bọc', async () => {
    const interceptor = new ResponseInterceptor(reflectorWith(true));
    const next: CallHandler = { handle: () => of({ raw: true }) };
    const out = await lastValueFrom(interceptor.intercept(ctx(), next));
    expect(out).toEqual({ raw: true });
  });
});
