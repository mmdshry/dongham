export function BrandLogo({
  className = '',
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-[15px]' : 'text-lg';
  const mark = size === 'lg' ? 'h-10 w-10' : size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  return (
    <span className={`inline-flex items-center gap-2 text-ink-900 ${className}`}>
      <img src="/favicon.svg" alt="" className={`shrink-0 ${mark}`} />
      <span className={`font-extrabold leading-none ${text}`}>دونگ‌هام</span>
    </span>
  );
}
