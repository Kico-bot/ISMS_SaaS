import { Module } from '@nestjs/common';
import { AuditsController, FindingsController, KpisController, ReviewsController } from './audit.controller';
import { AuditsService } from './audits.service';
import { FindingsService } from './findings.service';
import { KpisService } from './kpis.service';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [AuditsController, FindingsController, ReviewsController, KpisController],
  providers: [AuditsService, FindingsService, ReviewsService, KpisService],
  exports: [AuditsService, FindingsService, ReviewsService, KpisService],
})
export class AuditModule {}
