import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { USER_AVATAR_PRESETS, userAvatarFile } from './userAvatarPresets';

const APP_PUBLIC = fileURLToPath(new URL('../../public', import.meta.url));
const ADMIN_PUBLIC = fileURLToPath(new URL('../../../admin/public', import.meta.url));

const read = (root: string, id: string) => readFileSync(`${root}${userAvatarFile(id)}`, 'utf8');
const geometry = (svg: string) => createHash('md5').update(svg.replace(/#[0-9a-fA-F]{6}/g, '')).digest('hex');

describe('user avatar assets', () => {
  it('ships every catalog id in app and admin, byte for byte identical', () => {
    for (const id of USER_AVATAR_PRESETS) {
      const app = read(APP_PUBLIC, id);
      expect(app.startsWith('<svg')).toBe(true);
      expect(read(ADMIN_PUBLIC, id)).toBe(app);
    }
  });

  it('has forty distinct silhouettes (colour changes alone do not count)', () => {
    const shapes = new Set(USER_AVATAR_PRESETS.map((id) => geometry(read(APP_PUBLIC, id))));
    expect(shapes.size).toBe(USER_AVATAR_PRESETS.length);
  });
});
