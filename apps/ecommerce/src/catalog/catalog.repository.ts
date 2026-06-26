import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { ProcessedEvent } from './schemas/processed-event.schema';
import { ProductVariant } from './schemas/product-variant.schema';
import { Category } from './schemas/category.schema';
import { Product, ProductStatus } from './schemas/product.schema';
import { Design } from './schemas/design.schema';
import { ProductQueryDto } from './dto/product.dto';

const DUPLICATE_KEY = 11000;

@Injectable()
export class CatalogRepository {
  constructor(
    @InjectConnection() private readonly conn: Connection,
    @InjectModel(ProductVariant.name) private readonly variantModel: Model<ProductVariant>,
    @InjectModel(ProcessedEvent.name) private readonly processedModel: Model<ProcessedEvent>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Design.name) private readonly designModel: Model<Design>,
  ) {}

  // ── STOCK SYNC (giữ nguyên & thêm clamp âm) ───────────────────────────────

  async applyStockDeltaOnce(
    jobId: string,
    eventName: string,
    sku: string,
    delta: number,
  ): Promise<boolean> {
    const session = await this.conn.startSession();
    try {
      await session.withTransaction(async () => {
        // Ghi dấu jobId trước — nếu đã xử lý, unique index ném 11000 → rollback.
        await this.processedModel.create([{ jobId, eventName }], { session });
        await this.variantModel.updateMany(
          { sku },
          { $inc: { availableQty: delta } },
          { session },
        );
        // Clamp về 0 nếu âm (đề phòng thứ tự sự kiện đến lệch)
        await this.variantModel.updateMany(
          { sku, availableQty: { $lt: 0 } },
          { $set: { availableQty: 0 } },
          { session },
        );
      });
      return true;
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === DUPLICATE_KEY) return false;
      throw err;
    } finally {
      await session.endSession();
    }
  }

  // ── CATEGORY ─────────────────────────────────────────────────────────────

  async createCategory(data: Partial<Category>) {
    return this.categoryModel.create(data);
  }

  async listCategories(parentId?: string | null) {
    const filter: Record<string, any> = parentId !== undefined
      ? { parentId: parentId ? new Types.ObjectId(parentId) : null }
      : {};
    return this.categoryModel.find(filter).sort({ position: 1 }).lean();
  }

  async updateCategory(id: string, data: Partial<Category>) {
    return this.categoryModel.findByIdAndUpdate(id, data, { new: true }).lean();
  }

  async deleteCategory(id: string) {
    return this.categoryModel.findByIdAndDelete(id).lean();
  }

  // ── PRODUCT ───────────────────────────────────────────────────────────────

  async createProduct(data: Partial<Product>) {
    return this.productModel.create(data);
  }

  async listProducts(query: ProductQueryDto) {
    const filter: Record<string, any> = { status: ProductStatus.ACTIVE };
    if (query.categoryId) filter.categoryId = new Types.ObjectId(query.categoryId);
    if (query.q) filter.name = { $regex: query.q, $options: 'i' };

    const products = await this.productModel.find(filter).lean();

    // Nếu lọc theo giá hoặc còn-hàng, cần join với variants
    if (query.minPrice !== undefined || query.maxPrice !== undefined || query.inStock) {
      const productIds = products.map((p) => p._id);
      const variantFilter: Record<string, any> = {
        productId: { $in: productIds },
        isActive: true,
      };
      if (query.minPrice !== undefined) variantFilter.price = { $gte: query.minPrice };
      if (query.maxPrice !== undefined) {
        variantFilter.price = { ...variantFilter.price, $lte: query.maxPrice };
      }
      if (query.inStock === true || query.inStock === 'true') {
        variantFilter.availableQty = { $gt: 0 };
      }

      const validVariants = await this.variantModel.find(variantFilter).select('productId').lean();
      const validProductIds = new Set(validVariants.map((v) => v.productId.toString()));
      return products.filter((p) => validProductIds.has(p._id.toString()));
    }

    return products;
  }

  async getProductBySlug(slug: string) {
    return this.productModel.findOne({ slug, status: ProductStatus.ACTIVE }).lean();
  }

  async getProductById(id: string) {
    return this.productModel.findById(id).lean();
  }

  async updateProduct(id: string, data: Partial<Product>) {
    return this.productModel.findByIdAndUpdate(id, data, { new: true }).lean();
  }

  // ── PRODUCT VARIANT ───────────────────────────────────────────────────────

  async createVariant(data: Partial<ProductVariant>) {
    return this.variantModel.create(data);
  }

  async listVariantsByProduct(productId: string) {
    return this.variantModel
      .find({ productId: new Types.ObjectId(productId), isActive: true })
      .lean();
  }

  async updateVariant(id: string, data: Partial<ProductVariant>) {
    return this.variantModel.findByIdAndUpdate(id, data, { new: true }).lean();
  }

  async findVariantBySku(sku: string) {
    return this.variantModel.findOne({ sku, isActive: true }).lean();
  }

  // ── DESIGN ────────────────────────────────────────────────────────────────

  async createDesign(data: Partial<Design>) {
    return this.designModel.create(data);
  }

  async listDesignsByCustomer(customerId: string) {
    return this.designModel
      .find({ customerId: new Types.ObjectId(customerId) })
      .sort({ lastUsedAt: -1, createdAt: -1 })
      .lean();
  }

  async findDesign(id: string, customerId: string) {
    return this.designModel
      .findOne({ _id: new Types.ObjectId(id), customerId: new Types.ObjectId(customerId) })
      .lean();
  }

  async deleteDesign(id: string, customerId: string) {
    return this.designModel
      .findOneAndDelete({ _id: new Types.ObjectId(id), customerId: new Types.ObjectId(customerId) })
      .lean();
  }

  async touchDesign(id: string) {
    return this.designModel.findByIdAndUpdate(id, { lastUsedAt: new Date() }).lean();
  }
}

