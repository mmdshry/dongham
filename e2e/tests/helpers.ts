import { expect, type Page } from '@playwright/test';

export async function loginOtp(page: Page, phone: string, displayName: string) {
  await page.goto('/auth');
  await page
    .locator('label:has-text("نام نمایشی") + input, label:text-is("نام نمایشی")')
    .first()
    .fill(displayName)
    .catch(async () => {
      await page.locator('input').nth(0).fill(displayName);
    });
  const otpWait = page.waitForResponse((res) => res.url().includes('/auth/otp/request') && res.ok());
  await page.getByPlaceholder('۰۹۱۲xxxxxxx').fill(phone);
  await page.getByRole('button', { name: 'دریافت کد' }).click();
  const otpRes = await otpWait;
  const body = (await otpRes.json()) as { devCode?: string };
  if (!body.devCode) {
    throw new Error(
      'API OTP is not mock (no devCode). Stop the live API, set OTP_PROVIDER=mock, and rerun e2e — refusing to send real SMS.',
    );
  }
  expect(body.devCode).toMatch(/^\d{6}$/);
  await page.locator('input[inputmode="numeric"]').fill(body.devCode);
  await page.getByRole('button', { name: 'تأیید و ورود' }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 20_000 });
}

export async function loginAdmin(page: Page, phone = '09190755375') {
  await page.goto('http://127.0.0.1:5174/');
  const otpWait = page.waitForResponse((res) => res.url().includes('/admin/auth/otp/request') && res.ok());
  await page.getByPlaceholder('0919xxxxxxx').fill(phone);
  await page.getByRole('button', { name: 'دریافت کد' }).click();
  const otpRes = await otpWait;
  const body = (await otpRes.json()) as { devCode?: string };
  if (!body.devCode) {
    throw new Error(
      'Admin OTP is not mock (no devCode). Stop the live API, set OTP_PROVIDER=mock, and rerun e2e — refusing to send real SMS.',
    );
  }
  await page.locator('input[inputmode="numeric"]').fill(body.devCode);
  await page.getByRole('button', { name: 'ورود' }).click();
  await expect(page.getByText('ورود ادمین')).toHaveCount(0, { timeout: 20_000 });
}
