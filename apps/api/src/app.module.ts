import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthController } from './health.controller';
import { AuditLogInterceptor } from './kernel/audit-log/audit-log.interceptor';
import { AuthModule } from './kernel/auth/auth.module';
import { DbModule } from './kernel/db/db.module';
import { JobsModule } from './kernel/jobs/jobs.module';
import { MailModule } from './kernel/mail/mail.module';
import { StorageModule } from './kernel/storage/storage.module';
import { ProblemDetailsFilter } from './kernel/http/problem.filter';
import { TenancyModule } from './kernel/tenancy/tenancy.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CompetenceModule } from './modules/competence/competence.module';
import { ContextModule } from './modules/context/context.module';
import { ContinuityModule } from './modules/continuity/continuity.module';
import { AuditLogModule } from './modules/auditlog/auditlog.module';
import { DeadlinesModule } from './modules/deadlines/deadlines.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ExportsModule } from './modules/exports/exports.module';
import { FilesModule } from './modules/files/files.module';
import { ImprovementModule } from './modules/improvement/improvement.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { MeasuresModule } from './modules/measures/measures.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { AiModule } from './modules/ai/ai.module';
import { RisksModule } from './modules/risks/risks.module';
import { SoaModule } from './modules/soa/soa.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    DbModule,
    StorageModule,
    MailModule,
    JobsModule,
    AuthModule,
    TenancyModule,
    CatalogModule,
    ContextModule,
    CompetenceModule,
    ContinuityModule,
    PrivacyModule,
    AiModule,
    SoaModule,
    MeasuresModule,
    AssetsModule,
    RisksModule,
    IncidentsModule,
    ImprovementModule,
    DocumentsModule,
    FilesModule,
    ExportsModule,
    DeadlinesModule,
    AuditLogModule,
    NotificationsModule,
    AuditModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule {}
