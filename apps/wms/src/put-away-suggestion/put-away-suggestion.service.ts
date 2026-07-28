import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '@app/common/errors/app.exception';
import { Types } from 'mongoose';
import { StockRepository } from '../stock/stock.repository';
import { LocationRepository } from '../location/location.repository';
import {
  WarehouseNavigationService,
  type NavigationPath,
} from '../location/navigation.service';
import type { StorageCellDocument } from '../location/schemas/storage-cell.schema';

export interface PutAwaySuggestionOptions {
  lotId?: string;
  packageVolumeCm3?: number;
  packageDepthCm?: number;
  packageWidthCm?: number;
  packageHeightCm?: number;
}

export interface PutAwaySuggestionItem {
  shelfCode: string;
  capacity: number;
  cellId: string;
  cellCode: string;
  rackId: string;
  level: number;
  bay: number;
  fillPercent: number;
  reason: 'SAME_SKU_LOT_CELL' | 'SAME_SKU_CELL' | 'BEST_FIT_VOLUME';
  path: NavigationPath;
}

export type PutAwaySuggestionWarning =
  | 'ITEM_NO_DIMENSIONS'
  | 'NO_SHELF_FITS'
  | 'INSUFFICIENT_CAPACITY'
  | 'NO_NAVIGATION_PATH'
  | null;

export interface PutAwaySuggestionResult {
  suggestions: PutAwaySuggestionItem[];
  warning: PutAwaySuggestionWarning;
}

interface Candidate {
  cell: StorageCellDocument;
  capacity: number;
  occupied: number;
  usable: number;
  hasSameSku: boolean;
  hasSameLot: boolean;
  path: NavigationPath;
}

const DEFAULT_FILL_FACTOR = 0.75;

@Injectable()
export class PutAwaySuggestionService {
  constructor(
    private readonly stockRepo: StockRepository,
    private readonly locationRepo: LocationRepository,
    private readonly configService: ConfigService,
    private readonly navigationService: WarehouseNavigationService,
  ) {}

  async suggest(
    sku: string,
    packageCount: number,
    options: PutAwaySuggestionOptions = {},
  ): Promise<PutAwaySuggestionResult> {
    const item = await this.stockRepo.findItemBySku(sku);
    if (!item) throw new AppException('PUTAWAY_ITEM_NOT_FOUND');

    const depth = options.packageDepthCm ?? item.depth;
    const width = options.packageWidthCm ?? item.width;
    const height = options.packageHeightCm ?? item.height;
    const packageVolume =
      options.packageVolumeCm3 ??
      (depth && width && height ? depth * width * height : undefined);
    if (!depth || !width || !height || !packageVolume) {
      return { suggestions: [], warning: 'ITEM_NO_DIMENSIONS' };
    }

    const cells = await this.locationRepo.findCells();
    if (cells.length === 0) {
      return { suggestions: [], warning: 'NO_SHELF_FITS' };
    }

    const lotId = options.lotId ? new Types.ObjectId(options.lotId) : null;
    const [occupiedByCell, cellIdsWithSameSku, cellIdsWithSameLot] =
      await Promise.all([
        this.stockRepo.findOccupiedVolumeByCell(),
        this.stockRepo.findCellIdsWithItem(item._id),
        this.stockRepo.findCellIdsWithItemAndLot(item._id, lotId),
      ]);
    const defaultFillFactor =
      this.configService.get<number>('PUTAWAY_DEFAULT_FILL_FACTOR') ??
      DEFAULT_FILL_FACTOR;

    const candidates: Candidate[] = [];
    let hasPhysicalFit = false;
    for (const cell of cells) {
      if (
        depth > cell.innerDepth ||
        width > cell.innerWidth ||
        height > cell.innerHeight
      ) {
        continue;
      }
      hasPhysicalFit = true;
      const usable =
        cell.innerDepth *
        cell.innerWidth *
        cell.innerHeight *
        (cell.fillFactor ?? defaultFillFactor);
      const occupied = occupiedByCell.get(cell._id.toString()) ?? 0;
      const capacity = Math.floor(Math.max(0, usable - occupied) / packageVolume);
      if (capacity < 1) continue;

      try {
        const path = await this.navigationService.getPath(
          cell.rackId.toString(),
        );
        candidates.push({
          cell,
          capacity,
          occupied,
          usable,
          hasSameSku: cellIdsWithSameSku.has(cell._id.toString()),
          hasSameLot: cellIdsWithSameLot.has(cell._id.toString()),
          path,
        });
      } catch (error) {
        if (
          error instanceof AppException &&
          [
            'NAVIGATION_RACK_NOT_CONNECTED',
            'NAVIGATION_PATH_NOT_FOUND',
            'NAVIGATION_GATE_NOT_CONNECTED',
            'NAVIGATION_GATE_NOT_FOUND',
          ].includes(error.code)
        ) {
          continue;
        }
        throw error;
      }
    }

    if (candidates.length === 0) {
      return {
        suggestions: [],
        warning: hasPhysicalFit ? 'NO_NAVIGATION_PATH' : 'NO_SHELF_FITS',
      };
    }

    candidates.sort((left, right) => {
      const affinity =
        Number(right.hasSameLot) - Number(left.hasSameLot) ||
        Number(right.hasSameSku) - Number(left.hasSameSku);
      if (affinity !== 0) return affinity;
      const leftRemaining = left.usable - left.occupied;
      const rightRemaining = right.usable - right.occupied;
      if (leftRemaining !== rightRemaining) {
        return leftRemaining - rightRemaining;
      }
      return left.path.distanceM - right.path.distanceM;
    });

    const suggestions: PutAwaySuggestionItem[] = [];
    let covered = 0;
    for (const candidate of candidates) {
      if (covered >= packageCount) break;
      suggestions.push(this.toSuggestion(candidate));
      covered += candidate.capacity;
    }

    return {
      suggestions,
      warning:
        covered >= packageCount ? null : 'INSUFFICIENT_CAPACITY',
    };
  }

  private toSuggestion(candidate: Candidate): PutAwaySuggestionItem {
    const cell = candidate.cell;
    return {
      shelfCode: cell.code.replace(/-B\d+$/, ''),
      capacity: candidate.capacity,
      cellId: cell._id.toString(),
      cellCode: cell.code,
      rackId: cell.rackId.toString(),
      level: cell.level,
      bay: cell.bay,
      fillPercent: Math.min(
        100,
        Math.round((candidate.occupied / candidate.usable) * 100),
      ),
      reason: candidate.hasSameLot
        ? 'SAME_SKU_LOT_CELL'
        : candidate.hasSameSku
          ? 'SAME_SKU_CELL'
          : 'BEST_FIT_VOLUME',
      path: candidate.path,
    };
  }
}
