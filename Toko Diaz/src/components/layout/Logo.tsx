export default function Logo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#fff" fillOpacity=".14" />
      <path d="M14 27l4-11h28l4 11v3a6 6 0 0 1-10.7 3.7 6 6 0 0 1-9.3 0 6 6 0 0 1-9.3 0A6 6 0 0 1 14 30z" fill="#fff" />
      <path d="M18 38v10h28V38" fill="none" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
      <rect x="28" y="40" width="8" height="8" rx="1" fill="#fff" />
    </svg>)
}
