/**
 * SsotReportExportButton — تصدير ملخص الربحية + التسويات + مطابقة الخادم
 * كـ CSV أو PDF لمشروع واحد.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildSsotReportCSV, downloadTextFile, safeFileName,
  type SsotFigure, type SsotKey, type SsotReportInput,
} from '@/lib/ssot-report';
import { useSsotHealth } from '@/hooks/useSsotHealth';
import { exportSsotReportPDF } from '@/lib/export-lazy';
import { logger } from '@/lib/logger';
import type { Project, Revenue, ProjectFund, FundSettlement } from '@/types/project';

interface Props {
  project: Project;
  audit: Record<SsotKey, SsotFigure>;
  revenues: Revenue[];
  funds: ProjectFund[];
  settlements: FundSettlement[];
}

export function SsotReportExportButton({ project, audit, revenues, funds, settlements }: Props) {
  const { rows, computedAt } = useSsotHealth(project.id, audit);
  const [busy, setBusy] = useState(false);

  const buildInput = (): SsotReportInput => ({
    profitability: {
      projectName: project.name,
      currency: project.currency,
      contractValue: project.contractValue,
      approvedChangeOrders:
        audit.profit.components.find((c) => c.source === 'change_orders')?.value ?? 0,
      revenues: revenues.filter((r) => r.projectId === project.id),
      totalActualExpenses: audit.totalActualExpenses.value,
    },
    reconciliation: rows,
    settlements: settlements
      .filter((s) => s.projectId === project.id)
      .map((s) => ({
        label: `دفعة #${funds.find((f) => f.id === s.fundId)?.fundNumber ?? '—'}`,
        status: s.status,
        totalReceived: s.totalReceived,
        totalSpent: s.totalSpent,
        remaining: s.remainingCash,
      })),
    computedAt,
  });

  const onCsv = () => {
    try {
      downloadTextFile(`ssot-${safeFileName(project.name)}.csv`, buildSsotReportCSV(buildInput()));
      toast.success('تم تصدير ملف CSV');
    } catch (e) {
      logger.capture('SsotReportExport.csv', e, { projectId: project.id });
      toast.error('تعذّر التصدير');
    }
  };

  const onPdf = async () => {
    setBusy(true);
    try {
      await exportSsotReportPDF({ ...buildInput(), currency: project.currency });
      toast.success('تم تصدير ملف PDF');
    } catch (e) {
      logger.capture('SsotReportExport.pdf', e, { projectId: project.id });
      toast.error('تعذّر التصدير');
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          تصدير الربحية والمطابقة
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>ملخص الربحية + التسويات + مطابقة الخادم</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCsv}>
          <FileSpreadsheet className="w-4 h-4 me-2" />تصدير CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void onPdf()}>
          <FileText className="w-4 h-4 me-2" />تصدير PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
