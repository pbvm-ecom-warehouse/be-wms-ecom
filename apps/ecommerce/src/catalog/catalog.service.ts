import { Injectable } from '@nestjs/common';
import { AppException, CloudinaryService } from '@app/common';
import { CatalogRepository } from './catalog.repository';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import {
  CreateProductDto,
  CreateVariantDto,
  ProductQueryDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/product.dto';
import { CreateDesignDto, UpdateDesignDto } from './dto/design.dto';
import { Category } from './schemas/category.schema';
import { Product, ProductStatus } from './schemas/product.schema';
import { ProductVariant } from './schemas/product-variant.schema';
import { Types } from 'mongoose';

const DUPLICATE_KEY_CODE = 11000;

// Giới hạn upload ảnh sản phẩm — theo đúng ràng buộc thiết kế IMG-01/IMG-02.
const ALLOWED_IMAGE_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly repo: CatalogRepository,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // ── UPLOAD ẢNH (dùng chung PRODUCT IMAGES + DESIGN) ─────────────────────

  private validateImageFile(file: UploadedImageFile): void {
    if (!file) {
      throw new AppException('VALIDATION_FAILED', 'Thiếu file ảnh');
    }
    if (!ALLOWED_IMAGE_MIMETYPES.includes(file.mimetype)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Chỉ nhận file ảnh (jpeg/png/webp)',
      );
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new AppException('VALIDATION_FAILED', 'File ảnh tối đa 5MB');
    }
  }

  // ── PRODUCT IMAGES ───────────────────────────────────────────────────────

  async uploadProductImage(file: UploadedImageFile): Promise<{ url: string }> {
    this.validateImageFile(file);

    const { url } = await this.cloudinary.uploadImage(
      file.buffer,
      'ecom/products',
    );
    return { url };
  }

  // ── DESIGN ARTWORK ───────────────────────────────────────────────────────

  /**
   * Upload artwork gốc lên Cloudinary + sinh thumbnail bằng transformation URL
   * (f_auto,q_auto,w_300) — không upload file thumbnail riêng. Chưa gán customerId
   * ở bước này vì Design chưa tồn tại; owner check thật sự nằm ở createDesign().
   */
  async uploadDesignFile(
    file: UploadedImageFile,
  ): Promise<{ file: string; thumbnail: string }> {
    this.validateImageFile(file);

    const { url, publicId } = await this.cloudinary.uploadImage(
      file.buffer,
      'ecom/designs',
    );
    return {
      file: url,
      thumbnail: this.cloudinary.buildThumbnailUrl(publicId),
    };
  }

  // ── CATEGORY ─────────────────────────────────────────────────────────────

  async createCategory(dto: CreateCategoryDto) {
    if (dto.parentId && !Types.ObjectId.isValid(dto.parentId)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'ID danh mục cha không hợp lệ',
      );
    }

    try {
      const created = await this.repo.createCategory({
        name: dto.name,
        slug: dto.slug,
        parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : null,
        position: dto.position ?? 0,
      });
      return created;
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code === DUPLICATE_KEY_CODE) {
        throw new AppException('CATALOG_CATEGORY_SLUG_DUPLICATE');
      }
      throw err;
    }
  }

  async listCategories(parentId?: string) {
    if (parentId && parentId !== 'root' && !Types.ObjectId.isValid(parentId)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'ID danh mục cha không hợp lệ',
      );
    }

    // parentId='root' -> lấy root (parentId=null); không truyền -> lấy tất cả
    const result =
      parentId === 'root'
        ? await this.repo.listCategories(null)
        : await this.repo.listCategories(parentId);

    return result;
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID danh mục không hợp lệ');
    }
    if (dto.parentId && !Types.ObjectId.isValid(dto.parentId)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'ID danh mục cha không hợp lệ',
      );
    }

    try {
      const updated = await this.repo.updateCategory(
        id,
        dto as unknown as Partial<Category>,
      );
      if (!updated) throw new AppException('CATALOG_CATEGORY_NOT_FOUND');
      return updated;
    } catch (err: unknown) {
      if (err instanceof AppException) throw err;
      const mongoErr = err as { code?: number };
      if (mongoErr.code === DUPLICATE_KEY_CODE) {
        throw new AppException('CATALOG_CATEGORY_SLUG_DUPLICATE');
      }
      throw err;
    }
  }

  async deleteCategory(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID danh mục không hợp lệ');
    }

    const deleted = await this.repo.deleteCategory(id);
    if (!deleted) throw new AppException('CATALOG_CATEGORY_NOT_FOUND');
    return { message: 'Đã xóa danh mục thành công' };
  }

  // ── PRODUCT ───────────────────────────────────────────────────────────────

  async createProduct(dto: CreateProductDto) {
    if (!Types.ObjectId.isValid(dto.categoryId)) {
      throw new AppException('VALIDATION_FAILED', 'ID danh mục không hợp lệ');
    }

    try {
      return await this.repo.createProduct({
        name: dto.name,
        slug: dto.slug,
        description: dto.description ?? '',
        images: dto.images ?? [],
        categoryId: new Types.ObjectId(dto.categoryId),
        status: dto.status ?? ProductStatus.DRAFT,
        seo: dto.seo ?? {},
      });
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code === DUPLICATE_KEY_CODE) {
        throw new AppException('CATALOG_PRODUCT_SLUG_DUPLICATE');
      }
      throw err;
    }
  }

  async listProducts(query: ProductQueryDto) {
    if (query.categoryId && !Types.ObjectId.isValid(query.categoryId)) {
      throw new AppException('VALIDATION_FAILED', 'ID danh mục không hợp lệ');
    }
    return this.repo.listProducts(query);
  }
  async listInactiveVariants() {
    return this.repo.listInactiveVariants();
  }
  async getProductVariants(productId: string, includeInactive = false) {
    if (!Types.ObjectId.isValid(productId)) {
      throw new AppException('VALIDATION_FAILED', 'ID sản phẩm không hợp lệ');
    }
    if (includeInactive) {
      return this.repo.listAllVariantsByProduct(productId);
    }
    return this.repo.listVariantsByProduct(productId);
  }

  async getProductDetail(slug: string) {
    // const cacheKey = `ecom:catalog:products:detail:${slug}`;
    // const cached = await this.cacheService.get<unknown>(cacheKey);
    // if (cached) return cached;

    const product = await this.repo.getProductBySlug(slug);
    if (!product) throw new AppException('CATALOG_PRODUCT_NOT_FOUND');
    const variants = await this.repo.listVariantsByProduct(
      product._id.toString(),
    );
    const result = { ...product, variants };
    // await this.cacheService.set(cacheKey, result, 3600); // Cache 1h
    return result;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID sản phẩm không hợp lệ');
    }
    if (dto.categoryId && !Types.ObjectId.isValid(dto.categoryId)) {
      throw new AppException('VALIDATION_FAILED', 'ID danh mục không hợp lệ');
    }

    const updates: Partial<Product> = { ...dto } as any;
    if (dto.categoryId) {
      updates.categoryId = new Types.ObjectId(dto.categoryId);
    }

    try {
      const updated = await this.repo.updateProduct(id, updates);
      if (!updated) throw new AppException('CATALOG_PRODUCT_NOT_FOUND');
      return updated;
    } catch (err: unknown) {
      if (err instanceof AppException) throw err;
      const mongoErr = err as { code?: number };
      if (mongoErr.code === DUPLICATE_KEY_CODE) {
        throw new AppException('CATALOG_PRODUCT_SLUG_DUPLICATE');
      }
      throw err;
    }
  }

  async publishProduct(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID sản phẩm không hợp lệ');
    }

    const updated = await this.repo.updateProduct(id, {
      status: ProductStatus.ACTIVE,
    });
    if (!updated) throw new AppException('CATALOG_PRODUCT_NOT_FOUND');
    return updated;
  }

  // ── VARIANT ───────────────────────────────────────────────────────────────

  async createVariant(dto: CreateVariantDto) {
    if (!Types.ObjectId.isValid(dto.productId)) {
      throw new AppException('VALIDATION_FAILED', 'ID sản phẩm không hợp lệ');
    }

    // Kiểm tra sản phẩm có tồn tại không
    const product = await this.repo.getProductById(dto.productId);
    if (!product) throw new AppException('CATALOG_PRODUCT_NOT_FOUND');

    try {
      const created = await this.repo.createVariant({
        sku: dto.sku,
        productId: new Types.ObjectId(dto.productId),
        attributes: dto.attributes ?? {},
        price: dto.price,
        fulfillmentType: dto.fulfillmentType,
      });
      return created;
    } catch (err: unknown) {
      const mongoErr = err as { code?: number };
      if (mongoErr.code === DUPLICATE_KEY_CODE) {
        throw new AppException('CATALOG_VARIANT_SKU_DUPLICATE');
      }
      throw err;
    }
  }

  async updateVariant(id: string, dto: UpdateVariantDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new AppException('VALIDATION_FAILED', 'ID biến thể không hợp lệ');
    }

    const updates: Partial<ProductVariant> = { ...dto } as any;
    if (dto.productId) {
      updates.productId = new Types.ObjectId(dto.productId);
    }

    try {
      const updated = await this.repo.updateVariant(id, updates);
      if (!updated) throw new AppException('CATALOG_VARIANT_NOT_FOUND');
      return updated;
    } catch (err: unknown) {
      if (err instanceof AppException) throw err;
      const mongoErr = err as { code?: number };
      if (mongoErr.code === DUPLICATE_KEY_CODE) {
        throw new AppException('CATALOG_VARIANT_SKU_DUPLICATE');
      }
      throw err;
    }
  }

  async findVariantBySku(sku: string) {
    return this.repo.findVariantBySku(sku);
  }

  // ── DESIGN ────────────────────────────────────────────────────────────────

  async createDesign(customerId: string, dto: CreateDesignDto) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }

    return this.repo.createDesign({
      customerId: new Types.ObjectId(customerId),
      name: dto.name,
      file: dto.file,
      thumbnail: dto.thumbnail ?? '',
    });
  }

  async listMyDesigns(customerId: string) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }
    return this.repo.listDesignsByCustomer(customerId);
  }

  async deleteMyDesign(customerId: string, designId: string) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }
    if (!Types.ObjectId.isValid(designId)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'ID mẫu thiết kế không hợp lệ',
      );
    }

    const deleted = await this.repo.deleteDesign(designId, customerId);
    if (!deleted) throw new AppException('CATALOG_DESIGN_NOT_FOUND');
    return { message: 'Đã xóa thiết kế thành công' };
  }

  async touchDesign(designId: string) {
    if (!Types.ObjectId.isValid(designId)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'ID mẫu thiết kế không hợp lệ',
      );
    }
    const touched = await this.repo.touchDesign(designId);
    if (!touched) throw new AppException('CATALOG_DESIGN_NOT_FOUND');
    return touched;
  }

  async findDesign(id: string, customerId: string) {
    return this.repo.findDesign(id, customerId);
  }

  async updateDesign(
    customerId: string,
    designId: string,
    dto: UpdateDesignDto,
  ) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw new AppException('VALIDATION_FAILED', 'ID khách hàng không hợp lệ');
    }
    if (!Types.ObjectId.isValid(designId)) {
      throw new AppException(
        'VALIDATION_FAILED',
        'ID mẫu thiết kế không hợp lệ',
      );
    }
    const updated = await this.repo.updateDesign(designId, customerId, dto);
    if (!updated) throw new AppException('CATALOG_DESIGN_NOT_FOUND');
    return updated;
  }
}
