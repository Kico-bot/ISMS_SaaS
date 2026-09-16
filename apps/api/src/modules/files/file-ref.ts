import { BadRequestException } from '@nestjs/common';
import { schema } from '@isms/db';
import { and, eq } from 'drizzle-orm';
import type { TenantTx } from '../../kernel/db/db.service';

/**
 * Prüft, dass eine referenzierte Datei zu diesem Mandanten gehört.
 *
 * Bewusst eine freie Funktion statt eines injizierten Dienstes: an einer Datei hängen
 * Nachweise, Dokumentenversionen, Auditberichte, Protokolle und Zertifikate — quer durch
 * alle Module. Ein Dienst dafür würde jedes dieser Module an das Dateimodul binden.
 *
 * Die Zeilensicherheit blendet fremde Dateien ohnehin aus; die Prüfung macht aus dem
 * daraus folgenden stillen `null` eine verständliche Meldung.
 */
export async function requireTenantFile(tx: TenantTx, tenantId: string, id: string): Promise<void> {
  const [f] = await tx
    .select({ id: schema.file.id })
    .from(schema.file)
    .where(and(eq(schema.file.id, id), eq(schema.file.tenantId, tenantId)));
  if (!f) throw new BadRequestException({ title: 'Die Datei gehört nicht zu diesem Mandanten' });
}
