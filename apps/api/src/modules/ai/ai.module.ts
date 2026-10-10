import { Module } from '@nestjs/common';
import { AiSystemsController } from './ai-systems.controller';
import { AiSystemsService } from './ai-systems.service';

@Module({
  controllers: [AiSystemsController],
  providers: [AiSystemsService],
  exports: [AiSystemsService],
})
export class AiModule {}
