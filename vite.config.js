import { defineConfig } from 'vite';

// GitHub Pages（https://<user>.github.io/tmc-reunion-vr/）でも動くよう相対パスで出力
export default defineConfig({
  base: './',
  server: { host: true },
  build: { chunkSizeWarningLimit: 1200 },
});
