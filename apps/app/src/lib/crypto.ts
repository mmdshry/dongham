/** AES-GCM at-rest helpers for sensitive local fields. */

const ENC_KEY_META = 'encKey';

async function getOrCreateKey(): Promise<CryptoKey> {
  const existing = await import('./db').then(({ db }) => db.meta.get(ENC_KEY_META));
  if (existing?.value) {
    const raw = Uint8Array.from(atob(existing.value), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const exported = await crypto.subtle.exportKey('raw', key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  const { db } = await import('./db');
  await db.meta.put({ key: ENC_KEY_META, value: b64 });
  return key;
}

export async function encryptText(plain: string): Promise<string> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...packed));
}

export async function decryptText(payload: string): Promise<string> {
  const key = await getOrCreateKey();
  const packed = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = packed.slice(0, 12);
  const data = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new TextDecoder().decode(plain);
}

export async function encryptJson<T>(value: T): Promise<string> {
  return encryptText(JSON.stringify(value));
}

export async function decryptJson<T>(payload: string): Promise<T> {
  return JSON.parse(await decryptText(payload)) as T;
}

export async function decryptMaybe(value?: string): Promise<string> {
  if (!value) return '';
  try {
    return await decryptText(value);
  } catch {
    return value;
  }
}
