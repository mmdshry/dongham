import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import type { SendMailOptions, Transporter } from 'nodemailer';
import { appHomeUrl, appPublicUrl } from './publicUrl.js';

const BG = '#F6F0E8';
const SURFACE = '#FFFCF8';
const BRAND = '#5E7262';
const INK = '#24201C';
const MUTED = '#5A524A';
const ON_BRAND = '#FFFAF5';
const FONT = 'Tahoma, Arial, sans-serif';

export const BRAND_NAME = 'دونگ‌هام';
export const EMAIL_LOGO_CID = 'dongham-logo@dongham.ir';
export const EMAIL_SITE_URL = 'https://dongham.ir';
export const EMAIL_SUPPORT_BLE = 'https://ble.ir/dongham';
export const DEFAULT_FROM_ADDRESS = 'noreply@dongham.ir';

export function emailAppUrl(): string {
  return appHomeUrl();
}

export function emailLogoUrl(): string {
  return `${appPublicUrl()}/icons/icon-192.png`;
}

/** Snapshot of the public URLs at process start (prefer emailAppUrl / emailLogoUrl). */
export const EMAIL_APP_URL = emailAppUrl();
export const EMAIL_LOGO_URL = emailLogoUrl();

export type EmailOtpPurpose = 'login' | 'link';

export type MailFrom = { name: string; address: string };

export function isSmtpMock(): boolean {
  if (process.env.SMTP_MOCK === '1') return true;
  if (process.env.NODE_ENV === 'test') return true;
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();
  return !user || !pass;
}

function smtpPort(): number {
  const port = Number(process.env.SMTP_PORT || 465);
  return Number.isFinite(port) && port > 0 ? port : 465;
}

function smtpSecure(): boolean {
  const raw = (process.env.SMTP_SECURE || '').trim();
  if (raw === '0' || raw.toLowerCase() === 'false') return false;
  if (raw === '1' || raw.toLowerCase() === 'true') return true;
  return smtpPort() === 465;
}

export function parseMailFrom(raw?: string): MailFrom {
  const value = (raw ?? '').trim();
  const angled = value.match(/^(.*?)\s*<([^>]+)>$/);
  if (angled) {
    const name = angled[1].replace(/^["']|["']$/g, '').trim() || BRAND_NAME;
    return { name, address: angled[2].trim() };
  }
  if (/^[^\s<>]+@[^\s<>]+$/.test(value)) {
    return { name: BRAND_NAME, address: value };
  }
  return { name: BRAND_NAME, address: DEFAULT_FROM_ADDRESS };
}

function mailFrom(): MailFrom {
  return parseMailFrom(process.env.SMTP_FROM || `${BRAND_NAME} <${DEFAULT_FROM_ADDRESS}>`);
}

let transporter: Transporter | undefined;
let logoBuffer: Buffer | null | undefined;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: (process.env.SMTP_HOST || 'mail.dongham.ir').trim(),
    port: smtpPort(),
    secure: smtpSecure(),
    auth: {
      user: (process.env.SMTP_USER || '').trim(),
      pass: process.env.SMTP_PASS || '',
    },
  });
  return transporter;
}

export function loadEmailLogo(): Buffer | null {
  if (logoBuffer !== undefined) return logoBuffer;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const path of [join(here, 'assets', 'email-logo.png'), join(here, '..', 'src', 'assets', 'email-logo.png')]) {
    if (!existsSync(path)) continue;
    logoBuffer = readFileSync(path);
    return logoBuffer;
  }
  logoBuffer = null;
  return null;
}

export function otpEmailSubject(_purpose?: EmailOtpPurpose): string {
  return BRAND_NAME;
}

export function otpEmailPreheader(code: string, purpose: EmailOtpPurpose): string {
  const lead = purpose === 'link' ? 'کد تأیید اتصال ایمیل' : 'کد ورود شما';
  return `${lead}: ${code} — تا ۵ دقیقه معتبر است`;
}

function purposeCopy(purpose: EmailOtpPurpose): { lead: string; codeLabel: string } {
  if (purpose === 'link') {
    return {
      lead: 'برای اتصال این ایمیل به حساب دونگ‌هام، کد زیر را وارد کنید.',
      codeLabel: 'کد تأیید',
    };
  }
  return {
    lead: 'برای ورود به دونگ‌هام، کد زیر را در اپ وارد کنید.',
    codeLabel: 'کد ورود',
  };
}

