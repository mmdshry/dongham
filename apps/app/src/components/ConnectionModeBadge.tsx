import { Cloud, CloudCog, CloudOff, HardDrive } from 'lucide-react';
import { useConnectionMode } from '../lib/useConnectionMode';
import { Icon } from './Icon';

export function ConnectionModeBadge({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  const { cloud, autoSync, signedIn, label } = useConnectionMode();
  const icon = cloud ? (autoSync ? Cloud : CloudCog) : signedIn ? CloudOff : HardDrive;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
        cloud ? 'bg-brand-100 text-brand-800' : 'bg-ink-700/10 text-ink-700/70'
      } ${className}`}
      title={label}
    >
      <Icon icon={icon} size={14} className={cloud ? 'text-brand-700' : 'text-ink-700/50'} />
      {compact ? <span className="sr-only">{label}</span> : <span>{label}</span>}
    </span>
  );
}
