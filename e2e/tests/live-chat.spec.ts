import { test, expect } from '@playwright/test';
import { createPeriodSubmit, loginOtp, newPeriodButton } from './helpers';

test('live chat and expense appear without reload', async ({ browser }) => {
  test.setTimeout(120_000);
  const ownerCtx = await browser.newContext();
  const memberCtx = await browser.newContext({ permissions: ['notifications'] });
  const owner = await ownerCtx.newPage();
  const member = await memberCtx.newPage();

  await loginOtp(owner, '09121110031');
  await owner.goto('/app');
  const periodTitle = `آنی ${Date.now()}`;
  await newPeriodButton(owner).click();
  await owner.locator('#period-title').fill(periodTitle);
  await createPeriodSubmit(owner).click();
  await owner.waitForURL(/\/periods\//, { timeout: 15_000 });

  await owner.getByRole('tab', { name: 'تنظیمات' }).click();
  const inviteWait = owner.waitForResponse(
    (res) => res.url().includes('/invites') && res.request().method() === 'POST' && res.ok(),
  );
  await owner.getByRole('button', { name: 'ساخت دعوت' }).click();
  const inviteBody = (await (await inviteWait).json()) as { token: string };

  await loginOtp(member, '09121110032');
  await member.goto(`/i/${inviteBody.token}`);
  await member.getByRole('button', { name: 'پیوستن و شروع ثبت هزینه' }).click();
  await member.waitForURL(/\/periods\//, { timeout: 20_000 });
  await expect(member.getByRole('heading', { level: 1, name: periodTitle })).toBeVisible();

  await owner.getByRole('tab', { name: 'چت' }).click();
  await owner.getByPlaceholder('پیام درباره هزینه...').fill('سلام آنی');
  await owner.getByRole('button', { name: 'ارسال' }).click();
  await expect(owner.getByText('سلام آنی')).toBeVisible();

  await expect(member.getByRole('tab', { name: 'چت، خوانده‌نشده' })).toBeVisible({ timeout: 15_000 });
  await member.getByRole('tab', { name: 'چت، خوانده‌نشده' }).click();
  await expect(member.getByText('سلام آنی')).toBeVisible({ timeout: 10_000 });

  await owner.getByRole('tab', { name: 'هزینه‌ها' }).click();
  await owner.getByRole('link', { name: 'هزینه جدید', exact: true }).click();
  await owner.locator('#exp-title').fill('ناهار آنی');
  await owner.locator('#exp-amount').fill('150000');
  await owner.getByRole('button', { name: 'ذخیره' }).click();
  await expect(owner.getByText('ناهار آنی')).toBeVisible({ timeout: 15_000 });

  await member.getByRole('tab', { name: 'هزینه‌ها' }).click();
  await expect(member.getByText('ناهار آنی')).toBeVisible({ timeout: 15_000 });

  await member.goto('/more');
  await member.getByRole('button', { name: 'تست نوتیفیکیشن' }).click();
  await expect(member.getByText('نوتیفیکیشن آزمایشی')).toBeVisible({ timeout: 15_000 });

  await ownerCtx.close();
  await memberCtx.close();
});
