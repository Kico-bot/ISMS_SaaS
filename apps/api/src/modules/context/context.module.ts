import { Module } from '@nestjs/common';
import { ContextController, PersonsController } from './context.controller';
import { ContextService } from './context.service';
import { PlanningService } from './planning.service';
import { PersonsService } from './persons.service';

@Module({
  controllers: [PersonsController, ContextController],
  providers: [ContextService, PlanningService, PersonsService],
  exports: [ContextService, PlanningService, PersonsService],
})
export class ContextModule {}
