import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { AuditPackageService } from './package.service';

@Module({
  controllers: [ExportsController],
  providers: [ExportsService, AuditPackageService],
  exports: [ExportsService, AuditPackageService],
})
export class ExportsModule {}
