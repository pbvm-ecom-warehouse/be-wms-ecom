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
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariant>,
    @InjectModel(ProcessedEvent.name)
    private readonly processedModel: Model<ProcessedEvent>,
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

  async findOrCreateDefaultCategory(): Promise<Types.ObjectId> {
    const existing = await this.categoryModel.findOne().lean();
    if (existing) {
      return existing._id;
    }
    const created = await this.categoryModel.create({
      name: 'Chưa phân loại',
      slug: 'chua-phan-loai',
      position: 0,
    });
    return created._id;
  }

  async findOrCreateProductForVariant(
    sku: string,
    type: string,
    attributes: Record<string, string>,
  ): Promise<Types.ObjectId> {
    let productName = `Sản phẩm kho - ${type}`;

    if (type === 'MATERIAL') {
      // Ví dụ: attributes.category = "Trà", "Sữa", "Đường"
      // Lấy attributes.category làm tên sản phẩm
      productName = attributes['category'] || 'Nguyên liệu';
    } else if (type === 'PACKAGING') {
      // Ví dụ: attributes.packaging = "Ống hút", "Túi", "Hộp", "Nắp ly"
      // Lấy attributes.packaging làm tên sản phẩm
      productName = attributes['packaging'] || 'Bao bì';
    } else if (type === 'CUP_BLANK') {
      productName = 'Ly trơn';
    } else if (type === 'CUP_PRINTED') {
      productName = 'Ly in';
    }

    const slug = `san-pham-kho-${sku.split('-').slice(0, 2).join('-').toLowerCase()}`;
    const existing = await this.productModel.findOne({ slug }).lean();
    if (existing) {
      return existing._id;
    }
    const categoryId = await this.findOrCreateDefaultCategory();
    const created = await this.productModel.create({
      name: productName,
      slug,
      description: 'Sản phẩm nháp được tạo tự động từ mặt hàng kho WMS',
      categoryId,
      status: ProductStatus.DRAFT,
    });
    return created._id;
  }

  async createProductVariantFromWms(
    jobId: string,
    eventName: string,
    sku: string,
    type: string,
    initialQty: number,
    attributes: Record<string, string>,
  ): Promise<boolean> {
    const session = await this.conn.startSession();
    try {
      await session.withTransaction(async () => {
        await this.processedModel.create([{ jobId, eventName }], { session });
        const existing = await this.variantModel
          .findOne({ sku })
          .session(session)
          .lean();
        if (!existing) {
          const productId = await this.findOrCreateProductForVariant(
            sku,
            type,
            attributes,
          );
          await this.variantModel.create(
            [
              {
                sku,
                productId,
                price: 0,
                availableQty: initialQty,
                isActive: false, // Để ẩn mặc định
                attributes,
              },
            ],
            { session },
          );
        }
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
    const filter: Record<string, any> = {
      deletedAt: null,
    };
    if (parentId !== undefined) {
      filter.parentId = parentId ? new Types.ObjectId(parentId) : null;
    }
    return this.categoryModel.find(filter).sort({ position: 1 }).lean();
  }

  async updateCategory(id: string, data: Partial<Category>) {
    return this.categoryModel.findByIdAndUpdate(id, data, { new: true }).lean();
  }

  async deleteCategory(id: string) {
    return this.categoryModel
      .findByIdAndUpdate(id, { deletedAt: new Date() }, { new: true })
      .lean();
  }

  async listDeletedCategories() {
    return this.categoryModel
      .find({ deletedAt: { $ne: null } })
      .sort({ position: 1 })
      .lean();
  }

  async restoreCategory(id: string) {
    return this.categoryModel
      .findByIdAndUpdate(id, { deletedAt: null }, { new: true })
      .lean();
  }

  // ── PRODUCT ───────────────────────────────────────────────────────────────

  async createProduct(data: Partial<Product>) {
    return this.productModel.create(data);
  }
  async listInactiveVariants() {
    return this.variantModel.find({ isActive: false }).lean();
  }

  async listProducts(query: ProductQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.categoryId) {
      if (Types.ObjectId.isValid(query.categoryId)) {
        const catId = new Types.ObjectId(query.categoryId);
        const isDeleted = await this.categoryModel.exists({
          _id: catId,
          deletedAt: { $ne: null },
        });
        if (isDeleted) {
          return [];
        }
        filter.categoryId = catId;
      } else {
        filter.categoryId = new Types.ObjectId();
      }
    } else {
      const deletedCats = await this.categoryModel
        .find({ deletedAt: { $ne: null } })
        .select('_id')
        .lean();
      const deletedCatIds = deletedCats.map((c) => c._id);
      filter.categoryId = { $nin: deletedCatIds };
    }
    if (query.q) filter.name = { $regex: query.q, $options: 'i' };

    let products = await this.productModel.find(filter).lean();

    // Nếu lọc theo giá hoặc còn-hàng, cần join với variants
    if (
      query.minPrice !== undefined ||
      query.maxPrice !== undefined ||
      query.inStock
    ) {
      const productIds = products.map((p) => p._id);
      const searchIds = [
        ...productIds,
        ...productIds.map((id) => id.toString()),
      ];
      const variantFilter: Record<string, unknown> = {
        productId: { $in: searchIds },
        isActive: true,
      };
      if (query.minPrice !== undefined)
        variantFilter.price = { $gte: query.minPrice };
      if (query.maxPrice !== undefined) {
        variantFilter.price = {
          ...(variantFilter.price as Record<string, unknown>),
          $lte: query.maxPrice,
        };
      }
      if (query.inStock === true || query.inStock === 'true') {
        variantFilter.availableQty = { $gt: 0 };
      }

      const validVariants = await this.variantModel
        .find(variantFilter)
        .select('productId')
        .lean();
      const validProductIds = new Set(
        validVariants.map((v) => v.productId.toString()),
      );
      products = products.filter((p) => validProductIds.has(p._id.toString()));
    }

    if (products.length === 0) return [];

    const finalProductIds = products.map((p) => p._id);
    const searchFinalIds = [
      ...finalProductIds,
      ...finalProductIds.map((id) => id.toString()),
    ];
    const allVariants = await this.variantModel
      .find({
        productId: { $in: searchFinalIds },
        isActive: true,
      })
      .lean();

    const variantsByProductId: Record<string, typeof allVariants> = {};
    for (const v of allVariants) {
      const pId = v.productId.toString();
      if (!variantsByProductId[pId]) {
        variantsByProductId[pId] = [];
      }
      variantsByProductId[pId].push(v);
    }

    return products.map((p) => {
      const pVariants = variantsByProductId[p._id.toString()] ?? [];
      const price =
        pVariants.length > 0 ? Math.min(...pVariants.map((v) => v.price)) : 0;
      const inStock = pVariants.some((v) => v.availableQty > 0);
      return {
        ...p,
        price,
        inStock,
        variants: pVariants,
      };
    });
  }

  async listActiveProducts(query: ProductQueryDto) {
    const filter: Record<string, unknown> = {
      status: ProductStatus.ACTIVE,
    };
    if (query.categoryId) {
      if (Types.ObjectId.isValid(query.categoryId)) {
        const catId = new Types.ObjectId(query.categoryId);
        const isDeleted = await this.categoryModel.exists({
          _id: catId,
          deletedAt: { $ne: null },
        });
        if (isDeleted) {
          return [];
        }
        filter.categoryId = catId;
      } else {
        filter.categoryId = new Types.ObjectId();
      }
    } else {
      const deletedCats = await this.categoryModel
        .find({ deletedAt: { $ne: null } })
        .select('_id')
        .lean();
      const deletedCatIds = deletedCats.map((c) => c._id);
      filter.categoryId = { $nin: deletedCatIds };
    }
    if (query.q) filter.name = { $regex: query.q, $options: 'i' };

    let products = await this.productModel.find(filter).lean();

    // Nếu lọc theo giá hoặc còn-hàng, cần join với variants
    if (
      query.minPrice !== undefined ||
      query.maxPrice !== undefined ||
      query.inStock
    ) {
      const productIds = products.map((p) => p._id);
      const searchIds = [
        ...productIds,
        ...productIds.map((id) => id.toString()),
      ];
      const variantFilter: Record<string, unknown> = {
        productId: { $in: searchIds },
        isActive: true,
      };
      if (query.minPrice !== undefined)
        variantFilter.price = { $gte: query.minPrice };
      if (query.maxPrice !== undefined) {
        variantFilter.price = {
          ...(variantFilter.price as Record<string, unknown>),
          $lte: query.maxPrice,
        };
      }
      if (query.inStock === true || query.inStock === 'true') {
        variantFilter.availableQty = { $gt: 0 };
      }

      const validVariants = await this.variantModel
        .find(variantFilter)
        .select('productId')
        .lean();
      const validProductIds = new Set(
        validVariants.map((v) => v.productId.toString()),
      );
      products = products.filter((p) => validProductIds.has(p._id.toString()));
    }

    if (products.length === 0) return [];

    const finalProductIds = products.map((p) => p._id);
    const searchFinalIds = [
      ...finalProductIds,
      ...finalProductIds.map((id) => id.toString()),
    ];
    const allVariants = await this.variantModel
      .find({
        productId: { $in: searchFinalIds },
        isActive: true,
      })
      .lean();

    const variantsByProductId: Record<string, typeof allVariants> = {};
    for (const v of allVariants) {
      const pId = v.productId.toString();
      if (!variantsByProductId[pId]) {
        variantsByProductId[pId] = [];
      }
      variantsByProductId[pId].push(v);
    }

    return products.map((p) => {
      const pVariants = variantsByProductId[p._id.toString()] ?? [];
      const price =
        pVariants.length > 0 ? Math.min(...pVariants.map((v) => v.price)) : 0;
      const inStock = pVariants.some((v) => v.availableQty > 0);
      return {
        ...p,
        price,
        inStock,
        variants: pVariants,
      };
    });
  }

  async getProductBySlug(slug: string) {
    return this.productModel
      .findOne({ slug, status: ProductStatus.ACTIVE })
      .lean();
  }

  /** Tìm product theo slug bất kể status — dùng cho seed script (idempotency check). */
  async getProductBySlugAny(slug: string) {
    return this.productModel.findOne({ slug }).lean();
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
    const queryId = Types.ObjectId.isValid(productId)
      ? new Types.ObjectId(productId)
      : new Types.ObjectId();
    return this.variantModel
      .find({ productId: queryId, isActive: true })
      .lean();
  }

  async listAllVariantsByProduct(productId: string) {
    const queryId = Types.ObjectId.isValid(productId)
      ? new Types.ObjectId(productId)
      : new Types.ObjectId();
    return this.variantModel.find({ productId: queryId }).lean();
  }

  async updateVariant(id: string, data: Partial<ProductVariant>) {
    return this.variantModel.findByIdAndUpdate(id, data, { new: true }).lean();
  }

  async findVariantBySku(sku: string) {
    return this.variantModel.findOne({ sku, isActive: true }).lean();
  }

  /** Tìm variant theo sku bất kể isActive — dùng cho seed script (idempotency check). */
  async findVariantBySkuAny(sku: string) {
    return this.variantModel.findOne({ sku }).lean();
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
      .findOne({
        _id: new Types.ObjectId(id),
        customerId: new Types.ObjectId(customerId),
      })
      .lean();
  }

  async deleteDesign(id: string, customerId: string) {
    return this.designModel
      .findOneAndDelete({
        _id: new Types.ObjectId(id),
        customerId: new Types.ObjectId(customerId),
      })
      .lean();
  }

  async touchDesign(id: string) {
    return this.designModel
      .findByIdAndUpdate(id, { lastUsedAt: new Date() })
      .lean();
  }

  async updateDesign(
    id: string,
    customerId: string,
    updates: Record<string, any>,
  ) {
    return this.designModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          customerId: new Types.ObjectId(customerId),
        },
        { $set: updates },
        { new: true },
      )
      .lean();
  }
}
