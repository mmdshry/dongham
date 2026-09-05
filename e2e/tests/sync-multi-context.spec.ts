import { test, expect } from '@playwright/test';
import { loginAdmin, loginOtp } from './helpers';

test('four browsers plus admin converge on one period', async ({ browser }) => {
  test.setTimeout(180_000);
  const ownerCtx = await browser.newContext();
  const aCtx = await browser.newContext();
  const bCtx = await browser.newContext();
  const offCtx = await browser.newContext();
  const adminCtx = await browser.newContext();

  const owner = await ownerCtx.newPage();
  const memberA = await aCtx.newPage();
  const memberB = await bCtx.newPage();
  const offline = await offCtx.newPage();
  const admin = await adminCtx.newPage();

  await loginOtp(owner, '09121110001', 'مالک همگام');
  await owner.goto('/');
  const periodTitle = `همگام ${Date.now()}`;
  await owner.getByRole('button', { name: 'دوره جدید' }).click();
  await owner.locator('#period-title').fill(periodTitle);
  await owner.getByRole('button', { name: 'ساخت' }).click();
  await owner.waitForURL(/\/periods\//, { timeout: 15_000 });
  await expect(owner.getByRole('heading', { level: 1, name: periodTitle })).toBeVisible();

  await owner.getByRole('tab', { name: 'ابزار' }).click();
  const inviteWait = owner.waitForResponse(
    (res) => res.url().includes('/invites') && res.request().method() === 'POST' && res.ok(),
  );
  await owner.getByRole('button', { name: 'ساخت دعوت' }).click();
  const inviteBody = (await (await inviteWait).json()) as { token: string };

  await loginOtp(memberA, '09121110002', 'عضو الف');
  await memberA.goto(`/i/${inviteBody.token}`);
  await memberA.getByRole('button', { name: 'پیوستن و شروع ثبت هزینه' }).click();
  await memberA.waitForURL(/\/periods\//, { timeout: 20_000 });

  await loginOtp(memberB, '09121110003', 'عضو ب');
  await memberB.goto(`/i/${inviteBody.token}`);
  await memberB.getByRole('button', { name: 'پیوستن و شروع ثبت هزینه' }).click();
  await memberB.waitForURL(/\/periods\//, { timeout: 20_000 });

  await loginOtp(offline, '09121110004', 'آفلاین');
  await offline.goto(`/i/${inviteBody.token}`);
  await offline.getByRole('button', { name: 'پیوستن و شروع ثبت هزینه' }).click();
  await offline.waitForURL(/\/periods\//, { timeout: 20_000 });

  await owner.getByRole('link', { name: 'هزینه جدید', exact: true }).click();
  await owner.locator('#exp-title').fill('هزینه مالک');
  await owner.locator('#exp-amount').fill('110000');
  await owner.getByRole('button', { name: 'ذخیره' }).click();
  await expect(owner.getByText('هزینه مالک')).toBeVisible({ timeout: 15_000 });

  await memberA.reload();
  await expect(memberA.getByText('هزینه مالک')).toBeVisible({ timeout: 20_000 });
  await memberA.getByRole('link', { name: 'هزینه جدید', exact: true }).click();
  await memberA.locator('#exp-title').fill('هزینه الف');
  await memberA.locator('#exp-amount').fill('220000');
  await memberA.getByRole('button', { name: 'ذخیره' }).click();
  await expect(memberA.getByText('هزینه الف')).toBeVisible({ timeout: 15_000 });

  await offline.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  await offline.getByRole('link', { name: 'هزینه جدید', exact: true }).click();
  await offline.locator('#exp-title').fill('هزینه آفلاین');
  await offline.locator('#exp-amount').fill('330000');
  await offline.getByRole('button', { name: 'ذخیره' }).click();
  await expect(offline).toHaveURL(/\/periods\/[^/]+$/, { timeout: 15_000 });
  await expect(offline.getByRole('link', { name: /هزینه آفلاین/ })).toBeVisible();

  await offline.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('online'));
  });
  await offline.reload();
  const syncBtn = offline.getByRole('button', { name: 'همگام‌سازی' });
  if (await syncBtn.isVisible().catch(() => false)) await syncBtn.click();
  await expect(offline.getByText('هزینه آفلاین')).toBeVisible({ timeout: 15_000 });
  await expect(offline.getByText('هزینه مالک')).toBeVisible({ timeout: 20_000 });

  await memberB.reload();
  await expect(memberB.getByText('هزینه مالک')).toBeVisible({ timeout: 20_000 });
  await expect(memberB.getByText('هزینه الف')).toBeVisible({ timeout: 20_000 });
  await expect(memberB.getByText('هزینه آفلاین')).toBeVisible({ timeout: 20_000 });

  await loginAdmin(admin);
  await admin.goto('http://127.0.0.1:5174/periods');
  await expect(admin.getByText(periodTitle)).toBeVisible({ timeout: 20_000 });
  await admin.getByText(periodTitle).first().click();
  await expect(admin.getByRole('cell', { name: 'هزینه مالک' })).toBeVisible({ timeout: 20_000 });
  await expect(admin.getByRole('cell', { name: 'هزینه الف' })).toBeVisible();
  await expect(admin.getByRole('cell', { name: 'هزینه آفلاین' })).toBeVisible();

  await ownerCtx.close();
  await aCtx.close();
  await bCtx.close();
  await offCtx.close();
  await adminCtx.close();
});
