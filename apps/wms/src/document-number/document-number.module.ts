import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentNumberService } from './document-number.service';
import {
  DocumentCounter,
  DocumentCounterSchema,
} from './schemas/document-counter.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DocumentCounter.name, schema: DocumentCounterSchema },
    ]),
  ],
  providers: [DocumentNumberService],
  exports: [DocumentNumberService],
})
export class DocumentNumberModule {}
