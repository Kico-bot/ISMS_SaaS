import { Module } from '@nestjs/common';
import { BiaService } from './bia.service';
import { PlansController, ProcessesController } from './continuity.controller';
import { PlansService } from './plans.service';
import { ProcessesService } from './processes.service';

@Module({
  controllers: [ProcessesController, PlansController],
  providers: [ProcessesService, BiaService, PlansService],
  exports: [ProcessesService, BiaService, PlansService],
})
export class ContinuityModule {}
