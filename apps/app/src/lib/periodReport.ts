import type { SplitMode } from '@dongham/ledger';
import { periodAnalytics } from './analytics';
import { currencyLabel } from './currencies';
import type { LocalExpense, LocalMember, LocalPayment, LocalPeriod } from './db';
import { formatCalendarDate, formatMoney, toPersianDigits } from './format';
import { settlementPaySentence } from './share';

export const REPORT_WIDTH_PX = 794;
export const REPORT_BG = '#F4F1EA';

export type ReportVariant = 'full' | 'summary';

export const REPORT_EMPTY = {
  members: 'عضوی نیست',
  settlements: 'همه‌چیز تسویه است',
  expenses: 'هزینه‌ای ثبت نشده',
  payments: 'پرداختی ثبت نشده',
} as const;

const SPLIT_LABELS: Record<SplitMode, string> = {
  equal: 'مساوی',
  weight: 'ضریب',
  exact: 'مبلغ ثابت',
  percent: 'درصد',
};

export type PeriodReportBalanceRow = {
  name: string;
  status: string;
  amount: number;
  amountLabel: string;
};

export type PeriodReportSettlementRow = {
  fromName: string;
  toName: string;
  amount: number;
  amountLabel: string;
  sentence: string;
};

export type PeriodReportExpenseRow = {
  date: string;
  title: string;
  payer: string;
  amount: number;
  amountLabel: string;
  split: string;
  tags: string;
};

export type PeriodReportPaymentRow = {
  date: string;
  fromName: string;
  toName: string;
  amount: number;
  amountLabel: string;
  kind: string;
};

export type PeriodReportModel = {
  title: string;
  exportDate: string;
  memberCount: number;
  currencyFa: string;
  total: number;
  totalLabel: string;
  currency: string;
  balances: PeriodReportBalanceRow[];
  settlements: PeriodReportSettlementRow[];
  expenses: PeriodReportExpenseRow[];
  payments: PeriodReportPaymentRow[];
};

