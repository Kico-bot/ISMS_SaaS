import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { HealthController } from './health.controller';
import { AuditLogInterceptor } from './kernel/audit-log/audit-log.interceptor';
import { AuthModule } from './kernel/auth/auth.module';
import { DbModule } from './kernel/db/db.module';
import { ProblemDetailsFilter } from './kernel/http/problem.filter';
import { TenancyModule } from './kernel/tenancy/tenancy.module';
import { AssetsModule } from './modules/assets/assets.module';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CompetenceModule } from './modules/competence/competence.module';
import { ContextModule } from './modules/context/context.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ImprovementModule } from './modules/improvement/improvement.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { MeasuresModule } from './modules/measures/measures.module';
import { RisksModule } from './modules/risks/risks.module';
import { SoaModule } from './modules/soa/soa.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    DbModule,
    AuthModule,
    TenancyModule,
    CatalogModule,
    ContextModule,
    CompetenceModule,
    SoaModule,
    MeasuresModule,
    AssetsModule,
    RisksModule,
    IncidentsModule,
    ImprovementModule,
    DocumentsModule,
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
