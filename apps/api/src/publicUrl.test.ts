import { afterEach, describe, expect, it } from 'vitest';
import { APP_HOME_PATH, appHomeUrl, appPublicUrl } from './publicUrl.js';

describe('appPublicUrl', () => {
  const prevUrl = process.env.APP_PUBLIC_URL;

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.APP_PUBLIC_URL;
    else process.env.APP_PUBLIC_URL = prevUrl;
  });

  it('uses APP_PUBLIC_URL without a trailing slash', () => {
    process.env.APP_PUBLIC_URL = 'https://dongham.ir/';
    expect(appPublicUrl()).toBe('https://dongham.ir');
    expect(appHomeUrl()).toBe('https://dongham.ir/app');
    expect(APP_HOME_PATH).toBe('/app');
  });

  it('falls back to localhost outside production', () => {
    delete process.env.APP_PUBLIC_URL;
    expect(appPublicUrl()).toBe('http://localhost:5173');
    expect(appHomeUrl()).toBe('http://localhost:5173/app');
  });
});
