import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { normalizeEmail, normalizeIranMobile, normalizeOtpCode } from '@dongham/ledger';
import {
  claimMemberships,
  consumeOtp,
  deleteSessionByToken,
  extraAdminPhones as loadExtraAdminPhones,
  findSession,
  findUserByEmail as repoFindUserByEmail,
  findUserByGoogleId as repoFindUserByGoogleId,
  findUserByPhone as repoFindUserByPhone,
  getUserById,
  insertSession,
  insertUser,
  storeOtp as repoStoreOtp,
  updateUser,
} from './repo.js';
import type { UserRecord } from './types.js';

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET || 'dongham-dev-secret');

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type TokenRole = 'admin' | 'user';

export type IssuedTokenOpts = {
  expiresIn?: string;
  role?: TokenRole;
  impersonatedBy?: string;
};

export function adminPhones(): string[] {
  const raw = process.env.ADMIN_PHONES ?? '09190755375,09306057083';
  return raw
    .split(',')
    .map((s) => normalizeIranMobile(s.trim()))
    .filter((p): p is string => Boolean(p));
}

export async function extraAdminPhones(): Promise<string[]> {
  return (await loadExtraAdminPhones())
    .map((s) => normalizeIranMobile(s))
    .filter((p): p is string => Boolean(p));
}

export async function isAdminPhone(phone?: string): Promise<boolean> {
  const local = normalizeIranMobile(phone);
  if (!local) return false;
  return adminPhones().includes(local) || (await extraAdminPhones()).includes(local);
}

export async function revokeSession(token: string): Promise<void> {
  await deleteSessionByToken(token);
}

export function isUserBanned(user?: UserRecord | null): boolean {
  return Boolean(user?.bannedAt);
}

export async function issueToken(userId: string, deviceId: string, opts?: IssuedTokenOpts): Promise<string> {
  const existing = await getUserById(userId);
  if (!existing || existing.deletedAt || isUserBanned(existing)) {
    throw new Error('این حساب مسدود است');
  }
  const claims: Record<string, unknown> = { sub: userId, deviceId };
  if (opts?.role === 'admin') claims.role = 'admin';
  if (opts?.impersonatedBy) claims.impersonatedBy = opts.impersonatedBy;
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(opts?.expiresIn || '30d')
    .sign(secret());
  await insertSession({
    id: nanoid(),
    userId,
    deviceId,
    token,
    createdAt: new Date().toISOString(),
  });
  return token;
}

export async function verifyToken(token: string): Promise<{
  userId: string;
  deviceId: string;
  role: TokenRole;
  impersonatedBy?: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub || typeof payload.deviceId !== 'string') return null;
    const user = await getUserById(payload.sub);
    if (!user || user.deletedAt || isUserBanned(user)) return null;
    if (!(await findSession(token, payload.sub))) return null;
    const role: TokenRole = payload.role === 'admin' ? 'admin' : 'user';
    const impersonatedBy = typeof payload.impersonatedBy === 'string' ? payload.impersonatedBy : undefined;
    return { userId: payload.sub, deviceId: payload.deviceId, role, impersonatedBy };
  } catch {
    return null;
  }
}

export async function findUserByPhone(phone: string): Promise<UserRecord | undefined> {
  const local = normalizeIranMobile(phone);
  if (!local) return undefined;
  return repoFindUserByPhone(local);
}

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;
  return repoFindUserByEmail(normalized);
}

export async function findUserByGoogleId(googleId: string): Promise<UserRecord | undefined> {
  return repoFindUserByGoogleId(googleId);
}

async function storeOtp(phone: string, code: string) {
  await repoStoreOtp(phone, code, Date.now() + 5 * 60_000);
}

