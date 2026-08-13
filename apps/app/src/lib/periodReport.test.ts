import { describe, expect, it } from 'vitest';
import { noneCharge, type LocalExpense, type LocalMember, type LocalPayment, type LocalPeriod } from './db';
import { formatMoney } from './format';
import { currencyLabel } from './currencies';
import {
  REPORT_EMPTY,
  buildPeriodReportHtml,
  buildPeriodReportModel,
  buildPeriodReportSheets,
  escapeHtml,
  splitModeLabel,
} from './periodReport';
import { buildPeriodReportWorkbook } from './export';

const exportedAt = '2026-08-13T12:00:00.000Z';

function period(overrides: Partial<LocalPeriod> = {}): LocalPeriod {
  return {
    id: 'p1',
    title: 'سفر شمال',
    currency: 'IRT',
    baseCurrency: 'IRT',
    createdAt: exportedAt,
    updatedAt: exportedAt,
    version: 1,
    synced: false,
    kind: 'split',
    template: 'travel',
    roundTo: 1000,
    ...overrides,
  };
}

function member(id: string, displayName: string): LocalMember {
  return {
    id,
    periodId: 'p1',
    displayName,
    weightDefault: 1,
    role: 'member',
  };
}

function expense(overrides: Partial<LocalExpense> & Pick<LocalExpense, 'id' | 'title' | 'amount' | 'payerId' | 'shares'>): LocalExpense {
  return {
    periodId: 'p1',
    currency: 'IRT',
    payers: [],
    splitMode: 'equal',
    tax: noneCharge(),
    service: noneCharge(),
    tip: noneCharge(),
    tags: [],
    fxRate: 1,
    createdAt: exportedAt,
    occurredAt: exportedAt,
    updatedAt: exportedAt,
    version: 1,
    ...overrides,
  };
}

function payment(overrides: Partial<LocalPayment> & Pick<LocalPayment, 'id' | 'fromMemberId' | 'toMemberId' | 'amount'>): LocalPayment {
  return {
    periodId: 'p1',
    currency: 'IRT',
    kind: 'settlement',
    fxRate: 1,
    createdAt: exportedAt,
    updatedAt: exportedAt,
    version: 1,
    ...overrides,
  };
}

