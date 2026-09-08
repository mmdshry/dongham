/** Starburst check like Telegram/Instagram verification; blue = premium, gray = free. */
export function VerifiedBadge({ premium }: { premium: boolean }) {
  const label = premium ? 'اشتراک پریمیوم' : 'حساب با یوزرنیم';
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      className={premium ? 'shrink-0 text-[#2AABEE]' : 'shrink-0 text-ink-700/40'}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <path
        fill="currentColor"
        d="M12 1.55 14.18 3.9l3.12-.48 1.1 2.95 2.95 1.1-.48 3.12L23.45 12l-2.58 2.41.48 3.12-2.95 1.1-1.1 2.95-3.12-.48L12 22.45l-2.18-2.35-3.12.48-1.1-2.95-2.95-1.1.48-3.12L.55 12l2.58-2.41-.48-3.12 2.95-1.1 1.1-2.95 3.12.48L12 1.55z"
      />
      <path
        fill="none"
        stroke="#fff"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.35 12.15 10.2 15l6.45-6.7"
      />
    </svg>
  );
}
