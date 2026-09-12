/**
 * Shared pieces of every PDF report: the palette, the cover page, the
 * section title bar and the page footer. Report text is English because the
 * bundled jsPDF fonts do not carry Arabic.
 */
import type jsPDF from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';

// What jspdf-autotable adds to a document: the table call, and where the last table ended.
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: UserOptions) => jsPDF;
    lastAutoTable?: { finalY: number };
  }
}

export const PDF_COLORS = {
  primary: [45, 80, 120] as [number, number, number],
  accent: [180, 150, 80] as [number, number, number],
  light: [245, 245, 245] as [number, number, number],
  dark: [40, 40, 40] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  success: [46, 125, 50] as [number, number, number],
  danger: [198, 40, 40] as [number, number, number],
};

export function addPdfFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(...PDF_COLORS.dark);
    doc.text(`${i} / ${pageCount}`, pageW / 2, pageH - 6, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 14, pageH - 6);
    doc.text('Powered by BASSERH', pageW - 14, pageH - 6, { align: 'right' });
  }
}

export function addCoverPage(doc: jsPDF, title: string, subtitle?: string) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  // Background accent bar
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(0, 0, pageW, 80, 'F');

  // Title
  doc.setTextColor(...PDF_COLORS.white);
  doc.setFontSize(28);
  doc.text(title, pageW / 2, 40, { align: 'center' });

  if (subtitle) {
    doc.setFontSize(14);
    doc.text(subtitle, pageW / 2, 55, { align: 'center' });
  }

  // Date
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.dark);
  doc.text(`Report Date: ${new Date().toLocaleDateString('en-GB')}`, pageW / 2, 100, { align: 'center' });

  // Decorative line
  doc.setDrawColor(...PDF_COLORS.accent);
  doc.setLineWidth(1.5);
  doc.line(pageW * 0.3, 110, pageW * 0.7, 110);
}

export function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(14, y - 5, pageW - 28, 9, 'F');
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.white);
  doc.text(title, pageW / 2, y + 1, { align: 'center' });
  return y + 12;
}
