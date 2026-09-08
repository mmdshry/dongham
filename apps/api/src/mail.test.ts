import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';
import {
  BRAND_NAME,
  DEFAULT_FROM_ADDRESS,
  EMAIL_LOGO_CID,
  emailAppUrl,
  emailLogoUrl,
  EMAIL_SITE_URL,
  EMAIL_SUPPORT_BLE,
  loadEmailLogo,
  otpEmailHtml,
  otpEmailPreheader,
  otpEmailSubject,
  otpEmailText,
  otpMailOptions,
  parseMailFrom,
} from './mail.js';

describe('otp email headers', () => {
  it('uses the brand name as the subject for login and link', () => {
    expect(otpEmailSubject('login')).toBe(BRAND_NAME);
    expect(otpEmailSubject('link')).toBe(BRAND_NAME);
  });

  it('parses SMTP_FROM into a display name and envelope address', () => {
    expect(parseMailFrom()).toEqual({ name: BRAND_NAME, address: DEFAULT_FROM_ADDRESS });
    expect(parseMailFrom('noreply@dongham.ir')).toEqual({ name: BRAND_NAME, address: 'noreply@dongham.ir' });
    expect(parseMailFrom('دونگ‌هام <hello@dongham.ir>')).toEqual({ name: BRAND_NAME, address: 'hello@dongham.ir' });
    expect(parseMailFrom('"Dongham" <ops@dongham.ir>')).toEqual({ name: 'Dongham', address: 'ops@dongham.ir' });
  });
});

describe('otp email template', () => {
  it('uses the light brand theme, Tahoma, logo, and the six-digit code', () => {
    const html = otpEmailHtml('483920', 'login');
    expect(html).toContain('lang="fa"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('Tahoma');
    expect(html).not.toContain('Vazirmatn');
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).toContain('#F6F0E8');
    expect(html).toContain('#FFFCF8');
    expect(html).toContain('#5E7262');
    expect(html).toContain('483920');
    expect(html).toContain(BRAND_NAME);
    expect(html).toContain(`cid:${EMAIL_LOGO_CID}`);
    expect(html).toContain('width="64"');
    expect(html).toContain(otpEmailPreheader('483920', 'login'));
    expect(html).toContain(`href="${emailAppUrl()}"`);
    expect(html).toContain('ورود به دونگ‌هام');
    expect(html).toContain('این کد را با کسی به اشتراک نگذارید');
    expect(html).toContain('دفتر حساب گروهی، نه کیف پول');
    expect(html).toContain(EMAIL_SITE_URL);
    expect(html).toContain(EMAIL_SUPPORT_BLE);
    expect(otpEmailHtml('483920', 'login', emailLogoUrl())).toContain(emailLogoUrl());
  });

  it('explains login vs link in the body, not the subject', () => {
    expect(otpEmailText('483920', 'login')).toContain('ورود به دونگ‌هام');
    expect(otpEmailText('483920', 'login')).toContain('483920');
    expect(otpEmailText('483920', 'link')).toContain('اتصال این ایمیل');
    expect(otpEmailPreheader('483920', 'link')).toContain('اتصال');
    expect(otpEmailHtml('221100', 'link')).toContain('اتصال این ایمیل');
  });
});

describe('otp mime encoding', () => {
  it('encodes the Persian subject and from name as RFC 2047 words', async () => {
    const logo = loadEmailLogo();
    expect(logo?.length).toBeGreaterThan(100);

    const transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    const info = await transporter.sendMail(otpMailOptions('user@example.com', '483920', 'login'));
    const raw = Buffer.isBuffer(info.message) ? info.message.toString('utf8') : String(info.message);
    const encodedSubject = Buffer.from(BRAND_NAME, 'utf8').toString('base64');

    expect(raw).toMatch(/Subject:\s*=\?UTF-8\?B\?/i);
    expect(raw).toContain(encodedSubject);
    expect(raw).toMatch(/From:.*\?UTF-8\?B\?/i);
    expect(raw).toContain(`Content-ID: <${EMAIL_LOGO_CID}>`);
    expect(raw).toContain('Content-Language: fa');
    expect(raw).toContain('user@example.com');
  });
});
