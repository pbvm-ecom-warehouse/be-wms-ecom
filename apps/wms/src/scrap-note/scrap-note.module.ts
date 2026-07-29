import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { QUEUES } from '@app/events';
import { ScrapNote, ScrapNoteSchema } from './schemas/scrap-note.schema';
import { ScrapNoteRepository } from './scrap-note.repository';
import { ScrapNoteService } from './scrap-note.service';
import { ScrapNoteController } from './scrap-note.controller';
import { LocationModule } from '../location/location.module';
import { StockModule } from '../stock/stock.module';
import { DocumentNumberModule } from '../document-number/document-number.module';

@Module({
  imports: [
    // STOCK: produce stock.changed sau khi approve dòng không có lotId
    // (hủy vì hỏng — available đổi qua onHand)
    BullModule.registerQueue({ name: QUEUES.STOCK }),
    MongooseModule.forFeature([
      { name: ScrapNote.name, schema: ScrapNoteSchema },
    ]),
    LocationModule, // findShelfById
    StockModule, // StockRepository + StockTransactionHelper
    DocumentNumberModule,
  ],
  providers: [ScrapNoteRepository, ScrapNoteService],
  controllers: [ScrapNoteController],
  exports: [ScrapNoteService],
})
export class ScrapNoteModule {}
