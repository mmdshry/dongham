import { initials } from '../lib/initials';

const SIZE = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-24 w-24 text-2xl',
} as const;

export function UserAvatar({
  name,
  src,
  size = 'md',
  className = '',
  title,
}: {
  name: string;
  src?: string;
  size?: keyof typeof SIZE;
  className?: string;
  title?: string;
}) {
  const label = title || name;
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-bold text-brand-800 ${SIZE[size]} ${className}`;
  if (src) {
    return (
      <span className={base} title={label}>
        <img src={src} alt="" className="aspect-square h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className={base} title={label} aria-hidden={!title}>
      {initials(name || '؟')}
    </span>
  );
}
