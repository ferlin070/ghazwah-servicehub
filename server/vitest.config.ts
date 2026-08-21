import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('test'),
    'process.env.JWT_SECRET': JSON.stringify('test-secret-key-for-testing-only'),
    'process.env.DATABASE_URL': JSON.stringify(process.env.DATABASE_URL ?? 'postgresql://localhost:5432/ghazwah_test'),
  },
});
