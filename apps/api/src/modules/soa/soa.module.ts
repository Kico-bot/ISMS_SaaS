import { Module } from '@nestjs/common';
import { ModelingService } from './modeling.service';
import { ModelingController, SoaController } from './soa.controller';
import { SoaService } from './soa.service';

@Module({
  controllers: [SoaController, ModelingController],
  providers: [SoaService, ModelingService],
  exports: [SoaService],
})
export class SoaModule {}
