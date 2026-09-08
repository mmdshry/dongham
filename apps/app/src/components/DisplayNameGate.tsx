import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Modal } from './Dialog';
import { db } from '../lib/db';
import { updateAccountPrefs } from '../lib/cloudProfile';
import { DISPLAY_NAME_MAX, needsDisplayName, normalizeDisplayName } from '../lib/memberLabel';
import { isPublicProfilePath } from '../lib/paths';
import { useUiStore } from '../store/ui';

export function DisplayNameGate() {
  const location = useLocation();
  const profile = useLiveQuery(() => db.profile.get('self'));
  const skip =
    location.pathname.startsWith('/auth') ||
    location.pathname.startsWith('/i/') ||
    isPublicProfilePath(location.pathname);
  const open = !skip && !!profile && needsDisplayName(profile.displayName);
  const [value, setValue] = useState('');
  const setToast = useUiStore((s) => s.setToast);

  useEffect(() => {
    if (open) {
      setValue('');
    }
  }, [open]);

  const save = async () => {
    const name = normalizeDisplayName(value);
    if (needsDisplayName(name)) {
      setToast('نام لازم است', 'error');
      return;
    }
    await updateAccountPrefs({ displayName: name });
  };

  return (
    <Modal open={open} onClose={() => undefined} title="نام شما" dismissible={false}>
      <p className="text-sm leading-6 text-ink-700/80">برای استفاده از دونگ‌هام یک نام نمایشی لازم است.</p>
      <label className="label mt-3" htmlFor="required-display-name">
        نام نمایشی
      </label>
      <input
        id="required-display-name"
        className="input mt-1"
        data-autofocus
        value={value}
        maxLength={DISPLAY_NAME_MAX}
        placeholder="مثلاً محمد"
        onChange={(e) => {
          setValue(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
        }}
      />
      <button type="button" className="btn-primary mt-5 w-full" onClick={() => void save()}>
        ادامه
      </button>
    </Modal>
  );
}
