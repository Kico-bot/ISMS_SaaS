import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AuthContext,
  InterestedPartyDto,
  InterestedPartyPatchDto,
  P,
  PersonDto,
  PersonPatchDto,
  PestleFactorDto,
  PestleFactorPatchDto,
  SecurityObjectiveDto,
  SecurityObjectivePatchDto,
} from '@isms/shared';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { ContextService } from './context.service';
import { PersonsService } from './persons.service';

@ApiTags('persons')
@Controller('persons')
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  /** Lesen darf jede Rolle: ohne Personenliste lässt sich keine Verantwortung zuweisen. */
  @Get()
  @RequirePermission(P.CONTEXT_READ)
  list(@TenantCtx() ctx: TenantAuthContext, @Query('includeInactive') includeInactive?: string) {
    return this.persons.list(ctx.tenantId, includeInactive === 'true');
  }

  @Post()
  @RequirePermission(P.CONTEXT_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(PersonDto)) dto: PersonDto) {
    return this.persons.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.CONTEXT_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(PersonPatchDto)) dto: PersonPatchDto,
  ) {
    return this.persons.update(ctx, id, dto);
  }

  /** Deaktivieren statt löschen — an Personen hängen Nachweise, die ein Audit sehen will. */
  @Delete(':id')
  @HttpCode(200)
  @RequirePermission(P.CONTEXT_WRITE)
  deactivate(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.persons.deactivate(ctx, id);
  }
}

@ApiTags('context')
@Controller('context')
export class ContextController {
  constructor(private readonly context: ContextService) {}

  // --- Interessierte Parteien (Kap. 4.2) ------------------------------------------------
  @Get('parties')
  @RequirePermission(P.CONTEXT_READ)
  listParties(@TenantCtx() ctx: TenantAuthContext) {
    return this.context.listParties(ctx.tenantId);
  }

  @Post('parties')
  @RequirePermission(P.CONTEXT_WRITE)
  createParty(@Ctx() ctx: AuthContext, @Body(new ZodPipe(InterestedPartyDto)) dto: InterestedPartyDto) {
    return this.context.createParty(ctx, dto);
  }

  @Patch('parties/:id')
  @RequirePermission(P.CONTEXT_WRITE)
  updateParty(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(InterestedPartyPatchDto)) dto: InterestedPartyPatchDto,
  ) {
    return this.context.updateParty(ctx, id, dto);
  }

  @Delete('parties/:id')
  @HttpCode(204)
  @RequirePermission(P.CONTEXT_WRITE)
  async deleteParty(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.context.deleteParty(ctx, id);
  }

  // --- PESTLE (Kap. 4.1) ----------------------------------------------------------------
  @Get('factors')
  @RequirePermission(P.CONTEXT_READ)
  listFactors(@TenantCtx() ctx: TenantAuthContext) {
    return this.context.listFactors(ctx.tenantId);
  }

  @Post('factors')
  @RequirePermission(P.CONTEXT_WRITE)
  createFactor(@Ctx() ctx: AuthContext, @Body(new ZodPipe(PestleFactorDto)) dto: PestleFactorDto) {
    return this.context.createFactor(ctx, dto);
  }

  @Patch('factors/:id')
  @RequirePermission(P.CONTEXT_WRITE)
  updateFactor(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(PestleFactorPatchDto)) dto: PestleFactorPatchDto,
  ) {
    return this.context.updateFactor(ctx, id, dto);
  }

  @Delete('factors/:id')
  @HttpCode(204)
  @RequirePermission(P.CONTEXT_WRITE)
  async deleteFactor(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.context.deleteFactor(ctx, id);
  }

  // --- Informationssicherheitsziele (Kap. 6.2) -----------------------------------------
  @Get('objectives')
  @RequirePermission(P.CONTEXT_READ)
  listObjectives(@TenantCtx() ctx: TenantAuthContext) {
    return this.context.listObjectives(ctx.tenantId);
  }

  @Post('objectives')
  @RequirePermission(P.CONTEXT_WRITE)
  createObjective(
    @Ctx() ctx: AuthContext,
    @Body(new ZodPipe(SecurityObjectiveDto)) dto: SecurityObjectiveDto,
  ) {
    return this.context.createObjective(ctx, dto);
  }

  @Patch('objectives/:id')
  @RequirePermission(P.CONTEXT_WRITE)
  updateObjective(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(SecurityObjectivePatchDto)) dto: SecurityObjectivePatchDto,
  ) {
    return this.context.updateObjective(ctx, id, dto);
  }

  @Delete('objectives/:id')
  @HttpCode(204)
  @RequirePermission(P.CONTEXT_WRITE)
  async deleteObjective(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.context.deleteObjective(ctx, id);
  }
}
