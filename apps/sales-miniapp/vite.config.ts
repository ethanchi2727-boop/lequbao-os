import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      '@lequ/mobile-ui/product-home': fileURLToPath(
        new URL('../../packages/mobile-ui/src/ProductHome.vue', import.meta.url),
      ),
      '@lequ/mobile-ui/product-module': fileURLToPath(
        new URL('../../packages/mobile-ui/src/ProductModule.vue', import.meta.url),
      ),
      '@lequ/product-catalog': fileURLToPath(
        new URL('../../packages/product-catalog/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 43218,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
})
