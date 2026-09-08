import { test, expect } from '@playwright/test';
import { createPeriodSubmit, newPeriodButton, setGuestDisplayName } from './helpers';

async function addMemberByName(page: import('@playwright/test').Page, name: string) {
  await page.locator('#period-member-new').fill(name);
  await page.getByRole('button', { name: 'افزودن به لیست' }).click();
}

test('offline user can create period and expense', async ({ page, context }) => {
  await context.setOffline(false);
  await page.goto('/app');
  await setGuestDisplayName(page);
  await expect(page.getByRole('heading', { name: 'دوره‌های فعال' })).toBeVisible();

  await newPeriodButton(page).click();
  await page.locator('#period-title').fill('سفر تست');
  await addMemberByName(page, 'سارا');
  await addMemberByName(page, 'رضا');
  await createPeriodSubmit(page).click();

  await page.waitForURL(/\/periods\//, { timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'سفر تست' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('حالت آفلاین').first()).toBeVisible();
  await page.getByRole('tab', { name: 'چت' }).click();
  await expect(page.getByText('چت فقط در حالت ابری فعال است')).toBeVisible();
  await expect(page.getByRole('button', { name: 'ارسال' })).toBeDisabled();
  await page.getByRole('tab', { name: 'هزینه‌ها' }).click();

  await context.setOffline(true);
  await page.getByRole('link', { name: 'هزینه جدید', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'هزینه جدید' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'تاریخ هزینه' })).toBeVisible();
  await page.locator('#exp-title').fill('ناهار');
  await page.locator('#exp-amount').fill('300000');
  await page.getByRole('button', { name: 'ضریب' }).click();
  await page.getByRole('button', { name: 'ذخیره' }).click();

  await expect(page.getByText('ناهار')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'حساب' }).click();
  await expect(page.getByText('محمد (من)').first()).toBeVisible();
  await expect(page.getByText('تسویه حساب')).toBeVisible();
  await expect(page.getByText('باید به').first()).toBeVisible();
  await page.getByText('اشتراک‌گذاری').first().click();
  await expect(page.getByText('شماره موبایل این عضو ثبت نشده').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'واتساپ' }).first()).toBeDisabled();
});

test('whatsapp share enables after member phone is saved', async ({ page }) => {
  await page.goto('/app');
  await setGuestDisplayName(page);
  await newPeriodButton(page).click();
  await page.locator('#period-title').fill('گروه موبایل');
  await addMemberByName(page, 'سارا');
  await createPeriodSubmit(page).click();
  await page.waitForURL(/\/periods\//, { timeout: 15_000 });

  await page.getByRole('link', { name: 'هزینه جدید', exact: true }).click();
  await page.locator('#exp-title').fill('تاکسی');
  await page.locator('#exp-amount').fill('100000');
  await page.getByRole('button', { name: 'ذخیره' }).click();
  await expect(page.getByText('تاکسی')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('tab', { name: 'تنظیمات' }).click();
  await page.getByPlaceholder('موبایل ۰۹۱۲…').nth(1).fill('09121234567');
  await page.getByPlaceholder('موبایل ۰۹۱۲…').nth(1).blur();

  await page.getByRole('tab', { name: 'حساب' }).click();
  await page.getByText('اشتراک‌گذاری').first().click();
  const wa = page.getByRole('button', { name: 'واتساپ' }).first();
  await expect(wa).toBeEnabled();
  await expect(wa).toHaveAttribute('data-wa', /wa\.me\/989121234567/);
});