export function otpProvider(): string {
  const explicit = (process.env.OTP_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'mock') return 'mock';
  if (explicit === 'kavenegar') return 'kavenegar';
  if (explicit === 'senator') return 'senator';
  if (process.env.SENATOR_API_KEY) return 'senator';
  if (process.env.KAVENEGAR_API_KEY) return 'kavenegar';
  return 'mock';
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

const SENATOR_ERRORS: Record<number, string> = {
  400: 'خطای سامانه پیامک',
  401: 'نوع ارسال پیامک نامعتبر است',
  402: 'کلید API پیامک نامعتبر است',
  403: 'موجودی پنل پیامک کافی نیست',
  404: 'کد پیامک نامعتبر است',
  405: 'شماره موبایل برای پیامک نامعتبر است',
  406: 'قالب پیامک نامعتبر است',
  407: 'حساب در ربات پیامک سناتور ثبت نشده است',
  500: 'حساب پیامک مسدود است',
};

async function sendSenator(phone: string, code: string): Promise<void> {
  const key = process.env.SENATOR_API_KEY;
  if (!key) throw new Error('SENATOR_API_KEY missing');
  const template = process.env.SENATOR_TEMPLATE || '6436172580';
  const type = process.env.SENATOR_TYPE || 'private';
  const base = process.env.SENATOR_SMS_URL || 'https://api.fast-creat.ir/sms';
  const local = normalizeIranMobile(phone) || phone;
  const url = new URL(base);
  url.searchParams.set('apikey', key);
  url.searchParams.set('type', type);
  url.searchParams.set('code', code);
  url.searchParams.set('phone', local);
  url.searchParams.set('template', template);
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    status?: string;
    message?: string;
    result?: { error_code?: number; Tracking_code?: string; code?: string };
  };
  const errorCode = json.result?.error_code;
  if (!res.ok || !json.ok || json.status !== 'successfully' || !json.result?.Tracking_code) {
    console.error('[senator sms]', errorCode || json.message || json.status || res.status, json.result);
    throw new Error((errorCode && SENATOR_ERRORS[errorCode]) || 'ارسال پیامک ناموفق بود');
  }
  console.log(`[senator sms] sent phone=${local} tracking=${json.result.Tracking_code}`);
}

export async function fetchSenatorAmount(): Promise<{
  configured: boolean;
  amount?: number;
  error?: string;
}> {
  const key = process.env.SENATOR_API_KEY;
  if (!key) return { configured: false };
  try {
    const base = process.env.SENATOR_SMS_URL || 'https://api.fast-creat.ir/sms';
    const url = new URL(base);
    url.searchParams.set('apikey', key);
    url.searchParams.set('type', 'amount');
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      result?: { amount?: number | string };
    };
    const amount = Number(json.result?.amount);
    if (!res.ok || json.ok === false || !Number.isFinite(amount)) {
      return { configured: true, error: json.message || 'موجودی خوانده نشد' };
    }
    return { configured: true, amount };
  } catch {
    return { configured: true, error: 'خطا در ارتباط با سناتور' };
  }
}

/** Mock OTP in tests/dev; senator when SENATOR_API_KEY is set, or kavenegar when configured. */
export async function sendOtp(phone: string): Promise<string> {
  const local = normalizeIranMobile(phone);
  if (!local) throw new Error('شماره موبایل نامعتبر است');
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const provider = otpProvider();
  try {
    if (provider === 'senator') {
      console.log(`[otp] provider=senator phone=${local}`);
      await sendSenator(local, code);
    } else if (provider === 'kavenegar') {
      console.log(`[otp] provider=kavenegar phone=${local}`);
      await sendKavenegar(local, code);
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('ارسال پیامک پیکربندی نشده است');
    } else {
      console.log(`[OTP mock] ${local} => ${code}`);
    }
  } catch (err) {
    console.error('[otp send]', err instanceof Error ? err.message : err);
    throw err;
  }
  await storeOtp(local, code);
  return code;
}

export function isOtpMock(): boolean {
  return otpProvider() === 'mock';
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const local = normalizeIranMobile(phone);
  const otp = normalizeOtpCode(code);
  if (!local || !otp) return false;
  return consumeOtp(local, otp);
}

export async function claimListedMemberships(user: UserRecord): Promise<void> {
  await claimMemberships({
    ...user,
    phone: normalizeIranMobile(user.phone) || user.phone,
    email: normalizeEmail(user.email) || user.email,
  });
}

export async function createUser(data: {
  displayName: string;
  phone?: string;
  email?: string;
  passwordHash?: string;
  googleId?: string;
}): Promise<UserRecord> {
  const user: UserRecord = {
    id: nanoid(),
    displayName: data.displayName,
    phone: normalizeIranMobile(data.phone) || data.phone,
    email: normalizeEmail(data.email) || data.email,
    passwordHash: data.passwordHash,
    googleId: data.googleId,
    createdAt: new Date().toISOString(),
    plan: 'free',
  };
  await insertUser(user);
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
  let user = await findUserByGoogleId(claims.googleId);
  if (!user && claims.email) {
    user = await findUserByEmail(claims.email);
    if (user) {
      user = { ...user, googleId: claims.googleId };
      await updateUser(user);
    }
  }
  if (!user) {
    user = await createUser({
      displayName: claims.displayName,
      email: claims.email,
      googleId: claims.googleId,
    });
  }
  if (isUserBanned(user)) {
    throw new Error('این حساب مسدود است');
  }
  const token = await issueToken(user.id, deviceId || nanoid());
  return { token, user };
}