export type PeriodReportSheet = {
  name: string;
  headers: string[];
  rows: (string | number)[][];
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function splitModeLabel(mode: SplitMode): string {
  return SPLIT_LABELS[mode] || mode;
}

export function paymentKindLabel(kind: LocalPayment['kind']): string {
  return kind === 'loan' ? 'قرض' : 'تسویه';
}

export function paymentStatusLabel(status: LocalPayment['status']): string | undefined {
  if (status === 'pending_confirm') return 'در انتظار تأیید';
  if (status === 'sent') return 'ارسال‌شده';
  return undefined;
}

export function paymentKindCell(kind: LocalPayment['kind'], status?: LocalPayment['status']): string {
  const label = paymentKindLabel(kind);
  const st = paymentStatusLabel(status);
  return st ? `${label} · ${st}` : label;
}

export function balanceStatusLabel(balance: number): string {
  if (balance > 0.5) return 'طلبکار';
  if (balance < -0.5) return 'بدهکار';
  return 'تسویه';
}

const TD = 'padding:8px 10px;border-bottom:1px solid rgba(74,107,92,0.12);text-align:right;vertical-align:top';
const TH = `${TD};background:rgba(74,107,92,0.08);font-weight:700;color:#4A6B5C`;
const TABLE = 'width:100%;border-collapse:collapse;font-size:13px';

function money(amount: number, currency: string) {
  return formatMoney(amount, currency, true);
}

function th(label: string) {
  return `<th style="${TH}">${escapeHtml(label)}</th>`;
}

function byNewest(aIso: string, bIso: string) {
  return new Date(bIso).getTime() - new Date(aIso).getTime();
}

function joinTags(tags: string[] | undefined) {
  const live = tags?.filter(Boolean) || [];
  return live.length ? live.join('، ') : '—';
}

export function buildPeriodReportModel(
  period: LocalPeriod,
  expenses: LocalExpense[],
  payments: LocalPayment[],
  members: LocalMember[],
  opts?: { exportedAt?: string; calendarMode?: 'jalali' | 'gregorian' },
): PeriodReportModel {
  const exportedAt = opts?.exportedAt ?? new Date().toISOString();
  const cal = opts?.calendarMode || 'jalali';
  const fmt = (iso: string) => formatCalendarDate(iso, cal);
  const liveExpenses = expenses
    .filter((e) => !e.deletedAt)
    .sort((a, b) => byNewest(a.occurredAt || a.createdAt, b.occurredAt || b.createdAt));
  const livePayments = payments
    .filter((p) => !p.deletedAt)
    .sort((a, b) => byNewest(a.createdAt, b.createdAt));
  const { balances, settlements, total, nameOf } = periodAnalytics(
    liveExpenses,
    livePayments,
    members,
    period.roundTo || 0,
  );

  return {
    title: period.title,
    exportDate: fmt(exportedAt),
    memberCount: members.length,
    currencyFa: currencyLabel(period.currency),
    total,
    totalLabel: money(total, period.currency),
    currency: period.currency,
    balances: members.map((m) => {
      const amount = balances[m.id] ?? 0;
      return {
        name: m.displayName,
        status: balanceStatusLabel(amount),
        amount,
        amountLabel: money(amount, period.currency),
      };
    }),
    settlements: settlements.map((s) => {
      const fromName = nameOf(s.fromMemberId);
      const toName = nameOf(s.toMemberId);
      const amountLabel = money(s.amount, period.currency);
      return {
        fromName,
        toName,
        amount: s.amount,
        amountLabel,
        sentence: settlementPaySentence(fromName, toName, amountLabel),
      };
    }),
    expenses: liveExpenses.map((e) => ({
      date: fmt(e.occurredAt || e.createdAt),
      title: e.title,
      payer: nameOf(e.payerId),
      amount: e.amount,
      amountLabel: money(e.amount, e.currency || period.currency),
      split: splitModeLabel(e.splitMode),
      tags: joinTags(e.tags),
    })),
    payments: livePayments.map((p) => ({
      date: fmt(p.createdAt),
      fromName: nameOf(p.fromMemberId),
      toName: nameOf(p.toMemberId),
      amount: p.amount,
      amountLabel: money(p.amount, p.currency || period.currency),
      kind: paymentKindCell(p.kind, p.status),
    })),
  };
}

export function buildPeriodReportSheets(model: PeriodReportModel): PeriodReportSheet[] {
  return [
    {
      name: 'خلاصه',
      headers: ['عنوان', 'تاریخ خروجی', 'تعداد عضو', 'ارز', 'جمع هزینه‌ها'],
      rows: [[model.title, model.exportDate, model.memberCount, model.currencyFa, model.total]],
    },
    {
      name: 'حساب اعضا',
      headers: ['نام', 'وضعیت', 'مبلغ'],
      rows:
        model.balances.length === 0
          ? [[REPORT_EMPTY.members, '', '']]
          : model.balances.map((row) => [row.name, row.status, row.amount]),
    },
    {
      name: 'تسویه',
      headers: ['از', 'به', 'مبلغ', 'جمله'],
      rows:
        model.settlements.length === 0
          ? [['', '', '', REPORT_EMPTY.settlements]]
          : model.settlements.map((row) => [row.fromName, row.toName, row.amount, row.sentence]),
    },
    {
      name: 'هزینه‌ها',
      headers: ['تاریخ', 'عنوان', 'پرداخت‌کننده', 'مبلغ', 'تقسیم', 'تگ'],
      rows:
        model.expenses.length === 0
          ? [[REPORT_EMPTY.expenses, '', '', '', '', '']]
          : model.expenses.map((row) => [row.date, row.title, row.payer, row.amount, row.split, row.tags]),
    },
    {
      name: 'پرداخت‌ها',
      headers: ['تاریخ', 'از', 'به', 'مبلغ', 'نوع'],
      rows:
        model.payments.length === 0
          ? [[REPORT_EMPTY.payments, '', '', '', '']]
          : model.payments.map((row) => [row.date, row.fromName, row.toName, row.amount, row.kind]),
    },
  ];
}

export function buildPeriodReportHtml(
  period: LocalPeriod,
  expenses: LocalExpense[],
  payments: LocalPayment[],
  members: LocalMember[],
  opts?: { variant?: ReportVariant; exportedAt?: string; calendarMode?: 'jalali' | 'gregorian' },
): string {
  const variant = opts?.variant ?? 'full';
  const model = buildPeriodReportModel(period, expenses, payments, members, {
    exportedAt: opts?.exportedAt,
    calendarMode: opts?.calendarMode,
  });

  const balanceRows =
    model.balances.length === 0
      ? `<tr><td colspan="3" style="${TD};text-align:center;color:#64748b">${escapeHtml(REPORT_EMPTY.members)}</td></tr>`
      : model.balances
          .map((row) => {
            const color = row.amount < -0.5 ? '#BE123C' : row.amount > 0.5 ? '#4A6B5C' : '#2A3E34';
            return `<tr>
        <td style="${TD}">${escapeHtml(row.name)}</td>
        <td style="${TD}">${escapeHtml(row.status)}</td>
        <td style="${TD};color:${color};font-weight:700;white-space:nowrap">${escapeHtml(row.amountLabel)}</td>
      </tr>`;
          })
          .join('');

  const settlementItems =
    model.settlements.length === 0
      ? `<p style="margin:8px 0 0;font-size:14px;color:#2A3E34">${escapeHtml(REPORT_EMPTY.settlements)}</p>`
      : `<ul style="margin:10px 0 0;padding:0;list-style:none">${model.settlements
          .map(
            (s) =>
              `<li style="margin:0 0 8px;padding:10px 12px;border-radius:12px;background:rgba(74,107,92,0.08);font-size:14px;line-height:1.7">${escapeHtml(s.sentence)}</li>`,
          )
          .join('')}</ul>`;

  const expenseRows =
    model.expenses.length === 0
      ? `<tr><td colspan="6" style="${TD};text-align:center;color:#64748b">${escapeHtml(REPORT_EMPTY.expenses)}</td></tr>`
      : model.expenses
          .map(
            (e) => `<tr>
              <td style="${TD};white-space:nowrap">${escapeHtml(e.date)}</td>
              <td style="${TD}">${escapeHtml(e.title)}</td>
              <td style="${TD}">${escapeHtml(e.payer)}</td>
              <td style="${TD};white-space:nowrap">${escapeHtml(e.amountLabel)}</td>
              <td style="${TD}">${escapeHtml(e.split)}</td>
              <td style="${TD}">${escapeHtml(e.tags)}</td>
            </tr>`,
          )
          .join('');

  const paymentRows =
    model.payments.length === 0
      ? `<tr><td colspan="5" style="${TD};text-align:center;color:#64748b">${escapeHtml(REPORT_EMPTY.payments)}</td></tr>`
      : model.payments
          .map(
            (p) => `<tr>
              <td style="${TD};white-space:nowrap">${escapeHtml(p.date)}</td>
              <td style="${TD}">${escapeHtml(p.fromName)}</td>
              <td style="${TD}">${escapeHtml(p.toName)}</td>
              <td style="${TD};white-space:nowrap">${escapeHtml(p.amountLabel)}</td>
              <td style="${TD}">${escapeHtml(p.kind)}</td>
            </tr>`,
          )
          .join('');

  const tables =
    variant === 'full'
      ? `
    <section style="margin-top:22px">
      <h2 style="margin:0 0 8px;font-size:16px;color:#4A6B5C">هزینه‌ها</h2>
      <table style="${TABLE}">
        <thead>
          <tr>
            ${th('تاریخ')}
            ${th('عنوان')}
            ${th('پرداخت‌کننده')}
            ${th('مبلغ')}
            ${th('تقسیم')}
            ${th('تگ')}
          </tr>
        </thead>
        <tbody>${expenseRows}</tbody>
      </table>
    </section>
    <section style="margin-top:22px">
      <h2 style="margin:0 0 8px;font-size:16px;color:#4A6B5C">پرداخت‌ها</h2>
      <table style="${TABLE}">
        <thead>
          <tr>
            ${th('تاریخ')}
            ${th('از')}
            ${th('به')}
            ${th('مبلغ')}
            ${th('نوع')}
          </tr>
        </thead>
        <tbody>${paymentRows}</tbody>
      </table>
    </section>`
      : '';

  return `<article dir="rtl" lang="fa" data-period-report="${variant}" style="width:${REPORT_WIDTH_PX}px;box-sizing:border-box;padding:28px 32px 36px;background:${REPORT_BG};color:#2A3E34;font-family:Vazirmatn,Tahoma,sans-serif;line-height:1.6">
    <header>
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:13px;color:#4A6B5C">
        <span style="font-weight:800">دونگ‌هام</span>
        <span>${escapeHtml(model.exportDate)}</span>
      </div>
      <h1 style="margin:10px 0 6px;font-size:28px;line-height:1.3;color:#4A6B5C">${escapeHtml(model.title)}</h1>
      <p style="margin:0;font-size:14px">${toPersianDigits(model.memberCount)} عضو · ${escapeHtml(model.currencyFa)}</p>
    </header>
    <section style="margin-top:20px;padding:14px 16px;border-radius:16px;background:#FFFAF5;border:1px solid rgba(74,107,92,0.12)">
      <p style="margin:0;font-size:13px;color:#64748b">جمع هزینه‌ها</p>
      <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:#4A6B5C">${escapeHtml(model.totalLabel)}</p>
    </section>
    <section style="margin-top:22px">
      <h2 style="margin:0 0 8px;font-size:16px;color:#4A6B5C">حساب اعضا</h2>
      <table style="${TABLE}">
        <thead>
          <tr>
            ${th('نام')}
            ${th('وضعیت')}
            ${th('مبلغ')}
          </tr>
        </thead>
        <tbody>${balanceRows}</tbody>
      </table>
    </section>
    <section style="margin-top:22px">
      <h2 style="margin:0 0 4px;font-size:16px;color:#4A6B5C">تسویه حساب</h2>
      ${settlementItems}
    </section>
    ${tables}
  </article>`;
}
