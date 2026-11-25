import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.{ts,tsx}'], environment: 'jsdom' } },
      { extends: true, test: { name: 'rest', include: ['tests/rest/**/*.test.{ts,tsx}'], environment: 'node', testTimeout: 60_000, hookTimeout: 120_000 } },
      { extends: true, test: { name: 'db', include: ['tests/db/**/*.test.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 120_000 } },
    ],
  },
})
