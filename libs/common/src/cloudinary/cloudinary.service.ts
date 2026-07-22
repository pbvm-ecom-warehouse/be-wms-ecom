import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  v2 as cloudinary,
  type UploadApiErrorResponse,
  type UploadApiResponse,
} from 'cloudinary';

export interface UploadImageResult {
  url: string;
  publicId: string;
}

@Injectable()
export class CloudinaryService {
  constructor(config: ConfigService) {
    // getOrThrow → thiếu env là app dừng ngay lúc boot, không fail âm thầm lúc gọi API.
    cloudinary.config({
      cloud_name: config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: config.getOrThrow<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadImage(file: Buffer, folder: string): Promise<UploadImageResult> {
    const response = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error?: UploadApiErrorResponse, result?: UploadApiResponse): void => {
          if (error || !result) {
            reject(new Error(error?.message ?? 'Cloudinary upload thất bại'));
            return;
          }
          resolve(result);
        },
      );
      stream.end(file);
    });

    return { url: response.secure_url, publicId: response.public_id };
  }
}
