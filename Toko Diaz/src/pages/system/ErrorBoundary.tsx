import { Component, type ErrorInfo, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Kesalahan tampilan:', error, info.componentStack) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div><h1 className="text-xl font-bold">Terjadi kesalahan pada tampilan</h1>
          <p className="mt-1 text-sm text-slate-500">Data Anda aman. Muat ulang halaman untuk melanjutkan.</p>
          <button className="btn-primary mt-4" onClick={() => location.reload()}>Muat ulang</button></div>
      </div>)
  }
}
