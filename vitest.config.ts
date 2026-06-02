import { defineConfig } from 'vitest/config';

// Pure-TS unit tests for the domain / application / core layers (no React Native).
// RN component tests will use jest-expo separately (added in M3).
// tsconfig `@/*` paths resolve natively via Vite (no plugin needed).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
