import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import type { LocalExpense, LocalMember, LocalPayment, LocalPeriod } from './db';
import {
  REPORT_BG,
  REPORT_WIDTH_PX,
  buildPeriodReportHtml,
  buildPeriodReportModel,
  buildPeriodReportSheets,
  type PeriodReportSheet,
  type ReportVariant,
} from './periodReport';

export function buildPeriodReportWorkbook(
  period: LocalPeriod,
  expenses: LocalExpense[],
  payments: LocalPayment[],
  members: LocalMember[],
  opts?: { exportedAt?: string; calendarMode?: 'jalali' | 'gregorian' },
) {
  const model = buildPeriodReportModel(period, expenses, payments, members, opts);
  return sheetsToWorkbook(buildPeriodReportSheets(model));
}

function sheetsToWorkbook(sheets: PeriodReportSheet[]) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  for (const sheet of sheets) {
    const aoa = [sheet.headers, ...sheet.rows];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet.name);
  }
  return wb;
}

export function exportExcel(
  period: LocalPeriod,
  expenses: LocalExpense[],
  payments: LocalPayment[],
  members: LocalMember[],
  opts?: { calendarMode?: 'jalali' | 'gregorian' },
) {
  const wb = buildPeriodReportWorkbook(period, expenses, payments, members, opts);
  XLSX.writeFile(wb, `${period.title}.xlsx`);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = hex.replace('#', '');
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function mountPeriodReport(html: string): { root: HTMLElement; cleanup: () => void } {
  const host = document.createElement('div');
  host.setAttribute('data-period-report-host', '');
  host.style.cssText = [
    'position:fixed',
    'top:0',
    'right:0',
    `width:${REPORT_WIDTH_PX}px`,
    'z-index:0',
    'opacity:0.01',
    'pointer-events:none',
  ].join(';');
  host.innerHTML = html;
  const root = host.firstElementChild as HTMLElement;
  document.body.appendChild(host);
  return {
    root,
    cleanup: () => host.remove(),
  };
}

async function renderReportCanvas(root: HTMLElement): Promise<HTMLCanvasElement> {
  if (document.fonts?.ready) await document.fonts.ready;
  const html2canvas = (await import('html2canvas')).default;
  return html2canvas(root, {
    scale: 2,
    useCORS: true,
    backgroundColor: REPORT_BG,
    width: REPORT_WIDTH_PX,
    windowWidth: REPORT_WIDTH_PX,
    logging: false,
  });
}

function saveCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

function canvasToA4Pdf(canvas: HTMLCanvasElement, filename: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210;
  const pageH = 297;
  const margin = 12;
  const footer = 10;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin - footer;
  const imgW = usableW;
  const imgH = (canvas.height * imgW) / canvas.width;
  const img = canvas.toDataURL('image/png');
  const totalPages = Math.max(1, Math.ceil(imgH / usableH));
  const bg = hexToRgb(REPORT_BG);

  for (let i = 0; i < totalPages; i++) {
    if (i > 0) doc.addPage();
    doc.setFillColor(bg.r, bg.g, bg.b);
    doc.rect(0, 0, pageW, pageH, 'F');
    const y = margin - i * usableH;
    doc.addImage(img, 'PNG', margin, y, imgW, imgH, undefined, 'FAST');
    doc.setFillColor(bg.r, bg.g, bg.b);
    doc.rect(0, 0, pageW, margin, 'F');
    doc.rect(0, pageH - footer, pageW, footer, 'F');
    doc.setFontSize(9);
    doc.setTextColor(15, 118, 110);
    doc.text(`${i + 1} / ${totalPages}`, pageW / 2, pageH - 4, { align: 'center' });
  }
  doc.save(filename);
}

async function captureReport(
  period: LocalPeriod,
  expenses: LocalExpense[],
  payments: LocalPayment[],
  members: LocalMember[],
  variant: ReportVariant,
  calendarMode?: 'jalali' | 'gregorian',
): Promise<HTMLCanvasElement> {
  const html = buildPeriodReportHtml(period, expenses, payments, members, { variant, calendarMode });
  const { root, cleanup } = mountPeriodReport(html);
  try {
    return await renderReportCanvas(root);
  } finally {
    cleanup();
  }
}

export async function exportPdf(
  period: LocalPeriod,
  expenses: LocalExpense[],
  payments: LocalPayment[],
  members: LocalMember[],
  opts?: { calendarMode?: 'jalali' | 'gregorian' },
) {
  const canvas = await captureReport(period, expenses, payments, members, 'full', opts?.calendarMode);
  canvasToA4Pdf(canvas, `${period.title}.pdf`);
}

export async function exportBalanceImage(
  period: LocalPeriod,
  expenses: LocalExpense[],
  payments: LocalPayment[],
  members: LocalMember[],
  opts?: { calendarMode?: 'jalali' | 'gregorian' },
) {
  const canvas = await captureReport(period, expenses, payments, members, 'full', opts?.calendarMode);
  saveCanvasPng(canvas, `${period.title}-balance.png`);
}
