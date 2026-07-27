import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '@app/common';
import { StockRepository } from '../stock/stock.repository';
import { LocationRepository } from '../location/location.repository';
import type { ShelfDocument } from '../location/schemas/shelf.schema';

export interface PutAwaySuggestionItem {
  shelfCode: string;
  capacity: number;
}

export type PutAwaySuggestionWarning =
  | 'ITEM_NO_DIMENSIONS'
  | 'NO_SHELF_FITS'
  | 'INSUFFICIENT_CAPACITY'
  | null;

export interface PutAwaySuggestionResult {
  suggestions: PutAwaySuggestionItem[];
  warning: PutAwaySuggestionWarning;
}

interface Candidate {
  shelf: ShelfDocument;
  capacity: number;
  free: number;
  hasSameSku: boolean;
  distanceMeters: number | null;
}

const DEFAULT_FILL_FACTOR = 0.75;
const SAME_SKU_BONUS = 1000;
const DISTANCE_SCORE_CAP_METERS = 100;

@Injectable()
export class PutAwaySuggestionService {
  constructor(
    private readonly stockRepo: StockRepository,
    private readonly locationRepo: LocationRepository,
    private readonly configService: ConfigService,
  ) {}

  async suggest(sku: string, qty: number): Promise<PutAwaySuggestionResult> {
    const item = await this.stockRepo.findItemBySku(sku);
    if (!item) throw new AppException('PUTAWAY_ITEM_NOT_FOUND');

    if (!item.depth || !item.width || !item.height) {
      return { suggestions: [], warning: 'ITEM_NO_DIMENSIONS' };
    }
    const unitVolume = item.depth * item.width * item.height;
    const itemDims = [item.depth, item.width, item.height].sort(
      (a, b) => b - a,
    );

    const shelves = await this.locationRepo.findShelves();
    const fittingShelves = shelves.filter((s) => this.fits(itemDims, s));
    if (fittingShelves.length === 0) {
      return { suggestions: [], warning: 'NO_SHELF_FITS' };
    }

    const [occupiedByShelf, shelfIdsWithSameSku, distanceByShelfId] =
      await Promise.all([
        this.stockRepo.findOccupiedVolume(),
        this.stockRepo.findShelfIdsWithItem(item._id),
        this.computeDistancesToStaging(fittingShelves),
      ]);
    const defaultFillFactor =
      this.configService.get<number>('PUTAWAY_DEFAULT_FILL_FACTOR') ??
      DEFAULT_FILL_FACTOR;

    const candidates: Candidate[] = [];
    for (const shelf of fittingShelves) {
      const usableVolume =
        (shelf.innerDepth ?? 0) *
        (shelf.innerWidth ?? 0) *
        (shelf.innerHeight ?? 0);
      const fillFactor = shelf.fillFactor ?? defaultFillFactor;
      const occupied = occupiedByShelf.get(shelf._id.toString()) ?? 0;
      const free = usableVolume * fillFactor - occupied;
      const capacity = Math.floor(free / unitVolume);
      if (capacity < 1) continue;
      candidates.push({
        shelf,
        capacity,
        free,
        hasSameSku: shelfIdsWithSameSku.has(shelf._id.toString()),
        distanceMeters: distanceByShelfId.get(shelf._id.toString()) ?? null,
      });
    }

    if (candidates.length === 0) {
      return { suggestions: [], warning: 'NO_SHELF_FITS' };
    }

    const single = this.rankSingleShelf(candidates, qty);
    if (single) {
      return { suggestions: [single], warning: null };
    }

    return this.combineShelves(candidates, qty);
  }

  /**
   * Khoảng cách Euclid (mét) từ tâm rack của mỗi shelf tới tâm rack chứa
   * staging shelf — dùng làm 1 trong 3 tiêu chí weighted scoring (ưu tiên
   * shelf gần khu nhận hàng tạm để giảm quãng đường di chuyển put-away).
   * Trả Map rỗng nếu không có staging shelf hoặc staging shelf thiếu toạ độ
   * rack — không chặn suggestion, các candidate chỉ đơn giản không có
   * distance_score (coi như 0 điểm khoảng cách).
   */
  private async computeDistancesToStaging(
    shelves: ShelfDocument[],
  ): Promise<Map<string, number>> {
    const staging = await this.locationRepo.findStagingShelf();
    if (!staging) return new Map();

    const allShelfIds = [...shelves.map((s) => s._id), staging._id];
    const centers =
      await this.locationRepo.findRackCentersByShelfId(allShelfIds);
    const stagingCenter = centers.get(staging._id.toString());
    if (!stagingCenter) return new Map();

    const result = new Map<string, number>();
    for (const shelf of shelves) {
      const center = centers.get(shelf._id.toString());
      if (!center) continue;
      const dx = center.xM - stagingCenter.xM;
      const dy = center.yM - stagingCenter.yM;
      result.set(shelf._id.toString(), Math.sqrt(dx * dx + dy * dy));
    }
    return result;
  }

  /**
   * Điểm tổng hợp weighted scoring: same-SKU (ưu tiên tuyệt đối, +1000) +
   * khoảng cách tới staging (càng gần càng cao, cap 100m) + best-fit thể
   * tích (free càng nhỏ càng khít, chia /1000 để chỉ phân định khi 2 tiêu
   * chí trên đã ngang nhau — free tính bằng cm³ nên đơn vị chênh lệch quá
   * lớn nếu không chuẩn hoá).
   */
  private score(candidate: Candidate): number {
    const sameSkuBonus = candidate.hasSameSku ? SAME_SKU_BONUS : 0;
    const distanceScore =
      candidate.distanceMeters === null
        ? 0
        : Math.max(
            0,
            DISTANCE_SCORE_CAP_METERS -
              Math.min(DISTANCE_SCORE_CAP_METERS, candidate.distanceMeters),
          );
    return sameSkuBonus + distanceScore - candidate.free / 1000;
  }

  private fits(itemDimsDesc: number[], shelf: ShelfDocument): boolean {
    const shelfDims = [
      shelf.innerDepth ?? 0,
      shelf.innerWidth ?? 0,
      shelf.innerHeight ?? 0,
    ].sort((a, b) => b - a);
    return itemDimsDesc.every((d, i) => d <= shelfDims[i]);
  }

  private rankSingleShelf(
    candidates: Candidate[],
    qty: number,
  ): PutAwaySuggestionItem | null {
    const sufficient = candidates.filter((c) => c.capacity >= qty);
    if (sufficient.length === 0) return null;

    const best = [...sufficient].sort(
      (a, b) => this.score(b) - this.score(a),
    )[0];
    return { shelfCode: best.shelf.code, capacity: best.capacity };
  }

  private combineShelves(
    candidates: Candidate[],
    qty: number,
  ): PutAwaySuggestionResult {
    const sorted = [...candidates].sort(
      (a, b) => this.score(b) - this.score(a),
    );
    const chosen: PutAwaySuggestionItem[] = [];
    let covered = 0;
    for (const c of sorted) {
      if (covered >= qty) break;
      chosen.push({ shelfCode: c.shelf.code, capacity: c.capacity });
      covered += c.capacity;
    }
    const warning: PutAwaySuggestionWarning =
      covered >= qty ? null : 'INSUFFICIENT_CAPACITY';
    return { suggestions: chosen, warning };
  }
}
