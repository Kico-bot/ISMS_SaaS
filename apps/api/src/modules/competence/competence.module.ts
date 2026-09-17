import { Module } from '@nestjs/common';
import { CompetenceController, TrainingsController } from './competence.controller';
import { CompetenceService } from './competence.service';
import { TrainingsService } from './trainings.service';

@Module({
  controllers: [CompetenceController, TrainingsController],
  providers: [CompetenceService, TrainingsService],
  exports: [CompetenceService, TrainingsService],
})
export class CompetenceModule {}
