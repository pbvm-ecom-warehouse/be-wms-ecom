import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryService } from './cloudinary.service';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn(),
    },
    url: jest.fn(),
  },
}));

function configWith(env: Record<string, string>): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (!(key in env)) {
        throw new Error(`Missing env ${key}`);
      }
      return env[key];
    },
  } as unknown as ConfigService;
}

describe('CloudinaryService', () => {
  const okEnv = {
    CLOUDINARY_CLOUD_NAME: 'demo-cloud',
    CLOUDINARY_API_KEY: 'demo-key',
    CLOUDINARY_API_SECRET: 'demo-secret',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cấu hình SDK bằng 3 biến env lúc khởi tạo', () => {
    new CloudinaryService(configWith(okEnv));

    expect(cloudinary.config).toHaveBeenCalledWith({
      cloud_name: 'demo-cloud',
      api_key: 'demo-key',
      api_secret: 'demo-secret',
    });
  });

  it('thiếu env → getOrThrow ném lỗi ngay lúc khởi tạo (fail-fast)', () => {
    expect(
      () => new CloudinaryService(configWith({ CLOUDINARY_CLOUD_NAME: 'x' })),
    ).toThrow('Missing env CLOUDINARY_API_KEY');
  });

  it('uploadImage() trả về { url, publicId } khi SDK upload thành công', async () => {
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_options, callback) => {
        callback(undefined, {
          secure_url: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
          public_id: 'wms/grn/x',
        });
        return { end: jest.fn() };
      },
    );

    const service = new CloudinaryService(configWith(okEnv));
    const result = await service.uploadImage(Buffer.from('fake'), 'wms/grn');

    expect(result).toEqual({
      url: 'https://res.cloudinary.com/demo/image/upload/x.jpg',
      publicId: 'wms/grn/x',
    });
    expect(cloudinary.uploader.upload_stream).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'wms/grn', resource_type: 'image' }),
      expect.any(Function),
    );
  });

  it('uploadImage() ném lỗi rõ ràng khi SDK reject', async () => {
    (cloudinary.uploader.upload_stream as jest.Mock).mockImplementation(
      (_options, callback) => {
        callback({
          message: 'Invalid image file',
          name: 'Error',
          http_code: 400,
        });
        return { end: jest.fn() };
      },
    );

    const service = new CloudinaryService(configWith(okEnv));

    await expect(
      service.uploadImage(Buffer.from('fake'), 'wms/grn'),
    ).rejects.toThrow('Invalid image file');
  });

  it('buildThumbnailUrl() sinh URL transform f_auto,q_auto,w_300 từ publicId', () => {
    (cloudinary.url as jest.Mock).mockReturnValue(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_300/ecom/designs/x.jpg',
    );

    const service = new CloudinaryService(configWith(okEnv));
    const thumbnailUrl = service.buildThumbnailUrl('ecom/designs/x');

    expect(cloudinary.url).toHaveBeenCalledWith('ecom/designs/x', {
      secure: true,
      width: 300,
      quality: 'auto',
      fetch_format: 'auto',
    });
    expect(thumbnailUrl).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_300/ecom/designs/x.jpg',
    );
  });
});
