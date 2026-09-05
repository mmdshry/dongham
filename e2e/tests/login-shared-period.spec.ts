import { test, expect } from '@playwright/test';
import { loginOtp } from './helpers';

test('two logged-in users share one period and both see an expense', async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const memberCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  const member = await memberCtx.newPage();

  await loginOtp(owner, '09121111111', 'مالک تست');
  await owner.goto('/');
  await owner.getByRole('button', { name: 'دوره جدید' }).click();
  await owner.locator('#period-title').fill('دوره مشترک');
  await owner.getByRole('button', { name: 'ساخت' }).click();
  await owner.waitForURL(/\/periods\//, { timeout: 15_000 });
  await expect(owner.getByRole('heading', { level: 1, name: 'دوره مشترک' })).toBeVisible();

  await owner.getByRole('tab', { name: 'ابزار' }).click();
  const inviteWait = owner.waitForResponse(
    (res) => res.url().includes('/invites') && res.request().method() === 'POST' && res.ok(),
  );
  await owner.getByRole('button', { name: 'ساخت دعوت' }).click();
  const inviteBody = (await (await inviteWait).json()) as { token: string };
  expect(inviteBody.token).toBeTruthy();

  await loginOtp(member, '09122222222', 'عضو تست');
  await member.goto(`/i/${inviteBody.token}`);
  await member.getByRole('button', { name: 'پیوستن و شروع ثبت هزینه' }).click();
  await member.waitForURL(/\/periods\//, { timeout: 20_000 });

  await owner.getByRole('link', { name: 'هزینه جدید', exact: true }).click();
  await owner.locator('#exp-title').fill('ناهار مالک');
  await owner.locator('#exp-amount').fill('200000');
  await owner.getByRole('button', { name: 'ذخیره' }).click();
  await expect(owner.getByText('ناهار مالک')).toBeVisible({ timeout: 15_000 });

  await member.reload();
  await expect(member.getByText('ناهار مالک')).toBeVisible({ timeout: 20_000 });

  await ownerCtx.close();
  await memberCtx.close();
});
