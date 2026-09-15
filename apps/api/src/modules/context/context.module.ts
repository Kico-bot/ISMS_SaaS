import { Module } from '@nestjs/common';
import { ContextController, PersonsController } from './context.controller';
import { ContextService } from './context.service';
import { PersonsService } from './persons.service';

@Module({
  controllers: [PersonsController, ContextController],
  providers: [ContextService, PersonsService],
  exports: [ContextService, PersonsService],
})
export class ContextModule {}
