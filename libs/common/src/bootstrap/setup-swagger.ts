import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export interface SetupSwaggerOptions {
  title: string;
  description?: string;
  version?: string;
  /** Route path Ä‘á»ƒ serve UI, vd 'api/wms/docs'. */
  docsPath: string;
  isProd: boolean;
}

/**
 * Báº­t Swagger UI cho app â€” chá»‰ khi khĂ´ng pháº£i production.
 * Gá»i sau setupApp(), trÆ°á»›c app.listen().
 */
export function setupSwagger(
  app: INestApplication,
  opts: SetupSwaggerOptions,
): void {
  if (opts.isProd) return;

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