describe('period report html', () => {
  const members = [
    member('m1', 'وجید'),
    member('m2', 'سارا'),
    member('m3', 'من'),
    member('m4', 'هادی'),
  ];
  const shares = members.map((m) => ({ memberId: m.id, value: 1 }));
  const expenses = [
    expense({
      id: 'e1',
      title: 'اقامت ویلا',
      amount: 8_000_000,
      payerId: 'm3',
      shares,
      tags: ['اقامت'],
      splitMode: 'equal',
    }),
  ];
  const payments = [
    payment({
      id: 'pay1',
      fromMemberId: 'm4',
      toMemberId: 'm3',
      amount: 500_000,
      kind: 'loan',
      status: 'pending_confirm',
    }),
  ];

  it('renders title, members, settlement, expense and persian currency', () => {
    const html = buildPeriodReportHtml(period(), expenses, payments, members, { exportedAt });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('سفر شمال');
    expect(html).toContain('وجید');
    expect(html).toContain('سارا');
    expect(html).toContain('هادی');
    expect(html).toContain('اقامت ویلا');
    expect(html).toContain('مساوی');
    expect(html).toContain('باید به');
    expect(html).toContain('بپردازد');
    expect(html).toContain('تومان');
    expect(html).not.toContain('Toman');
    expect(html).toContain('قرض · در انتظار تأیید');
    expect(html).toContain('دونگ‌هام');
    expect(html).toContain('جمع هزینه‌ها');
    expect(html).toContain('۴ عضو');
  });

  it('omits expense and payment tables in summary variant', () => {
    const html = buildPeriodReportHtml(period(), expenses, payments, members, {
      variant: 'summary',
      exportedAt,
    });
    expect(html).toContain('سفر شمال');
    expect(html).toContain('حساب اعضا');
    expect(html).not.toContain('اقامت ویلا');
    expect(html).not.toContain('قرض · در انتظار تأیید');
  });

  it('escapes user text', () => {
    const html = buildPeriodReportHtml(
      period({ title: 'سفر <script>alert(1)</script>' }),
      [],
      [],
      [member('m1', 'علی & co')],
      { exportedAt },
    );
    expect(html).toContain('سفر &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('علی &amp; co');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('skips deleted expenses and payments', () => {
    const html = buildPeriodReportHtml(
      period(),
      [expense({ id: 'e-del', title: 'حذف‌شده', amount: 1, payerId: 'm1', shares, deletedAt: exportedAt })],
      [payment({ id: 'p-del', fromMemberId: 'm1', toMemberId: 'm2', amount: 1, deletedAt: exportedAt })],
      members,
      { exportedAt },
    );
    expect(html).not.toContain('حذف‌شده');
    expect(html).toContain('هزینه‌ای ثبت نشده');
    expect(html).toContain('پرداختی ثبت نشده');
  });
});

describe('period report model and excel sheets', () => {
  const members = [
    member('m1', 'وجید'),
    member('m2', 'سارا'),
    member('m3', 'من'),
    member('m4', 'هادی'),
  ];
  const shares = members.map((m) => ({ memberId: m.id, value: 1 }));
  const expenses = [
    expense({
      id: 'e1',
      title: 'اقامت ویلا',
      amount: 8_000_000,
      payerId: 'm3',
      shares,
      tags: ['اقامت'],
      splitMode: 'equal',
    }),
  ];
  const payments = [
    payment({
      id: 'pay1',
      fromMemberId: 'm4',
      toMemberId: 'm3',
      amount: 500_000,
      kind: 'loan',
      status: 'pending_confirm',
    }),
  ];

  it('matches pdf html details in the shared model and excel rows', () => {
    const input = period();
    const model = buildPeriodReportModel(input, expenses, payments, members, { exportedAt });
    const html = buildPeriodReportHtml(input, expenses, payments, members, { exportedAt });
    const sheets = buildPeriodReportSheets(model);
    const byName = Object.fromEntries(sheets.map((s) => [s.name, s]));

    expect(model.title).toBe('سفر شمال');
    expect(model.currencyFa).toBe('تومان');
    expect(model.expenses[0]?.title).toBe('اقامت ویلا');
    expect(model.expenses[0]?.split).toBe('مساوی');
    expect(model.expenses[0]?.tags).toBe('اقامت');
    expect(model.payments[0]?.kind).toBe('قرض · در انتظار تأیید');
    expect(model.settlements[0]?.sentence).toContain('باید به');
    expect(model.settlements[0]?.sentence).toContain('بپردازد');

    expect(html).toContain(model.title);
    expect(html).toContain(model.currencyFa);
    expect(html).not.toContain('Toman');
    expect(html).toContain(model.expenses[0].title);
    expect(html).toContain(model.expenses[0].tags);
    expect(html).toContain(model.payments[0].kind);
    expect(html).toContain(model.settlements[0].sentence);

    expect(sheets.map((s) => s.name)).toEqual(['خلاصه', 'حساب اعضا', 'تسویه', 'هزینه‌ها', 'پرداخت‌ها']);
    expect(byName['خلاصه'].rows[0]).toEqual([
      model.title,
      model.exportDate,
      model.memberCount,
      model.currencyFa,
      model.total,
    ]);
    expect(byName['هزینه‌ها'].headers).toEqual(['تاریخ', 'عنوان', 'پرداخت‌کننده', 'مبلغ', 'تقسیم', 'تگ']);
    expect(byName['هزینه‌ها'].rows[0]).toEqual([
      model.expenses[0].date,
      'اقامت ویلا',
      'من',
      8_000_000,
      'مساوی',
      'اقامت',
    ]);
    expect(byName['پرداخت‌ها'].rows[0]).toEqual([
      model.payments[0].date,
      'هادی',
      'من',
      500_000,
      'قرض · در انتظار تأیید',
    ]);
    expect(byName['تسویه'].rows[0]?.[3]).toBe(model.settlements[0].sentence);
    expect(typeof byName['حساب اعضا'].rows[0]?.[2]).toBe('number');
  });

  it('keeps empty-section messages in excel like the pdf', () => {
    const model = buildPeriodReportModel(period(), [], [], [], { exportedAt });
    const html = buildPeriodReportHtml(period(), [], [], [], { exportedAt });
    const sheets = buildPeriodReportSheets(model);
    const byName = Object.fromEntries(sheets.map((s) => [s.name, s]));

    expect(html).toContain(REPORT_EMPTY.members);
    expect(html).toContain(REPORT_EMPTY.settlements);
    expect(html).toContain(REPORT_EMPTY.expenses);
    expect(html).toContain(REPORT_EMPTY.payments);
    expect(byName['حساب اعضا'].rows[0]?.[0]).toBe(REPORT_EMPTY.members);
    expect(byName['تسویه'].rows[0]?.[3]).toBe(REPORT_EMPTY.settlements);
    expect(byName['هزینه‌ها'].rows[0]?.[0]).toBe(REPORT_EMPTY.expenses);
    expect(byName['پرداخت‌ها'].rows[0]?.[0]).toBe(REPORT_EMPTY.payments);
  });

  it('writes an rtl workbook with the same five sheets', () => {
    const wb = buildPeriodReportWorkbook(period(), expenses, payments, members, { exportedAt });
    expect(wb.SheetNames).toEqual(['خلاصه', 'حساب اعضا', 'تسویه', 'هزینه‌ها', 'پرداخت‌ها']);
    expect(wb.Workbook?.Views?.[0]?.RTL).toBe(true);
  });
});

describe('report money labels', () => {
  it('formats money with persian-only currency labels', () => {
    const text = formatMoney(250000, 'IRT', true);
    expect(text).toContain('تومان');
    expect(text).not.toContain('Toman');
    expect(currencyLabel('USD')).toBe('دلار آمریکا');
    expect(currencyLabel('IRT')).toBe('تومان');
  });

  it('maps split modes to persian labels', () => {
    expect(splitModeLabel('equal')).toBe('مساوی');
    expect(splitModeLabel('weight')).toBe('ضریب');
    expect(splitModeLabel('exact')).toBe('مبلغ ثابت');
    expect(splitModeLabel('percent')).toBe('درصد');
  });

  it('escapes html', () => {
    expect(escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });
});
