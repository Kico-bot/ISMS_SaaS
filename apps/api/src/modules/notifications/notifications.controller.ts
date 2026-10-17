import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { P } from '@isms/shared';
import { RequirePermission, TenantCtx, type TenantAuthContext } from '../../kernel/auth/decorators';
import { MailService } from '../../kernel/mail/mail.service';
import { NotificationsService } from './notifications.service';

/**
 * Erinnerungen. Die Vorschau gibt es, damit sich vor dem Scharfschalten prüfen lässt, wer
 * was bekäme — eine Rundmail an die halbe Belegschaft merkt man sonst erst hinterher.
 */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
  ) {}

  /** Was ginge heute raus, an wen, mit welchem Inhalt. Verschickt nichts. */
  @Get('digest/preview')
  @RequirePermission(P.TENANT_SETTINGS)
  preview(@TenantCtx() ctx: TenantAuthContext, @Query('horizonDays') horizonDays?: string) {
    return this.notifications.preview(ctx.tenantId, horizonDays ? Number(horizonDays) : undefined);
  }

  /**
   * Die eigene Erinnerung jetzt erzeugen, zum Prüfen der Zustellung. Geht nur an die aufrufende
   * Person; alle anderen bekommen ihre Übersicht aus dem Tageslauf.
   */
  @Post('digest/send')
  @RequirePermission(P.TENANT_SETTINGS)
  async send(@TenantCtx() ctx: TenantAuthContext, @Body() body: { horizonDays?: number }) {
    const result = await this.notifications.sendOwnDigest(ctx.tenantId, ctx.personId, body?.horizonDays);
    return { ...result, delivering: this.mail.isDelivering };
  }

  /**
   * Die zuletzt erzeugten Nachrichten des eigenen Mandanten, auch die des Hintergrundprozesses.
   * Ohne SMTP ist das die einzige Stelle, an der sichtbar wird, was die Anwendung verschickt
   * hätte.
   */
  @Get('outbox')
  @RequirePermission(P.TENANT_SETTINGS)
  async outbox(@TenantCtx() ctx: TenantAuthContext) {
    return { delivering: this.mail.isDelivering, messages: await this.mail.outbox(ctx.tenantId) };
  }
}
