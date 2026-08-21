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
  },
});
