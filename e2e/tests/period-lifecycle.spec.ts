import { expect, test, type Page } from '@playwright/test';
import { createPeriodSubmit, loginOtp, newPeriodButton } from './helpers';

function periodCard(page: Page, title: string) {
  return page.locator('article').filter({ hasText: title });
}

function homeSection(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) });
}

async function openPeriodMenu(page: Page, title: string) {
  await periodCard(page, title).getByRole('button', { name: 'گزینه‌های دوره' }).click();
}

test('home sections and period locks follow archive, complete, delete, and restore', async ({ page }) => {
  test.setTimeout(120_000);
  const title = `چرخه عمر ${Date.now()}`;

  await loginOtp(page, '09127772011');
  await page.goto('/app');
  await newPeriodButton(page).click();
  await page.locator('#period-title').fill(title);
  await createPeriodSubmit(page).click();
  await page.waitForURL(/\/periods\//, { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('فعال', { exact: true })).toBeVisible();

  await page.goto('/app');
  await expect(homeSection(page, 'دوره‌های فعال').getByText(title)).toBeVisible();
  await expect(periodCard(page, title).getByText('فعال', { exact: true })).toBeVisible();

  await openPeriodMenu(page, title);
  await page.getByRole('menuitem', { name: 'آرشیو' }).click();
  await expect(homeSection(page, 'آرشیو').getByText(title)).toBeVisible();
  await expect(homeSection(page, 'دوره‌های فعال').getByText(title)).toHaveCount(0);

  await openPeriodMenu(page, title);
  await page.getByRole('menuitem', { name: 'خروج از آرشیو' }).click();
  await expect(homeSection(page, 'دوره‌های فعال').getByText(title)).toBeVisible();

  await openPeriodMenu(page, title);
  await page.getByRole('menuitem', { name: 'اتمام دوره' }).click();
  await page.getByRole('dialog', { name: 'اتمام دوره' }).getByRole('button', { name: 'اتمام' }).click();
  await expect(periodCard(page, title).getByText('اتمام', { exact: true })).toBeVisible();

  await periodCard(page, title).getByRole('link').filter({ hasText: title }).click();
  await expect(page.getByText('این دوره به اتمام رسیده است')).toBeVisible();
  await expect(page.getByText('با ثبت هزینه جدید دوره دوباره فعال می‌شود')).toBeVisible();
  await page.getByRole('link', { name: 'هزینه جدید', exact: true }).click();
  await expect(page.getByText('با ثبت هزینه جدید دوره دوباره فعال می‌شود')).toBeVisible();
  await page.locator('#exp-title').fill('هزینه بازگشایی');
  await page.locator('#exp-amount').fill('15000');
  await page.getByRole('button', { name: 'ذخیره' }).click();
  await expect(page.getByText('هزینه بازگشایی')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('اتمام', { exact: true })).toHaveCount(0);
  await expect(page.getByText('فعال', { exact: true })).toBeVisible();

  await page.goto('/app');
  await openPeriodMenu(page, title);
  await page.getByRole('menuitem', { name: 'حذف دوره' }).click();
  await page.getByRole('dialog', { name: 'حذف دوره' }).getByRole('button', { name: 'حذف' }).click();
  await expect(homeSection(page, 'حذف‌شده').getByText(title)).toBeVisible();
  await expect(homeSection(page, 'دوره‌های فعال').getByText(title)).toHaveCount(0);

  await openPeriodMenu(page, title);
  await page.getByRole('menuitem', { name: 'بازیابی دوره' }).click();
  await expect(homeSection(page, 'دوره‌های فعال').getByText(title)).toBeVisible();
  await expect(homeSection(page, 'حذف‌شده')).toHaveCount(0);
});
