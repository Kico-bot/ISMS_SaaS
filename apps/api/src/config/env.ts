import { z } from 'zod';

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
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_FROM: z.string().default('isms@localhost'),
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
