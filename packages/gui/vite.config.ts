import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/sheetcraft/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@sheetcraft/core': new URL('../core/src/index.ts', import.meta.url).pathname,
    },
  },
});
