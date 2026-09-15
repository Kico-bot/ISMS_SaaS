import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
  // NestJS braucht Decorator-Metadaten — esbuild (Vitest-Default) emittiert sie nicht, SWC schon.
  plugins: [swc.vite({ jsc: { transform: { legacyDecorator: true, decoratorMetadata: true }, target: 'es2022' } })],
});
