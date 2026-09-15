import { Module } from '@nestjs/common';
import { SoaController } from './soa.controller';
import { SoaService } from './soa.service';

@Module({
  controllers: [SoaController],
  providers: [SoaService],
  exports: [SoaService],
})
export class SoaModule {}
