import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { getDb, mutate } from './db.js';
import type { UserRecord } from './types.js';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || 'dongham-dev-secret');

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function issueToken(userId: string, deviceId: string): Promise<string> {
  const token = await new SignJWT({ sub: userId, deviceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
  mutate((db) => {
    db.sessions.push({
      id: nanoid(),
      userId,
      deviceId,
      token,
      createdAt: new Date().toISOString(),
    });
  });
  return token;
}

export async function verifyToken(token: string): Promise<{ userId: string; deviceId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.deviceId !== 'string') return null;
    const db = getDb();
    const user = db.users.find((u) => u.id === payload.sub && !u.deletedAt);
    if (!user) return null;
    const session = db.sessions.find((s) => s.token === token && s.userId === payload.sub);
    if (!session) return null;
    return { userId: payload.sub, deviceId: payload.deviceId };
  } catch {
    return null;
  }
}

export function findUserByPhone(phone: string): UserRecord | undefined {
  return getDb().users.find((u) => u.phone === phone && !u.deletedAt);
}

export function findUserByEmail(email: string): UserRecord | undefined {
  return getDb().users.find((u) => u.email?.toLowerCase() === email.toLowerCase() && !u.deletedAt);
}

export function findUserByGoogleId(googleId: string): UserRecord | undefined {
  return getDb().users.find((u) => u.googleId === googleId && !u.deletedAt);
}

function storeOtp(phone: string, code: string) {
  mutate((db) => {
    db.otps = db.otps.filter((o) => o.phone !== phone);
    db.otps.push({ phone, code, expiresAt: Date.now() + 5 * 60_000 });
  });
}

async function sendKavenegar(phone: string, code: string): Promise<void> {
  const key = process.env.KAVENEGAR_API_KEY;
  if (!key) throw new Error('KAVENEGAR_API_KEY missing');
  const template = process.env.KAVENEGAR_TEMPLATE;
  const url = template
    ? `https://api.kavenegar.com/v1/${encodeURIComponent(key)}/verify/lookup.json?receptor=${encodeURIComponent(phone)}&token=${encodeURIComponent(code)}&template=${encodeURIComponent(template)}`
    : `https://api.kavenegar.com/v1/${encodeURIComponent(key)}/sms/send.json?receptor=${encodeURIComponent(phone)}&message=${encodeURIComponent(`کد ورود دونگ‌هام: ${code}`)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('ارسال پیامک ناموفق بود');
  }
}

async function sendSenator(phone: string, code: string): Promise<void> {
  const key = process.env.SENATOR_API_KEY;
  if (!key) throw new Error('SENATOR_API_KEY missing');
  const template = process.env.SENATOR_TEMPLATE || '6436172580';
  const type = process.env.SENATOR_TYPE || 'private';
  const base = process.env.SENATOR_SMS_URL || 'https://api.fast-creat.ir/sms';
  const local = /^09\d{9}$/.test(phone) ? phone : phone.replace(/^(\+98|98)/, '0');
  const url = new URL(base);
  url.searchParams.set('apikey', key);
  url.searchParams.set('type', type);
  url.searchParams.set('code', code);
  url.searchParams.set('phone', local);
  url.searchParams.set('template', template);
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string };
  if (!res.ok || !json.ok || json.status !== 'successfully') {
    throw new Error('ارسال پیامک ناموفق بود');
  }
}

/** Mock OTP in tests/dev; senator or kavenegar when configured. */
export async function sendOtp(phone: string): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  storeOtp(phone, code);
  const provider = process.env.OTP_PROVIDER || 'mock';
  if (provider === 'senator') {
    await sendSenator(phone, code);
  } else if (provider === 'kavenegar') {
    await sendKavenegar(phone, code);
  } else {
    console.log(`[OTP mock] ${phone} => ${code}`);
  }
  return code;
}

export function isOtpMock(): boolean {
  return (process.env.OTP_PROVIDER || 'mock') === 'mock';
}

export function verifyOtp(phone: string, code: string): boolean {
  const db = getDb();
  const row = db.otps.find((o) => o.phone === phone && o.code === code && o.expiresAt > Date.now());
  if (!row) return false;
  mutate((d) => {
    d.otps = d.otps.filter((o) => o.phone !== phone);
  });
  return true;
}

export function createUser(data: {
  displayName: string;
  phone?: string;
  email?: string;
  passwordHash?: string;
  googleId?: string;
}): UserRecord {
  const user: UserRecord = {
    id: nanoid(),
    displayName: data.displayName,
    phone: data.phone,
    email: data.email,
    passwordHash: data.passwordHash,
    googleId: data.googleId,
    createdAt: new Date().toISOString(),
    plan: 'free',
  };
  mutate((db) => db.users.push(user));
  return user;
}

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export async function verifyGoogleIdToken(idToken: string): Promise<{
  googleId: string;
  email?: string;
  displayName: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('ورود گوگل پیکربندی نشده');
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: clientId,
  });
  const googleId = typeof payload.sub === 'string' ? payload.sub : '';
  if (!googleId) throw new Error('توکن گوگل نامعتبر است');
  const email = typeof payload.email === 'string' ? payload.email : undefined;
  const name = typeof payload.name === 'string' ? payload.name : '';
  return {
    googleId,
    email,
    displayName: name || (email ? email.split('@')[0] : 'کاربر گوگل'),
  };
}

export async function loginWithGoogle(
  idToken: string,
  deviceId: string,
): Promise<{ token: string; user: UserRecord }> {
  const claims = await verifyGoogleIdToken(idToken);
  let user = findUserByGoogleId(claims.googleId);
  if (!user && claims.email) {
    user = findUserByEmail(claims.email);
    if (user) {
      mutate((db) => {
        const row = db.users.find((u) => u.id === user!.id);
        if (row) row.googleId = claims.googleId;
      });
      user = { ...user, googleId: claims.googleId };
    }
  }
  if (!user) {
    user = createUser({
      displayName: claims.displayName,
      email: claims.email,
      googleId: claims.googleId,
    });
  }
  const token = await issueToken(user.id, deviceId || nanoid());
  return { token, user };
}
