import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Public } from './kernel/auth/decorators';
import { DbService } from './kernel/db/db.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dbs: DbService) {}

  @Public()
  @Get()
  async health() {
    const r = await this.dbs.db.execute(sql`SELECT 1 AS ok`);
    return { status: 'ok', db: r.rows[0]?.ok === 1 ? 'ok' : 'error', time: new Date().toISOString() };
  }
}
