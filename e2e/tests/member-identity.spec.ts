import { test, expect } from '@playwright/test';
import { createPeriodSubmit, loginOtp, newPeriodButton } from './helpers';

test('member cannot edit others or pick another debtor; owner can', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const memberCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  const member = await memberCtx.newPage();

  await loginOtp(owner, '09128883001');
  await owner.goto('/app');
  await newPeriodButton(owner).click();
  await owner.locator('#period-title').fill('دوره هویت');
  await createPeriodSubmit(owner).click();
  await owner.waitForURL(/\/periods\//, { timeout: 15_000 });

  await owner.getByRole('tab', { name: 'تنظیمات' }).click();
  const inviteWait = owner.waitForResponse(
    (res) => res.url().includes('/invites') && res.request().method() === 'POST' && res.ok(),
  );
  await owner.getByRole('button', { name: 'ساخت دعوت' }).click();
  const inviteBody = (await (await inviteWait).json()) as { token: string };

  await loginOtp(member, '09128883002');
  await member.goto(`/i/${inviteBody.token}`);
  await member.getByRole('button', { name: 'پیوستن و شروع ثبت هزینه' }).click();
  await member.waitForURL(/\/periods\//, { timeout: 20_000 });

  await member.getByRole('tab', { name: 'تنظیمات' }).click();
  const memberPhones = member.locator('input[placeholder="موبایل ۰۹۱۲…"]');
  await expect(memberPhones).toHaveCount(2);
  for (const el of await memberPhones.all()) {
    const value = await el.inputValue();
    if (value === '09128883002') await expect(el).toBeEnabled();
    else await expect(el).toBeDisabled();
  }

  const periodId = member.url().match(/\/periods\/([^/?#]+)/)?.[1];
  expect(periodId).toBeTruthy();

  await member.goto(`/periods/${periodId}/payment/new`);
  await expect(member.getByRole('heading', { name: 'پرداخت / تسویه' })).toBeVisible();
  const memberFrom = member.locator('select').first();
  await expect(memberFrom).toBeDisabled();

  await owner.goto(`/periods/${periodId}/payment/new`);
  await expect(owner.getByRole('heading', { name: 'پرداخت / تسویه' })).toBeVisible();
  const ownerFrom = owner.locator('select').first();
  await expect(ownerFrom).toBeEnabled();

  await ownerCtx.close();
  await memberCtx.close();
});
