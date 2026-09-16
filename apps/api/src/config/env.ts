import { z } from 'zod';

/**
 * `z.coerce.boolean()` wäre hier falsch: es macht aus der Zeichenkette „false“ ein `true`,
 * weil jede nicht-leere Zeichenkette wahr ist. Ein `JOBS_ENABLED=false` würde damit
 * den Auftragsdienst einschalten.
 */
const boolish = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no', ''])
    .default(fallback ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1' || v === 'yes');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().default(3000),
  API_BASE_URL: z.string().url().default('http://localhost:3000'),
  WEB_BASE_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET braucht mindestens 32 Zeichen'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  APP_MASTER_KEY: z.string().min(16),
  STORAGE_DRIVER: z.enum(['local', 's3', 'azure']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./var/files'),
  /**
   * `log` verschickt nichts, sondern protokolliert — damit läuft die Anwendung ohne
   * SMTP-Entscheidung und ohne Kosten. Erst `smtp` stellt tatsächlich zu.
   */
  MAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: boolish(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('isms@localhost'),

  /** Hintergrundaufträge laufen im eigenen Prozess (`pnpm --filter @isms/api worker`). */
  JOBS_ENABLED: boolish(false),
  /**
   * pg-boss legt ein eigenes Schema an und braucht dafür DDL-Rechte — die hat `isms_app`
   * bewusst nicht. Ohne Angabe fällt der Auftragsdienst auf DATABASE_URL zurück und meldet,
   * wenn ihm die Rechte fehlen.
   */
  DATABASE_URL_MIGRATOR: z.string().optional(),
  /** Werktags um 7 Uhr (UTC). Cron-Syntax wie bei pg-boss. */
  DIGEST_CRON: z.string().default('0 7 * * 1-5'),
  /** Wie weit die tägliche Erinnerung vorausschaut. */
  DIGEST_HORIZON_DAYS: z.coerce.number().int().min(1).max(90).default(14),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Validiert process.env einmalig; ein fehlerhaftes Setup bricht den Start mit klarer Meldung ab. */
export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  if (cached && Object.keys(overrides).length === 0) return cached;
  const parsed = EnvSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Ungültige Umgebungskonfiguration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
