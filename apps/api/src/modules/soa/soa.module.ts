import { Module } from '@nestjs/common';
import { CoverageMapService } from './coverage-map.service';
import { ModelingService } from './modeling.service';
import { CoverageMapController, ModelingController, SoaController } from './soa.controller';
import { SoaService } from './soa.service';

@Module({
  controllers: [SoaController, ModelingController, CoverageMapController],
  providers: [SoaService, ModelingService, CoverageMapService],
  exports: [SoaService],
})
export class SoaModule {}
