import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { buildCorsOptions } from './cors';

function resolveOrigin(options: CorsOptions, origin: string) {
  return new Promise<boolean | undefined>((resolve, reject) => {
    if (typeof options.origin !== 'function') {
      resolve(options.origin === true || options.origin === origin);
      return;
    }

    options.origin(origin, (error, allow) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(allow === true);
    });
  });
}

describe('buildCorsOptions', () => {
  it('allows exact origins after normalizing trailing slashes', async () => {
    const options = buildCorsOptions('http://localhost:3101/', true);

    await expect(resolveOrigin(options, 'http://localhost:3101')).resolves.toBe(
      true,
    );
  });

  it('supports local wildcard port patterns', async () => {
    const options = buildCorsOptions('http://localhost:*', true);

    await expect(resolveOrigin(options, 'http://localhost:3101')).resolves.toBe(
      true,
    );
    await expect(resolveOrigin(options, 'http://localhost:3108')).resolves.toBe(
      true,
    );
    await expect(resolveOrigin(options, 'http://127.0.0.1:3101')).resolves.toBe(
      false,
    );
  });
});
