/**
 * Aufträge der täglichen Erinnerung. Der Zeitplan feuert einen Auftrag `deadline-digest`; der
 * verteilt je Mandant einen eigenen Auftrag mit Schlüssel aus Mandant und Datum. Wiederholt
 * pg-boss einen Auftrag nach Absturz oder Zeitüberschreitung, trifft das nur diesen Mandanten,
 * und `digest_run` sorgt dafür, dass ein schon bedienter Mandant nichts zweimal bekommt.
 */
export const DIGEST_QUEUE = 'deadline-digest';
export const DIGEST_TENANT_QUEUE = 'deadline-digest-tenant';

export interface TenantDigestJob {
  tenantId: string;
  /** Tag des Laufs in deutscher Zeit, `YYYY-MM-DD`. */
  runDate: string;
}

export const digestJobKey = (tenantId: string, runDate: string) => `${tenantId}:${runDate}`;

/** Heutiges Datum in Deutschland als `YYYY-MM-DD`; der Server läuft in UTC. */
export const berlinToday = (now = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now);

interface JobSender {
  send(name: string, data: object, options: { singletonKey?: string }): Promise<string | null>;
}

export async function enqueueTenantDigests(
  boss: JobSender,
  tenantIds: readonly string[],
  runDate: string,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const data: TenantDigestJob = { tenantId, runDate };
    await boss.send(DIGEST_TENANT_QUEUE, data, { singletonKey: digestJobKey(tenantId, runDate) });
  }
}
