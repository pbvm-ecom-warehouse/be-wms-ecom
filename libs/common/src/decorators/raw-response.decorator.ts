import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'raw_response';

/** Đánh dấu route KHÔNG bọc envelope (webhook/payment callback cần shape nguyên bản). */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
