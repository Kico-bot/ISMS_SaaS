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
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AssignProfilesDto,
  AssignTrainingDto,
  type AuthContext,
  CompetenceProfileDto,
  CompleteTrainingDto,
  P,
  PersonSkillDto,
  SkillDto,
  TrainingDto,
  TrainingPatchDto,
} from '@isms/shared';
import { Ctx, RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { ZodPipe } from '../../kernel/http/zod.pipe';
import { CompetenceService } from './competence.service';
import { TrainingsService } from './trainings.service';

@ApiTags('competence')
@Controller('competence')
export class CompetenceController {
  constructor(private readonly competence: CompetenceService) {}

  /** Qualifikationsmatrix — eine Zeile je Person mit Sollprofil und größter Lücke. */
  @Get('matrix')
  @RequirePermission(P.COMPETENCE_READ)
  matrix(@TenantCtx() ctx: TenantAuthContext) {
    return this.competence.matrix(ctx.tenantId);
  }

  /** Offene Lücken über alle Personen — Ausgangspunkt des Schulungsplans. */
  @Get('gaps')
  @RequirePermission(P.COMPETENCE_READ)
  gaps(@TenantCtx() ctx: TenantAuthContext) {
    return this.competence.gaps(ctx.tenantId);
  }

  @Get('skills')
  @RequirePermission(P.COMPETENCE_READ)
  listSkills(@TenantCtx() ctx: TenantAuthContext) {
    return this.competence.listSkills(ctx.tenantId);
  }

  @Post('skills')
  @RequirePermission(P.COMPETENCE_WRITE)
  createSkill(@Ctx() ctx: AuthContext, @Body(new ZodPipe(SkillDto)) dto: SkillDto) {
    return this.competence.createSkill(ctx, dto);
  }

  @Delete('skills/:id')
  @HttpCode(204)
  @RequirePermission(P.COMPETENCE_WRITE)
  async deleteSkill(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.competence.deleteSkill(ctx, id);
  }

  @Get('profiles')
  @RequirePermission(P.COMPETENCE_READ)
  listProfiles(@TenantCtx() ctx: TenantAuthContext) {
    return this.competence.listProfiles(ctx.tenantId);
  }

  @Post('profiles')
  @RequirePermission(P.COMPETENCE_WRITE)
  createProfile(@Ctx() ctx: AuthContext, @Body(new ZodPipe(CompetenceProfileDto)) dto: CompetenceProfileDto) {
    return this.competence.createProfile(ctx, dto);
  }

  /** Sollprofil setzen — ersetzt die bisherigen Anforderungen vollständig. */
  @Put('profiles/:id/requirements')
  @RequirePermission(P.COMPETENCE_WRITE)
  setRequirements(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CompetenceProfileDto.pick({ requirements: true })))
    dto: { requirements: { skillId: string; minLevel: number }[] },
  ) {
    return this.competence.setRequirements(ctx, id, dto.requirements);
  }

  @Delete('profiles/:id')
  @HttpCode(204)
  @RequirePermission(P.COMPETENCE_WRITE)
  async deleteProfile(@Ctx() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.competence.deleteProfile(ctx, id);
  }

  @Get('persons/:id')
  @RequirePermission(P.COMPETENCE_READ)
  person(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.competence.getPerson(ctx.tenantId, id);
  }

  @Put('persons/:id/profiles')
  @RequirePermission(P.COMPETENCE_WRITE)
  assignProfiles(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(AssignProfilesDto)) dto: AssignProfilesDto,
  ) {
    return this.competence.assignProfiles(ctx, id, dto.profileIds);
  }

  @Put('persons/:id/skills')
  @RequirePermission(P.COMPETENCE_WRITE)
  setPersonSkill(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(PersonSkillDto)) dto: PersonSkillDto,
  ) {
    return this.competence.setPersonSkill(ctx, id, dto);
  }
}

@ApiTags('trainings')
@Controller('trainings')
export class TrainingsController {
  constructor(private readonly trainings: TrainingsService) {}

  @Get()
  @RequirePermission(P.TRAINING_READ)
  list(@TenantCtx() ctx: TenantAuthContext) {
    return this.trainings.list(ctx.tenantId);
  }

  /** „Was muss ich noch absolvieren?“ */
  @Get('mine')
  @RequirePermission(P.TRAINING_READ)
  mine(@Ctx() ctx: AuthContext) {
    return this.trainings.myOpen(ctx.tenantId!, ctx.personId);
  }

  @Get(':id')
  @RequirePermission(P.TRAINING_READ)
  get(@TenantCtx() ctx: TenantAuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trainings.get(ctx.tenantId, id);
  }

  @Post()
  @RequirePermission(P.TRAINING_WRITE)
  create(@Ctx() ctx: AuthContext, @Body(new ZodPipe(TrainingDto)) dto: TrainingDto) {
    return this.trainings.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermission(P.TRAINING_WRITE)
  update(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(TrainingPatchDto)) dto: TrainingPatchDto,
  ) {
    return this.trainings.update(ctx, id, dto);
  }

  @Post(':id/assign')
  @RequirePermission(P.TRAINING_WRITE)
  assign(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(AssignTrainingDto)) dto: AssignTrainingDto,
  ) {
    return this.trainings.assign(ctx, id, dto);
  }

  /** Teilnahme bestätigen — für sich selbst genügt das Leserecht. */
  @Post(':id/complete')
  @RequirePermission(P.TRAINING_READ)
  complete(
    @Ctx() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(CompleteTrainingDto)) dto: CompleteTrainingDto,
  ) {
    return this.trainings.complete(ctx, id, dto);
  }
}
