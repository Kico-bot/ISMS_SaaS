import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL_MIGRATOR ?? 'postgres://isms_migrator:isms_migrator@localhost:5432/isms',
  },
  verbose: true,
  strict: true,
});
