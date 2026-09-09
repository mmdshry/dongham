export function UnreadDot({ className = '' }: { className?: string }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full bg-danger ${className}`} aria-hidden />;
}
