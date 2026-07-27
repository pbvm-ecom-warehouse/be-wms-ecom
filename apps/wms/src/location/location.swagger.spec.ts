import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '@app/auth';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';
import { WarehouseLayoutEditorService } from './warehouse-layout-editor.service';

describe('LocationController Swagger layout contract', () => {
  it('publishes request, success, conflict and geometry schemas', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LocationController],
      providers: [
        { provide: LocationService, useValue: {} },
        { provide: WarehouseLayoutEditorService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('test').build(),
      );
      const operation = document.paths['/location/layout']?.patch;
      const getOperation = document.paths['/location/layout']?.get;

      expect(getOperation?.responses['200']).toEqual(
        expect.objectContaining({
          content: expect.objectContaining({
            'application/json': expect.objectContaining({
              schema: {
                $ref: '#/components/schemas/LayoutResponseEnvelopeDto',
              },
            }),
          }),
        }),
      );
      expect(operation?.requestBody).toEqual(
        expect.objectContaining({
          content: expect.objectContaining({
            'application/json': expect.objectContaining({
              schema: {
                $ref: '#/components/schemas/SaveWarehouseLayoutDto',
              },
            }),
          }),
        }),
      );
      expect(operation?.responses['200']).toEqual(
        expect.objectContaining({
          content: expect.objectContaining({
            'application/json': expect.objectContaining({
              schema: {
                $ref: '#/components/schemas/SaveWarehouseLayoutResponseEnvelopeDto',
              },
            }),
          }),
        }),
      );
      expect(operation?.responses['409']).toEqual(
        expect.objectContaining({
          content: expect.objectContaining({
            'application/json': expect.objectContaining({
              schema: expect.objectContaining({ oneOf: expect.any(Array) }),
            }),
          }),
        }),
      );
      expect(operation?.responses['422']).toBeDefined();
      expect(
        document.components?.schemas?.SaveWarehouseLayoutDto,
      ).toBeDefined();
      expect(
        document.components?.schemas?.SaveWarehouseLayoutResponseDto,
      ).toBeDefined();
      expect(
        document.components?.schemas?.SaveWarehouseLayoutResponseEnvelopeDto,
      ).toEqual(
        expect.objectContaining({
          properties: expect.objectContaining({
            data: expect.any(Object),
            meta: expect.any(Object),
          }),
        }),
      );
      expect(document.components?.schemas?.LayoutValidationErrorDto).toEqual(
        expect.objectContaining({
          properties: expect.objectContaining({
            error: expect.any(Object),
            meta: expect.any(Object),
          }),
        }),
      );
    } finally {
      await app.close();
    }
  });
});
