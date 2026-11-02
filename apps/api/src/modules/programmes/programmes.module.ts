import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { SoaModule } from '../soa/soa.module';
import { ProgrammesController } from './programmes.controller';
import { ProgrammesService } from './programmes.service';

@Module({
  imports: [DashboardModule, SoaModule, AiModule],
  controllers: [ProgrammesController],
  providers: [ProgrammesService],
})
export class ProgrammesModule {}
