import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    fs: {
      // example/master/*.json を読み込めるよう、リポジトリルートを許可
      allow: ['..', '../..'],
    },
  },
  resolve: {
    alias: {
      '@sheetcraft/core': new URL('../core/src/index.ts', import.meta.url).pathname,
    },
  },
});
