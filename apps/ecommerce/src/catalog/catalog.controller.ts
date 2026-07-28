import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import {
  CurrentUser,
  JwtAuthGuard,
  RolesGuard,
  Roles,
  EcomRole,
  CustomerGuard,
} from '@app/auth';
import { CatalogService } from './catalog.service';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CategoryResponseDto,
} from './dto/category.dto';
import {
  CreateProductDto,
  CreateVariantDto,
  ProductQueryDto,
  UpdateProductDto,
  UpdateVariantDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  ProductDetailResponseDto,
  ImageUploadResponseDto,
} from './dto/product.dto';
import {
  CreateDesignDto,
  DesignResponseDto,
  DesignUploadResponseDto,
  UpdateDesignDto,
} from './dto/design.dto';
import { SuccessResponseDto } from '../auth/dto/auth.dto';

/** Public storefront — không cần auth */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogPublicController {
  constructor(private readonly svc: CatalogService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Lấy danh sách hoặc cây danh mục' })
  @ApiQuery({
    name: 'parentId',
    required: false,
    description: '"root" để lấy danh mục gốc',
  })
  @ApiOkResponse({ type: [CategoryResponseDto] })
  async listCategories(@Query('parentId') parentId?: string) {
    const list = await this.svc.listCategories(parentId);
    return plainToInstance(CategoryResponseDto, list, {
      excludeExtraneousValues: true,
    });
  }

  @Get('products')
  @ApiOperation({ summary: 'Danh sách sản phẩm đang bán (tìm kiếm/lọc)' })
  @ApiOkResponse({ type: [ProductResponseDto] })
  async listProducts(@Query() query: ProductQueryDto) {
    const list = await this.svc.listProducts(query);
    return plainToInstance(ProductResponseDto, list, {
      excludeExtraneousValues: true,
    });
  }

  @Get('products/active')
  @ApiOperation({ summary: 'Danh sách sản phẩm ACTIVE đang bán' })
  @ApiOkResponse({ type: [ProductResponseDto] })
  async listActiveProducts(@Query() query: ProductQueryDto) {
    const list = await this.svc.listActiveProducts(query);
    return plainToInstance(ProductResponseDto, list, {
      excludeExtraneousValues: true,
    });
  }

  @Get('products/:slug')
  @ApiOperation({ summary: 'Chi tiết sản phẩm kèm các biến thể (variants)' })
  @ApiParam({ name: 'slug', example: 'ly-nhua-in-custom' })
  @ApiOkResponse({ type: ProductDetailResponseDto })
  async getProduct(@Param('slug') slug: string) {
    const detail = await this.svc.getProductDetail(slug);
    return plainToInstance(ProductDetailResponseDto, detail, {
      excludeExtraneousValues: true,
    });
  }

  @Get('products/:id/variants')
  @ApiOperation({ summary: 'Lấy danh sách các biến thể của sản phẩm' })
  @ApiParam({ name: 'id', description: 'ID sản phẩm' })
  @ApiOkResponse({ type: [ProductVariantResponseDto] })
  async getProductVariants(@Param('id') id: string) {
    const list = await this.svc.getProductVariants(id, false);
    return plainToInstance(ProductVariantResponseDto, list, {
      excludeExtraneousValues: true,
    });
  }
}

/** Admin routes — cần JWT và role ECOM_MANAGER */
@ApiTags('admin-catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(EcomRole.ECOM_MANAGER)
@Controller('admin/catalog')
export class CatalogAdminController {
  constructor(private readonly svc: CatalogService) {}

  // ── Categories ────────────────────────────────────────────────────────────
  @Get('variants/inactive')
  @ApiOperation({ summary: '[Admin] Lấy danh sách biến thể chưa kích hoạt (isActive = false)' })
  @ApiOkResponse({ type: [ProductVariantResponseDto] })
  async getInactiveVariants() {
    const list = await this.svc.listInactiveVariants();
    return plainToInstance(ProductVariantResponseDto, list, {
      excludeExtraneousValues: true,
    });
  }
  @Patch('variants/:id/activate')
  @ApiOperation({ summary: '[Admin] Kích hoạt hoạt động biến thể (isActive = true)' })
  @ApiParam({ name: 'id', description: 'ID biến thể' })
  @ApiOkResponse({ type: ProductVariantResponseDto })
  async activateVariant(@Param('id') id: string) {
    const variant = await this.svc.updateVariant(id, { isActive: true });
    return plainToInstance(ProductVariantResponseDto, variant, {
      excludeExtraneousValues: true,
    });
  }
  //siuuuuuuuuuuuuuuu
  @Post('categories')
  @ApiOperation({ summary: '[Admin] Tạo danh mục mới' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  async createCategory(@Body() dto: CreateCategoryDto) {
    const category = await this.svc.createCategory(dto);
    return plainToInstance(CategoryResponseDto, category, {
      excludeExtraneousValues: true,
    });
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: '[Admin] Cập nhật danh mục' })
  @ApiParam({ name: 'id', description: 'ID danh mục' })
  @ApiOkResponse({ type: CategoryResponseDto })
  async updateCategory(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    const category = await this.svc.updateCategory(id, dto);
    return plainToInstance(CategoryResponseDto, category, {
      excludeExtraneousValues: true,
    });
  }

  @Patch('categories/:id/soft-delete')
  @ApiOperation({ summary: '[Admin] Xóa mềm danh mục' })
  @ApiParam({ name: 'id', description: 'ID danh mục' })
  @ApiOkResponse({ type: SuccessResponseDto })
  async deleteCategory(@Param('id') id: string) {
    const result = await this.svc.deleteCategory(id);
    return plainToInstance(SuccessResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Get('categories/deleted')
  @ApiOperation({ summary: '[Admin] Xem các danh mục đã bị xóa mềm' })
  @ApiOkResponse({ type: [CategoryResponseDto] })
  async getDeletedCategories() {
    const list = await this.svc.listDeletedCategories();
    return plainToInstance(CategoryResponseDto, list, {
      excludeExtraneousValues: true,
    });
  }

  @Patch('categories/:id/restore')
  @ApiOperation({ summary: '[Admin] Khôi phục danh mục bị xóa mềm' })
  @ApiParam({ name: 'id', description: 'ID danh mục' })
  @ApiOkResponse({ type: CategoryResponseDto })
  async restoreCategory(@Param('id') id: string) {
    const category = await this.svc.restoreCategory(id);
    return plainToInstance(CategoryResponseDto, category, {
      excludeExtraneousValues: true,
    });
  }

  // ── Products ──────────────────────────────────────────────────────────────

  @Post('products')
  @ApiOperation({ summary: '[Admin] Tạo sản phẩm mới (mặc định DRAFT)' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  async createProduct(@Body() dto: CreateProductDto) {
    const product = await this.svc.createProduct(dto);
    return plainToInstance(ProductResponseDto, product, {
      excludeExtraneousValues: true,
    });
  }

  @Patch('products/:id')
  @ApiOperation({ summary: '[Admin] Cập nhật thông tin sản phẩm' })
  @ApiParam({ name: 'id', description: 'ID sản phẩm' })
  @ApiOkResponse({ type: ProductResponseDto })
  async updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    const product = await this.svc.updateProduct(id, dto);
    return plainToInstance(ProductResponseDto, product, {
      excludeExtraneousValues: true,
    });
  }

  @Put('products/:id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: '[Admin] Đưa sản phẩm lên kệ (ACTIVE)' })
  @ApiParam({ name: 'id', description: 'ID sản phẩm' })
  @ApiOkResponse({ type: ProductResponseDto })
  async publishProduct(@Param('id') id: string) {
    const product = await this.svc.publishProduct(id);
    return plainToInstance(ProductResponseDto, product, {
      excludeExtraneousValues: true,
    });
  }

  @Get('products/:id/variants')
  @ApiOperation({ summary: '[Admin] Lấy danh sách tất cả các biến thể của sản phẩm (bao gồm cả ẩn)' })
  @ApiParam({ name: 'id', description: 'ID sản phẩm' })
  @ApiOkResponse({ type: [ProductVariantResponseDto] })
  async getAdminProductVariants(@Param('id') id: string) {
    const list = await this.svc.getProductVariants(id, true);
    return plainToInstance(ProductVariantResponseDto, list, {
      excludeExtraneousValues: true,
    });
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  @Post('variants')
  @ApiOperation({ summary: '[Admin] Tạo biến thể sản phẩm mới' })
  @ApiCreatedResponse({ type: ProductVariantResponseDto })
  async createVariant(@Body() dto: CreateVariantDto) {
    const variant = await this.svc.createVariant(dto);
    return plainToInstance(ProductVariantResponseDto, variant, {
      excludeExtraneousValues: true,
    });
  }

  @Patch('variants/:id')
  @ApiOperation({ summary: '[Admin] Cập nhật biến thể sản phẩm' })
  @ApiParam({ name: 'id', description: 'ID biến thể' })
  @ApiOkResponse({ type: ProductVariantResponseDto })
  async updateVariant(@Param('id') id: string, @Body() dto: UpdateVariantDto) {
    const variant = await this.svc.updateVariant(id, dto);
    return plainToInstance(ProductVariantResponseDto, variant, {
      excludeExtraneousValues: true,
    });
  }

  // ── Product images ───────────────────────────────────────────────────────

  @Post('products/images')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: '[Admin] Upload ảnh sản phẩm lên Cloudinary — [ECOM_MANAGER]',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: ImageUploadResponseDto })
  async uploadProductImage(@UploadedFile() file: Express.Multer.File) {
    const result = await this.svc.uploadProductImage(file);
    return plainToInstance(ImageUploadResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }
}

/** Design Library — chỉ dành cho khách hàng đăng nhập */
@ApiTags('designs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CustomerGuard)
@Controller('designs')
export class DesignController {
  constructor(private readonly svc: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Thư viện thiết kế của tôi (mới dùng lên trước)' })
  @ApiOkResponse({ type: [DesignResponseDto] })
  async listMyDesigns(@CurrentUser('sub') customerId: string) {
    const designs = await this.svc.listMyDesigns(customerId);
    return plainToInstance(DesignResponseDto, designs, {
      excludeExtraneousValues: true,
    });
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload artwork lên Cloudinary, nhận URL để tạo thiết kế',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: DesignUploadResponseDto })
  async uploadDesignFile(@UploadedFile() file: Express.Multer.File) {
    const result = await this.svc.uploadDesignFile(file);
    return plainToInstance(DesignUploadResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Thêm thiết kế mới vào thư viện' })
  @ApiCreatedResponse({ type: DesignResponseDto })
  async createDesign(
    @CurrentUser('sub') customerId: string,
    @Body() dto: CreateDesignDto,
  ) {
    const design = await this.svc.createDesign(customerId, dto);
    return plainToInstance(DesignResponseDto, design, {
      excludeExtraneousValues: true,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thiết kế trong thư viện' })
  @ApiParam({ name: 'id', description: 'ID mẫu thiết kế' })
  @ApiOkResponse({ type: DesignResponseDto })
  async updateDesign(
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDesignDto,
  ) {
    const design = await this.svc.updateDesign(customerId, id, dto);
    return plainToInstance(DesignResponseDto, design, {
      excludeExtraneousValues: true,
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa thiết kế khỏi thư viện' })
  @ApiParam({ name: 'id', description: 'ID mẫu thiết kế' })
  @ApiOkResponse({ type: SuccessResponseDto })
  async deleteDesign(
    @CurrentUser('sub') customerId: string,
    @Param('id') id: string,
  ) {
    const result = await this.svc.deleteMyDesign(customerId, id);
    return plainToInstance(SuccessResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }
}
