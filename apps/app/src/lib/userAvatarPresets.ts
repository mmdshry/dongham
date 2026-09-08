export const USER_AVATAR_GROUPS = ['male', 'female', 'teen', 'child'] as const;

export type UserAvatarGroup = (typeof USER_AVATAR_GROUPS)[number];

export const USER_AVATAR_GROUP_LABELS: Record<UserAvatarGroup, string> = {
  male: 'مردانه',
  female: 'زنانه',
  teen: 'نوجوان',
  child: 'کودک',
};

const PRESET_RE = /^(male|female|teen|child)-(0[1-9]|10)$/;

export function isUserAvatarPreset(value: unknown): value is string {
  return typeof value === 'string' && PRESET_RE.test(value);
}

export function userAvatarFile(preset: string): string | undefined {
  const match = PRESET_RE.exec(preset);
  if (!match) return undefined;
  return `/avatars/${match[1]}/${match[2]}.svg`;
}

export function userAvatarSrc(input?: { avatarPreset?: string; avatarDataUrl?: string } | null): string | undefined {
  if (input?.avatarDataUrl) return input.avatarDataUrl;
  if (input?.avatarPreset) return userAvatarFile(input.avatarPreset);
  return undefined;
}

export function presetsForGroup(group: UserAvatarGroup): string[] {
  return Array.from({ length: 10 }, (_, i) => `${group}-${String(i + 1).padStart(2, '0')}`);
}

export const USER_AVATAR_PRESETS = USER_AVATAR_GROUPS.flatMap(presetsForGroup);

export function hasUserAvatar(input?: { avatarPreset?: string; avatarDataUrl?: string } | null): boolean {
  return Boolean(userAvatarSrc(input));
}
