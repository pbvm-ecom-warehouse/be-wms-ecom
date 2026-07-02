import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { setupApp } from '@app/common';
import { AppModule } from '../src/app.module';

/**
 * Smoke e2e cho chuẩn cross-cutting: response envelope { data, meta }, error envelope
 * { error.code, meta }, và header X-Request-Id.
 *
 * CẦN Mongo (replica set rs0) + Redis chạy (AppModule có DatabaseModule + EventsModule).
 * Khởi động hạ tầng: `docker compose up -d` rồi đổi `describe.skip` → `describe` và chạy
 * `pnpm test:e2e`. Để skip mặc định vì CI/máy chưa chắc có hạ tầng.
 */
describe.skip('Cross-cutting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    setupApp(app, {
      corsOrigins: undefined,
      isProd: false,
      globalPrefix: 'api/wms',
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/wms → bọc { data, meta } + header X-Request-Id', async () => {
    const res = await request(app.getHttpServer()).get('/api/wms').expect(200);
    expect(res.body).toEqual({
      data: expect.anything(),
      meta: { requestId: expect.any(String), timestamp: expect.any(String) },
    });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('route không tồn tại → error envelope { error.code: NOT_FOUND }', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/wms/khong-ton-tai')
      .expect(404);
    expect(res.body).toMatchObject({
      error: { code: 'NOT_FOUND' },
      meta: { requestId: expect.any(String), path: expect.any(String) },
    });
  });
});
