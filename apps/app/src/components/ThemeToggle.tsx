import { Monitor, Moon, Sun } from 'lucide-react';
import { Icon } from './Icon';
import { useThemePref, type ThemePref } from '../lib/themePref';

const OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'روشن', icon: Sun },
  { id: 'dark', label: 'تیره', icon: Moon },
  { id: 'system', label: 'سیستم', icon: Monitor },
];

export function ThemeToggle() {
  const [pref, setPref] = useThemePref();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">ظاهر</legend>
      <div className="flex gap-1 rounded-2xl bg-brand-50 p-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`chip flex-1 !min-h-11 gap-1.5 ${
              pref === opt.id ? 'bg-brand-700 text-on-brand' : 'text-ink-800'
            }`}
            aria-pressed={pref === opt.id}
            onClick={() => setPref(opt.id)}
          >
            <Icon icon={opt.icon} size={16} />
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
