import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['node_modules', 'e2e/**', '**/*.e2e.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
