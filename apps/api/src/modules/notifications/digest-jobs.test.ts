import { describe, expect, it } from 'vitest';
import { DIGEST_TENANT_QUEUE, enqueueTenantDigests } from './digest-jobs';

describe('enqueueTenantDigests', () => {
  it('legt je Mandant einen Auftrag mit Schlüssel aus Mandant und Datum an', async () => {
    const sent: { name: string; data: unknown; options: { singletonKey?: string } }[] = [];
    const boss = {
      send: async (name: string, data: object, options: { singletonKey?: string }) => {
        sent.push({ name, data, options });
        return 'job-id';
      },
    };
    await enqueueTenantDigests(boss, ['t-1', 't-2'], '2026-10-14');
    expect(sent).toEqual([
      {
        name: DIGEST_TENANT_QUEUE,
        data: { tenantId: 't-1', runDate: '2026-10-14' },
        options: expect.objectContaining({ singletonKey: 't-1:2026-10-14' }),
      },
      {
        name: DIGEST_TENANT_QUEUE,
        data: { tenantId: 't-2', runDate: '2026-10-14' },
        options: expect.objectContaining({ singletonKey: 't-2:2026-10-14' }),
      },
    ]);
  });
});
