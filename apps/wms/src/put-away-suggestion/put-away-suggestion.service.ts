import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { AppException } from '@app/common';
import { StockRepository } from '../stock/stock.repository';
import { WarehouseRepository } from '../warehouse/warehouse.repository';
import type { ShelfDocument } from '../warehouse/schemas/shelf.schema';

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
}

const DEFAULT_FILL_FACTOR = 0.75;

@Injectable()
export class PutAwaySuggestionService {
  constructor(
    private readonly stockRepo: StockRepository,
    private readonly warehouseRepo: WarehouseRepository,
    private readonly configService: ConfigService,
  ) {}

  async suggest(
    sku: string,
    qty: number,
    warehouseId: string,
  ): Promise<PutAwaySuggestionResult> {
    const item = await this.stockRepo.findItemBySku(sku);
    if (!item) throw new AppException('PUTAWAY_ITEM_NOT_FOUND');

    if (!item.depth || !item.width || !item.height) {
      return { suggestions: [], warning: 'ITEM_NO_DIMENSIONS' };
    }
    const unitVolume = item.depth * item.width * item.height;
    const itemDims = [item.depth, item.width, item.height].sort(
      (a, b) => b - a,
    );

    const shelves =
      await this.warehouseRepo.findShelvesByWarehouse(warehouseId);
    const fittingShelves = shelves.filter((s) => this.fits(itemDims, s));
    if (fittingShelves.length === 0) {
      return { suggestions: [], warning: 'NO_SHELF_FITS' };
    }

    const [occupiedByShelf, shelfIdsWithSameSku] = await Promise.all([
      this.stockRepo.findOccupiedVolumeByWarehouse(
        new Types.ObjectId(warehouseId),
      ),
      this.stockRepo.findShelfIdsWithItem(
        item._id,
        new Types.ObjectId(warehouseId),
      ),
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

    const sameSku = sufficient
      .filter((c) => c.hasSameSku)
      .sort((a, b) => b.capacity - a.capacity);
    if (sameSku.length > 0) {
      return {
        shelfCode: sameSku[0].shelf.code,
        capacity: sameSku[0].capacity,
      };
    }

    const bestFit = [...sufficient].sort((a, b) => a.free - b.free);
    return { shelfCode: bestFit[0].shelf.code, capacity: bestFit[0].capacity };
  }

  private combineShelves(
    candidates: Candidate[],
    qty: number,
  ): PutAwaySuggestionResult {
    const sorted = [...candidates].sort((a, b) => b.capacity - a.capacity);
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
