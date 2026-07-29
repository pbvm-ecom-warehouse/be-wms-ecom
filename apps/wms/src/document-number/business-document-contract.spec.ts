import { plainToInstance } from 'class-transformer';
import { ShipmentResponseDto } from '../shipping/dto/shipment.dto';
import { ShipmentSchema } from '../shipping/schemas/shipment.schema';
import { GoodsReturnResponseDto } from '../goods-return/dto/goods-return.dto';
import { GoodsReturnSchema } from '../goods-return/schemas/goods-return.schema';
import { StockCountResponseDto } from '../stock-count/dto/stock-count.dto';
import { StockCountSchema } from '../stock-count/schemas/stock-count.schema';
import { ScrapNoteResponseDto } from '../scrap-note/dto/scrap-note.dto';
import { ScrapNoteSchema } from '../scrap-note/schemas/scrap-note.schema';
import { PrintJobResponseDto } from '../print-job/dto/print-job.dto';
import { PrintJobSchema } from '../print-job/schemas/print-job.schema';

const TO_OPTS = { excludeExtraneousValues: true } as const;

describe('WMS business document contract', () => {
  it.each([
    [ShipmentSchema, 'shipmentNumber'],
    [GoodsReturnSchema, 'goodsReturnNumber'],
    [StockCountSchema, 'stockCountNumber'],
    [ScrapNoteSchema, 'scrapNoteNumber'],
    [PrintJobSchema, 'printJobNumber'],
  ])('%s exposes a unique sparse business number', (schema, field) => {
    expect(schema.paths[field]).toBeDefined();
    const numberIndex = schema.indexes().find(([def]) => def[field] === 1);
    expect(numberIndex?.[1]).toMatchObject({ unique: true, sparse: true });
  });

  it('exposes business codes and order snapshots in list/detail DTOs', () => {
    const shipment = plainToInstance(
      ShipmentResponseDto,
      {
        shipmentNumber: 'SHP-20260730-0001',
        orderId: 'order-id',
        orderCode: 'ORD-20260730-0001',
      },
      TO_OPTS,
    );
    const goodsReturn = plainToInstance(
      GoodsReturnResponseDto,
      {
        goodsReturnNumber: 'RET-20260730-0001',
        orderId: 'order-id',
        orderCode: 'ORD-20260730-0001',
      },
      TO_OPTS,
    );
    const stockCount = plainToInstance(
      StockCountResponseDto,
      { stockCountNumber: 'SC-20260730-0001' },
      TO_OPTS,
    );
    const scrap = plainToInstance(
      ScrapNoteResponseDto,
      { scrapNoteNumber: 'SCR-20260730-0001' },
      TO_OPTS,
    );
    const printJob = plainToInstance(
      PrintJobResponseDto,
      {
        printJobNumber: 'PRN-20260730-0001',
        orderId: 'order-id',
        orderCode: 'ORD-20260730-0001',
      },
      TO_OPTS,
    );

    expect(shipment).toMatchObject({
      shipmentNumber: 'SHP-20260730-0001',
      orderId: 'order-id',
      orderCode: 'ORD-20260730-0001',
    });
    expect(goodsReturn).toMatchObject({
      goodsReturnNumber: 'RET-20260730-0001',
      orderId: 'order-id',
      orderCode: 'ORD-20260730-0001',
    });
    expect(stockCount.stockCountNumber).toBe('SC-20260730-0001');
    expect(scrap.scrapNoteNumber).toBe('SCR-20260730-0001');
    expect(printJob).toMatchObject({
      printJobNumber: 'PRN-20260730-0001',
      orderId: 'order-id',
      orderCode: 'ORD-20260730-0001',
    });
  });

  it('returns null for business fields on legacy documents', () => {
    expect(
      plainToInstance(ShipmentResponseDto, {}, TO_OPTS).shipmentNumber,
    ).toBeNull();
    expect(
      plainToInstance(GoodsReturnResponseDto, {}, TO_OPTS).goodsReturnNumber,
    ).toBeNull();
    expect(
      plainToInstance(StockCountResponseDto, {}, TO_OPTS).stockCountNumber,
    ).toBeNull();
    expect(
      plainToInstance(ScrapNoteResponseDto, {}, TO_OPTS).scrapNoteNumber,
    ).toBeNull();
    expect(
      plainToInstance(PrintJobResponseDto, {}, TO_OPTS).printJobNumber,
    ).toBeNull();
  });
});
