import { Injectable } from '@nestjs/common';
import { AppException } from '@app/common';
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
import { CacheService } from '../cache/cache.service';

const DUPLICATE_KEY_CODE = 11000;

@Injectable()
export class CatalogService {
  constructor(
    private readonly repo: CatalogRepository,
    private readonly cacheService: CacheService,
  ) {}

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
      await this.cacheService.delPattern('ecom:catalog:categories:*');
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
    const cacheKey = `ecom:catalog:categories:parent:${parentId ?? 'all'}`;
    const cached = await this.cacheService.get<Category[]>(cacheKey);
    if (cached) return cached;

    // parentId='root' -> lấy root (parentId=null); không truyền -> lấy tất cả
    const result =
      parentId === 'root'
        ? await this.repo.listCategories(null)
        : await this.repo.listCategories(parentId);

    await this.cacheService.set(cacheKey, result, 86400); // Cache 24h
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
      await this.cacheService.delPattern('ecom:catalog:categories:*');
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
    await this.cacheService.delPattern('ecom:catalog:categories:*');
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

    try {
      const oldProduct = await this.repo.getProductById(id);
      if (oldProduct) {
        await this.cacheService.del(
          `ecom:catalog:products:detail:${oldProduct.slug}`,
        );
      }

      const updated = await this.repo.updateProduct(
        id,
        dto as unknown as Partial<Product>,
      );
      if (!updated) throw new AppException('CATALOG_PRODUCT_NOT_FOUND');
      if (updated.slug !== oldProduct?.slug) {
        await this.cacheService.del(
          `ecom:catalog:products:detail:${updated.slug}`,
        );
      }
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
    await this.cacheService.del(`ecom:catalog:products:detail:${updated.slug}`);
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
      await this.cacheService.del(
        `ecom:catalog:products:detail:${product.slug}`,
      );
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

    try {
      const updated = await this.repo.updateVariant(
        id,
        dto as unknown as Partial<ProductVariant>,
      );
      if (!updated) throw new AppException('CATALOG_VARIANT_NOT_FOUND');
      const product = await this.repo.getProductById(
        updated.productId.toString(),
      );
      if (product) {
        await this.cacheService.del(
          `ecom:catalog:products:detail:${product.slug}`,
        );
      }
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
