import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: { host: '127.0.0.1', port: 43220, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
})
