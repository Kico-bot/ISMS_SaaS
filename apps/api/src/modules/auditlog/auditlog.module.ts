import { Module } from '@nestjs/common';
import { AuditLogController } from './auditlog.controller';
import { AuditLogService } from './auditlog.service';

@Module({
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogModule {}
