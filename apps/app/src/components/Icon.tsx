import type { LucideIcon, LucideProps } from 'lucide-react';

export function Icon({
  icon: Lucide,
  size = 20,
  strokeWidth = 1.8,
  ...props
}: { icon: LucideIcon } & Omit<LucideProps, 'ref'>) {
  return <Lucide size={size} strokeWidth={strokeWidth} absoluteStrokeWidth aria-hidden {...props} />;
}
