// Mock @app/common để tránh load firebase-admin/jose (ESM) trong môi trường Jest CJS.
// AppException được export thật (không phụ thuộc ESM) nên giữ lại trong mock.
jest.mock('@app/common', () => ({
  AppException: class AppException extends Error {
    constructor(
      public readonly code: string,
      public readonly message?: string,
    ) {
      super(message ?? code);
      this.name = 'AppException';
    }
  },
  CloudinaryService: class {},
}));

import { CatalogService } from './catalog.service';

function makeService(
  overrides: { cloudinary?: Record<string, jest.Mock> } = {},
) {
  const repo = {};
  const cacheService = {};
  const cloudinary = {
    uploadImage: jest.fn().mockResolvedValue({
      url: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
      publicId: 'ecom/products/x',
    }),
    ...overrides.cloudinary,
  };
  const svc = new CatalogService(repo as any, cacheService as any, cloudinary);
  return { svc, cloudinary };
}

function fakeFile(
  overrides: Partial<{
    mimetype: string;
    size: number;
    buffer: Buffer;
  }> = {},
) {
  return {
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('fake-image'),
    ...overrides,
  };
}

describe('CatalogService.uploadProductImage', () => {
  it('upload ảnh hợp lệ → trả về { url } từ CloudinaryService', async () => {
    const { svc, cloudinary } = makeService();

    const result = await svc.uploadProductImage(fakeFile());

    expect(cloudinary.uploadImage).toHaveBeenCalledWith(
      expect.any(Buffer),
      'ecom/products',
    );
    expect(result).toEqual({
      url: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
    });
  });

  it('file không phải ảnh (mimetype lạ) → AppException VALIDATION_FAILED', async () => {
    const { svc, cloudinary } = makeService();

    await expect(
      svc.uploadProductImage(fakeFile({ mimetype: 'application/pdf' })),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(cloudinary.uploadImage).not.toHaveBeenCalled();
  });

  it('file > 5MB → AppException VALIDATION_FAILED', async () => {
    const { svc, cloudinary } = makeService();

    await expect(
      svc.uploadProductImage(fakeFile({ size: 5 * 1024 * 1024 + 1 })),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(cloudinary.uploadImage).not.toHaveBeenCalled();
  });

  it('không có file → AppException VALIDATION_FAILED', async () => {
    const { svc } = makeService();

    await expect(
      svc.uploadProductImage(
        undefined as unknown as ReturnType<typeof fakeFile>,
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
