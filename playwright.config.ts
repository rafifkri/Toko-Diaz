import { defineConfig } from '@playwright/test'

// Uji e2e butuh browser (npx playwright install chromium) dan project Supabase uji.
// Isi E2E_BASE_URL, E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD, E2E_CASHIER_EMAIL, E2E_CASHIER_PASSWORD.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173', trace: 'retain-on-failure' },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true },
})
