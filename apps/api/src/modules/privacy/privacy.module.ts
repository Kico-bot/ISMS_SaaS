import { Module } from '@nestjs/common';
import { DpiaService } from './dpia.service';
import { ProcessingController } from './privacy.controller';
import { ProcessingService } from './processing.service';

@Module({
  controllers: [ProcessingController],
  providers: [ProcessingService, DpiaService],
  exports: [ProcessingService, DpiaService],
})
export class PrivacyModule {}
