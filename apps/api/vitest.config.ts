import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@dongham/ledger': resolve(__dirname, '../../packages/ledger/src/index.ts'),
    },
  },
  test: { environment: 'node' },
});
