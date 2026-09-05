import { useThemePref, type ThemePref } from '../lib/themePref';

const OPTIONS: { id: ThemePref; label: string }[] = [
  { id: 'light', label: 'روشن' },
  { id: 'dark', label: 'تیره' },
  { id: 'system', label: 'سیستم' },
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
            className={`chip flex-1 !min-h-10 ${
              pref === opt.id ? 'bg-brand-700 text-white' : 'text-ink-800'
            }`}
            aria-pressed={pref === opt.id}
            onClick={() => setPref(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
