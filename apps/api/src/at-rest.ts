import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function keyBytes(): Buffer {
  const raw = (process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'dongham-dev-secret').trim();
  return createHash('sha256').update(raw).digest();
}

export function isEncryptedValue(value?: string | null): boolean {
  return Boolean(value && value.startsWith(PREFIX));
}

export function encryptField(plain?: string | null): string | undefined {
  if (!plain) return undefined;
  if (isEncryptedValue(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, enc]).toString('base64')}`;
}

export function decryptField(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (!isEncryptedValue(value)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function sealIf(encrypted: boolean, value?: string | null): string | undefined {
  return encrypted ? encryptField(value) : value || undefined;
}

export function openField(value?: string | null): string | undefined {
  return decryptField(value);
}
