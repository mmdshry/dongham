import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';

// jsdom/node polyfill for crypto.subtle in vitest node env
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}

describe('crypto helpers shape', () => {
  it('aes-gcm roundtrip with subtle', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode('secret-card');
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    expect(new TextDecoder().decode(plain)).toBe('secret-card');
  });
});
