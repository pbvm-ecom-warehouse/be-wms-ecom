import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface SetupSwaggerOptions {
  title: string;
  description?: string;
  version?: string;
  /** Route path để serve UI, vd 'api/wms/docs'. */
  docsPath: string;
  isProd?: boolean;
}

/**
 * Bật Swagger UI cho app — luôn bật (kể cả production) để FE dev có thể dùng.
 * Gọi sau setupApp(), trước app.listen().
 */
export function setupSwagger(
  app: INestApplication,
  opts: SetupSwaggerOptions,
): void {
  const builder = new DocumentBuilder()
    .setTitle(opts.title)
    .setVersion(opts.version ?? '1.0')
    .addBearerAuth();

  if (opts.description) builder.setDescription(opts.description);

  const config = builder.build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(opts.docsPath, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
    },
  });
}
