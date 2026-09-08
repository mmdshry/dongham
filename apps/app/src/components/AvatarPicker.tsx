import { useRef, useState } from 'react';
import { Modal } from './Dialog';
import {
  USER_AVATAR_GROUPS,
  USER_AVATAR_GROUP_LABELS,
  presetsForGroup,
  userAvatarFile,
  type UserAvatarGroup,
} from '../lib/userAvatarPresets';

export function AvatarPicker({
  open,
  onClose,
  selectedPreset,
  hasAvatar,
  busy,
  onSelectPreset,
  onPickFile,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  selectedPreset?: string;
  hasAvatar: boolean;
  busy: boolean;
  onSelectPreset: (id: string) => void;
  onPickFile: (file?: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [group, setGroup] = useState<UserAvatarGroup>('male');

  return (
    <Modal open={open} onClose={onClose} title="انتخاب آواتار">
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {USER_AVATAR_GROUPS.map((id) => (
          <button
            key={id}
            type="button"
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${
              group === id ? 'bg-brand-700 text-on-brand' : 'bg-brand-50 text-ink-800'
            }`}
            data-autofocus={id === 'male' ? true : undefined}
            onClick={() => setGroup(id)}
          >
            {USER_AVATAR_GROUP_LABELS[id]}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {presetsForGroup(group).map((id) => {
          const src = userAvatarFile(id);
          const selected = selectedPreset === id;
          return (
            <button
              key={id}
              type="button"
              disabled={busy}
              className={`aspect-square w-full overflow-hidden rounded-full ring-2 ${
                selected ? 'ring-brand-700' : 'ring-transparent'
              }`}
              onClick={() => onSelectPreset(id)}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          از دستگاه
        </button>
        {hasAvatar ? (
          <button
            type="button"
            className="btn-ghost btn-sm text-danger"
            disabled={busy}
            onClick={() => onRemove()}
          >
            حذف عکس
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void onPickFile(e.target.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
      <button type="button" className="btn-primary mt-4 w-full" onClick={onClose}>
        تمام
      </button>
    </Modal>
  );
}
