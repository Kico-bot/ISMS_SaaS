/**
 * H6: Die Schnittstellendokumentation listet jeden Endpunkt samt Feldern. In Produktion ist sie
 * eine Landkarte für Angreifer und für niemanden sonst nötig; dort wird sie nicht eingehängt.
 */
import 'reflect-metadata';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setTestEnv } from './setup';

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

/** Status der Dokumentation in einer frisch gebauten App unter `NODE_ENV=nodeEnv`. */
async function docsStatus(nodeEnv: 'test' | 'development' | 'production'): Promise<number[]> {
  setTestEnv();
  process.env.NODE_ENV = nodeEnv;
  // Eigene Schlüssel: Mit denen aus dem Repository verweigert die API in Produktion den Start.
  process.env.JWT_SECRET = 'swagger-test-geheim-swagger-test-geheim-0123';
  process.env.APP_MASTER_KEY = 'swagger-test-master-key-0123456789';
  vi.resetModules(); // loadEnv merkt sich die Umgebung; jede Variante braucht eine eigene App.
  const { createApp } = await import('../src/app.factory');
  const app = await createApp();
  await app.init();
  try {
    const http = request(app.getHttpServer());
    return [(await http.get('/api/docs')).status, (await http.get('/api/docs-json')).status];
  } finally {
    await app.close();
  }
}

describe('Schnittstellendokumentation (H6)', () => {
  it('ist in Produktion nicht eingehängt', async () => {
    expect(await docsStatus('production')).toEqual([404, 404]);
  });

  // Nur die Oberfläche: Das JSON baut Nest aus den Decorator-Metadaten, und die erzeugt SWC unter
  // Vitest nicht vollständig (500 hier, 200 im gebauten Server).
  it.each(['development', 'test'] as const)('steht unter NODE_ENV=%s bereit', async (nodeEnv) => {
    const [ui] = await docsStatus(nodeEnv);
    expect(ui).toBe(200);
  });
});
