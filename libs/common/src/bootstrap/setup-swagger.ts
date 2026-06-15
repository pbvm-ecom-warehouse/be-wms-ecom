import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface SetupSwaggerOptions {
  title: string;
  description?: string;
  version?: string;
  /** Path tuyệt đối để serve UI, vd 'api/wms/docs'. */
  docsPath: string;
  isProd: boolean;
}

/**
 * Bật Swagger UI cho app — chỉ khi không phải production.
 * Gọi sau setupApp(), trước app.listen().
 */
export function setupSwagger(
  app: INestApplication,
  opts: SetupSwaggerOptions,
): void {
  if (opts.isProd) return;

  const config = new DocumentBuilder()
    .setTitle(opts.title)
    .setDescription(opts.description ?? '')
    .setVersion(opts.version ?? '1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(opts.docsPath, app, document);
}
