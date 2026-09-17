import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { PlaybooksController } from './playbooks.controller';
import { PlaybooksService } from './playbooks.service';

@Module({
  controllers: [IncidentsController, PlaybooksController],
  providers: [IncidentsService, PlaybooksService],
  exports: [IncidentsService, PlaybooksService],
})
export class IncidentsModule {}
