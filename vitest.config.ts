import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Pure-TS unit tests for the domain / application layers (no React Native).
// `@/` is aliased manually (the native resolve.tsconfigPaths option proved flaky
// in vitest 4 → intermittent "Cannot read properties of undefined (reading 'config')").
const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${src}/` }],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Run test files sequentially: parallel workers intermittently race on the
    // vite transform cache ("reading config"). The suite is tiny, so this is free.
    fileParallelism: false,
  },
});
