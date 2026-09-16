import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Ctx, type TenantAuthContext, TenantCtx } from '../../kernel/auth/decorators';
import { DeadlinesService } from './deadlines.service';

/**
 * Wiedervorlage. Bewusst ohne @RequirePermission: was jemand sieht, entscheidet die Abfrage
 * anhand der Leserechte — eine pauschale Sperre würde Beschäftigten ihre eigene
 * Lesebestätigung vorenthalten.
 */
@ApiTags('deadlines')
@Controller('deadlines')
export class DeadlinesController {
  constructor(private readonly deadlines: DeadlinesService) {}

  @Get()
  list(
    @TenantCtx() ctx: TenantAuthContext,
    @Query('horizonDays') horizonDays?: string,
    @Query('mine') mine?: string,
  ) {
    return this.deadlines.list(ctx, {
      horizonDays: horizonDays ? Number(horizonDays) : undefined,
      mine: mine === 'true',
    });
  }

  @Get('summary')
  summary(@TenantCtx() ctx: TenantAuthContext) {
    return this.deadlines.summary(ctx);
  }
}
