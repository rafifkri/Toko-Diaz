/** URL absolut ke halaman aplikasi, memperhitungkan base path (mis. /Toko-Diaz/ di GitHub Pages). */
export function appUrl(path = ''): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
}
