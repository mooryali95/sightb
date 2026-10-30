/**
 * The revenue section: the total and its VAT-inclusive figure, one card per
 * status, the filters, the table, and the two dialogs (form and inspector)
 * that live under revenue/. Both dialogs are remounted on open through a
 * dialog session, so the form derives its values from the row it was opened
 * on and there is no reset handler.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { useDialogSession } from '@/hooks/useDialogSession';
import { formatCurrency, calcVAT, addVAT, getCollectedRevenue, getOutstandingInvoiced } from '@/lib/finance';
import {
  REVENUE_TYPE_LABELS, REVENUE_STATUS_LABELS, REVENUE_STATUS_COLORS, MILESTONE_STATUS_COLORS,
  type RevenueType, type RevenueStatus, type Revenue, type Milestone, type MilestoneStatus,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Eye } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { RevenueFormDialog } from './revenue/RevenueFormDialog';
import { RevenueInspector } from './revenue/RevenueInspector';

interface RevenueSectionProps {
  projectId: string;
  revenues: Revenue[];
  durationMonths: number;
  readOnly?: boolean;
  taxPercent?: number;
  milestones?: Milestone[];
}

export function RevenueSection({ projectId, revenues, durationMonths, readOnly = false, taxPercent = 0, milestones }: RevenueSectionProps) {
  const { deleteRevenue } = useStore();
  const form = useDialogSession<{ revenue?: Revenue }>();
  const inspector = useDialogSession<string>();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const inspected = inspector.value ? revenues.find((r) => r.id === inspector.value) : undefined;

  const filteredRevenues = revenues.filter((rev) => {
    const matchesSearch = !searchQuery || rev.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMonth = filterMonth === 'all' || String(rev.month) === filterMonth;
    const matchesStatus = filterStatus === 'all' || rev.status === filterStatus;
    return matchesSearch && matchesMonth && matchesStatus;
  });

  const total = revenues.reduce((s, r) => s + r.amount, 0);
  const totalTax = taxPercent > 0 ? total * (taxPercent / 100) : 0;
  const totalWithTax = total + totalTax;
  const collectedTotal = getCollectedRevenue(revenues);
  // Statuses never overlap, so the invoiced total is the receivable, as in
  // the summary library; nothing is subtracted from it.
  const invoicedTotal = getOutstandingInvoiced(revenues);
  const plannedTotal = revenues.filter((r) => r.status === 'planned').reduce((s, r) => s + r.amount, 0);

  const showVAT = taxPercent > 0;

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">الإيرادات</h3>
          <p className="text-xs text-muted-foreground">
            الإجمالي: {formatCurrency(total)}
            {showVAT && ` · شامل الضريبة (${taxPercent}%): ${formatCurrency(totalWithTax)}`}
          </p>
        </div>
        {!readOnly && (
          <RevenueFormDialog
            key={form.session}
            open={form.value !== null}
            onOpenChange={(v) => { if (!v) form.close(); }}
            onRequestOpen={() => form.open({})}
            editing={form.value?.revenue}
            projectId={projectId}
            durationMonths={durationMonths}
            taxPercent={taxPercent}
            milestones={milestones}
          />
        )}
      </div>

      {/* Revenue summary */}
      {revenues.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="p-2 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">مخطط</p>
            <p className="text-xs font-mono font-bold">{formatCurrency(plannedTotal)}</p>
          </div>
          <div className="p-2 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">مُفوتر</p>
            <p className="text-xs font-mono font-bold">{formatCurrency(invoicedTotal)}</p>
          </div>
          <div className="p-2 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">محصّل</p>
            <p className="text-xs font-mono font-bold">{formatCurrency(collectedTotal)}</p>
          </div>
          <div className="p-2 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">غير محصّل</p>
            <p className="text-xs font-mono font-bold">{formatCurrency(invoicedTotal)}</p>
          </div>
        </div>
      )}

      {revenues.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <Input placeholder="بحث بالوصف..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="max-w-xs h-8 text-xs" />
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="كل الأشهر" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأشهر</SelectItem>
              {Array.from({ length: durationMonths }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(REVENUE_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(searchQuery || filterMonth !== 'all' || filterStatus !== 'all') && (
            <span className="text-xs text-muted-foreground self-center">({filteredRevenues.length} نتيجة)</span>
          )}
        </div>
      )}

      {revenues.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد إيرادات مسجلة بعد</p>
      ) : filteredRevenues.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد نتائج مطابقة للبحث</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الوصف</th>
                <th>النوع</th>
                <th>المبلغ</th>
                {showVAT && <th>الضريبة</th>}
                {showVAT && <th>شامل الضريبة</th>}
                <th>الحالة</th>
                {milestones && milestones.length > 0 && <th>التسليمة</th>}
                <th>الشهر</th>
                <th>التاريخ</th>
                <th></th>
                {!readOnly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filteredRevenues.map((r) => (
                <tr key={r.id}>
                  <td>{r.description}</td>
                  <td className="text-xs">{REVENUE_TYPE_LABELS[r.revenueType as RevenueType] || r.revenueType}</td>
                  <td className="font-mono text-sm">{formatCurrency(r.amount)}</td>
                  {showVAT && <td className="font-mono text-xs health-good">{formatCurrency(calcVAT(r.amount, taxPercent))}</td>}
                  {showVAT && <td className="font-mono text-xs">{formatCurrency(addVAT(r.amount, taxPercent))}</td>}
                  <td>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${REVENUE_STATUS_COLORS[r.status as RevenueStatus] || ''}`}>
                      {REVENUE_STATUS_LABELS[r.status as RevenueStatus] || r.status}
                    </span>
                  </td>
                  {milestones && milestones.length > 0 && (
                    <td className="text-xs">
                      {(() => {
                        if (!r.milestoneId || !milestones) return '—';
                        const m = milestones.find((ms) => ms.id === r.milestoneId);
                        if (!m) return '—';
                        return (
                          <Badge className={`text-xs ${MILESTONE_STATUS_COLORS[m.status as MilestoneStatus] || ''}`}>
                            {m.name}
                          </Badge>
                        );
                      })()}
                    </td>
                  )}
                  <td>شهر {r.month}</td>
                  <td className="text-muted-foreground text-sm">{r.date}</td>
                  <td>
                    <Button variant="ghost" size="icon" onClick={() => inspector.open(r.id)} title="عرض التفاصيل">
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  </td>
                  {!readOnly && (
                  <td>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => form.open({ revenue: r })}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <ConfirmDeleteDialog title="حذف الإيراد" description="هل أنت متأكد من حذف هذا الإيراد؟" onConfirm={() => deleteRevenue(r.id)} />
                    </div>
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RevenueInspector
        key={inspector.session}
        revenue={inspected}
        milestones={milestones}
        taxPercent={taxPercent}
        readOnly={readOnly}
        onEdit={(r) => { form.open({ revenue: r }); inspector.close(); }}
        onClose={inspector.close}
      />
    </div>
  );
}