export function otpEmailText(code: string, purpose: EmailOtpPurpose): string {
  const { lead, codeLabel } = purposeCopy(purpose);
  return [
    BRAND_NAME,
    '',
    'سلام',
    '',
    lead,
    '',
    `${codeLabel}: ${code}`,
    '',
    'این کد تا ۵ دقیقه معتبر است. این کد را با کسی به اشتراک نگذارید.',
    'اگر این درخواست از طرف شما نبوده، این نامه را نادیده بگیرید.',
    '',
    `ورود به دونگ‌هام: ${emailAppUrl()}`,
    '',
    'دفتر حساب گروهی، نه کیف پول',
    EMAIL_SITE_URL,
    `پشتیبانی بله: ${EMAIL_SUPPORT_BLE}`,
  ].join('\n');
}

export function otpEmailHtml(code: string, purpose: EmailOtpPurpose, logoSrc = `cid:${EMAIL_LOGO_CID}`): string {
  const title = otpEmailSubject(purpose);
  const preheader = otpEmailPreheader(code, purpose);
  const { lead } = purposeCopy(purpose);
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BG};color:${INK};font-family:${FONT};">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${SURFACE};border-radius:20px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:32px 28px 12px;">
              <img src="${logoSrc}" alt="${BRAND_NAME}" width="64" height="64" style="display:block;border:0;outline:none;text-decoration:none;">
              <div style="font-weight:800;font-size:22px;line-height:1.2;color:${INK};margin-top:14px;">${BRAND_NAME}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-size:16px;line-height:1.8;color:${INK};text-align:right;font-weight:700;">
              سلام
            </td>
          </tr>
          <tr>
            <td style="padding:4px 28px 0;font-size:15px;line-height:1.9;color:${MUTED};text-align:right;">
              ${lead}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 28px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="background:${BG};border-radius:14px;">
                <tr>
                  <td align="center" dir="ltr" style="padding:16px 28px;letter-spacing:0.28em;font-weight:800;font-size:32px;line-height:1.2;color:${BRAND};font-family:${FONT};">
                    ${code}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0;font-size:13px;line-height:1.8;color:${MUTED};text-align:right;">
              این کد تا ۵ دقیقه معتبر است. این کد را با کسی به اشتراک نگذارید.
            </td>
          </tr>
          <tr>
            <td style="padding:4px 28px 0;font-size:13px;line-height:1.8;color:${MUTED};text-align:right;">
              اگر این درخواست از طرف شما نبوده، این نامه را نادیده بگیرید.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 28px 8px;">
              <a href="${emailAppUrl()}" style="display:inline-block;background:${BRAND};color:${ON_BRAND};text-decoration:none;font-weight:700;font-size:15px;line-height:1;padding:14px 28px;border-radius:12px;font-family:${FONT};">ورود به دونگ‌هام</a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;border-top:1px solid #E8DFD4;font-size:12px;line-height:1.8;color:${MUTED};text-align:center;">
              دفتر حساب گروهی، نه کیف پول
              <br>
              <a href="${EMAIL_SITE_URL}" style="color:${BRAND};text-decoration:none;">${EMAIL_SITE_URL.replace('https://', '')}</a>
              ·
              <a href="${EMAIL_SUPPORT_BLE}" style="color:${BRAND};text-decoration:none;">پشتیبانی بله</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function otpMailOptions(to: string, code: string, purpose: EmailOtpPurpose): SendMailOptions {
  const from = mailFrom();
  const logo = loadEmailLogo();
  const logoSrc = logo ? `cid:${EMAIL_LOGO_CID}` : emailLogoUrl();
  const options: SendMailOptions = {
    from,
    envelope: { from: from.address, to },
    to,
    subject: otpEmailSubject(purpose),
    text: otpEmailText(code, purpose),
    html: otpEmailHtml(code, purpose, logoSrc),
    textEncoding: 'base64',
    headers: {
      'Content-Language': 'fa',
    },
  };
  if (logo) {
    options.attachments = [
      {
        filename: 'dongham.png',
        content: logo,
        cid: EMAIL_LOGO_CID,
        contentDisposition: 'inline',
        contentType: 'image/png',
      },
    ];
  }
  return options;
}

export async function sendOtpEmail(to: string, code: string, purpose: EmailOtpPurpose): Promise<void> {
  if (isSmtpMock()) {
    if (process.env.NODE_ENV === 'production' && process.env.SMTP_MOCK !== '1') {
      throw new Error('ارسال ایمیل پیکربندی نشده است');
    }
    console.log(`[OTP email mock] ${to} => ${code} purpose=${purpose}`);
    return;
  }
  try {
    await getTransporter().sendMail(otpMailOptions(to, code, purpose));
  } catch (err) {
    console.error('[otp email]', err instanceof Error ? err.message : err);
    throw new Error('ارسال ایمیل ناموفق بود');
  }
}
