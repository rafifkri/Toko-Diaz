import { expect, test, type Page } from '@playwright/test'

const owner = { email: process.env.E2E_OWNER_EMAIL, password: process.env.E2E_OWNER_PASSWORD }
const cashier = { email: process.env.E2E_CASHIER_EMAIL, password: process.env.E2E_CASHIER_PASSWORD }

async function login(page: Page, u: { email?: string; password?: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(u.email ?? '')
  await page.getByLabel('Kata sandi').fill(u.password ?? '')
  await page.getByRole('button', { name: 'Masuk' }).click()
}

test('halaman masuk tampil dan menolak kredensial salah', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Masuk' })).toBeVisible()
  await page.getByLabel('Email').fill('salah@contoh.id'); await page.getByLabel('Kata sandi').fill('salahsalah')
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('alert')).toContainText('salah')
})

test('pengunjung tanpa login diarahkan ke halaman masuk', async ({ page }) => {
  await page.goto('/reports'); await expect(page).toHaveURL(/\/login/)
})

test.describe('dengan akun uji', () => {
  test.skip(!owner.email || !cashier.email, 'Set E2E_OWNER_* dan E2E_CASHIER_* untuk menjalankan')

  test('owner melihat dashboard dan menu lengkap', async ({ page }) => {
    await login(page, owner)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Laporan' })).toBeVisible()
  })

  test('kasir tidak melihat menu owner dan ditolak jelas di URL owner', async ({ page }) => {
    await login(page, cashier)
    await expect(page.getByRole('link', { name: 'Laporan' })).toHaveCount(0)
    await page.goto('/reports')
    await expect(page.getByText('Halaman ini khusus pemilik toko')).toBeVisible()
  })

  test('kasir menyelesaikan penjualan tunai dan kembalian tampil', async ({ page }) => {
    await login(page, cashier)
    await page.goto('/pos')
    await page.locator('button:has-text("Stok")').first().click() // produk pertama yang tersedia
    await page.getByPlaceholder('Uang diterima').fill('1000000')
    await page.getByRole('button', { name: /^Bayar/ }).click()
    await expect(page.getByText(/Kembalian/)).toBeVisible()
  })
})
