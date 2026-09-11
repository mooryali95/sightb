import { useMemo, useEffect, useRef, useCallback } from 'react';
import {
  exportOutstandingAdvancesExcel,
  exportOutstandingAdvancesPDF,
  exportSettlementEventsExcel,
  exportSettlementEventsPDF,
  type OutstandingAdvanceRow,
  type SettlementEventRow,
} from '@/lib/export-lazy';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileDown } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { formatCurrency } from '@/lib/finance';
import { getResourceBalance } from '@/lib/resource-payables';
import { exportPayablesSummaryCSV } from '@/lib/payables-export';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { getFundRemaining, getCustodyCashTransfersIn, getCustodyOutstandingAdvances } from '@/lib/funds';
import { HandCoins } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { usePayablesScope } from './payables/usePayablesScope';
import { PayablesScopeBar } from './payables/PayablesScopeBar';
import { PayablesSummaryCards } from './payables/PayablesSummaryCards';
import { ReimbursementsTab } from './payables/ReimbursementsTab';
import { SettlementsTab } from './payables/SettlementsTab';
import { PaymentRequestsTab } from './payables/PaymentRequestsTab';
import { NewPaymentRequestDialog, type NewPaymentRequestPreset } from './payables/NewPaymentRequestDialog';
import { SettleAdvanceDialog } from './payables/SettleAdvanceDialog';
import { PayDialog } from './payables/PayDialog';
import { EditLinksDialog } from './payables/EditLinksDialog';
import { RejectDialog } from './payables/RejectDialog';
import { SettlementDraftDialog } from './payables/SettlementDraftDialog';
import { useDialogSession } from '@/hooks/useDialogSession';

interface Props {
  projectId: string;
  companyName?: string;
  projectName?: string;
  readOnly?: boolean;
}

export function ResourcePayablesSection({ projectId, companyName = '', projectName = '', readOnly = false }: Props) {
  const { isAdminFor, canEdit: canEditRole } = useRole();
  const isAdmin = isAdminFor('project', projectId);
  const canEdit = !readOnly && canEditRole('project', projectId);

  const {
    projectFunds, custodies, expenses, settlementEvents, loadSettlementEventsForRequest,
  } = useStore();

  const {
    scope, setScope,
    projBudgetItems, projResources, projAllReimbs, projReimbs, projVendorReimbs,
    projReqs, projSettles, summary, scopedReimbs,
  } = usePayablesScope(projectId);

  // ─── Dialogs ───
  // Each dialog owns its form state and is remounted (via `key`) on every
  // open, so its starting values derive from what it was opened on and
  // closing needs no reset. See useDialogSession.
  const newRequest = useDialogSession<{ preset?: NewPaymentRequestPreset }>();
  const editLinks = useDialogSession<string>();
  const payDialog = useDialogSession<{ id: string; scheduledDate?: string }>();
  const rejectDialog = useDialogSession<{ id: string; kind: 'reimb' | 'req' }>();
  const settlementDraft = useDialogSession<string>();
  const settleAdvance = useDialogSession<string>();

  const editingReq = useMemo(
    () => projReqs.find((r) => r.id === editLinks.value),
    [projReqs, editLinks.value],
  );
  const payingReq = useMemo(
    () => projReqs.find((r) => r.id === payDialog.value?.id),
    [projReqs, payDialog.value],
  );
  const settlementResource = useMemo(
    () => projResources.find((r) => r.id === settlementDraft.value),
    [projResources, settlementDraft.value],
  );
  const settlingAdvance = useMemo(
    () => projReqs.find((r) => r.id === settleAdvance.value),
    [projReqs, settleAdvance.value],
  );
  const openSettleAdvance = (id: string) => {
    settleAdvance.open(id);
    // Load settlement events for this PR
    loadSettlementEventsForRequest(id).catch(console.warn);
  };

  // ─── Cash sources with a balance (shared by the pay and settle-advance dialogs) ───
  const cashTransfers = useStore((s) => s.cashTransfers);
  const projTransfers = useMemo(
    () => (cashTransfers || []).filter((t) => t.projectId === projectId),
    [cashTransfers, projectId],
  );

  // Active funds (transferred/acknowledged) with remaining balance
  const availableFunds = useMemo(() => {
    return projectFunds
      .filter((f) => f.projectId === projectId && (f.status === 'transferred' || f.status === 'acknowledged'))
      .map((f) => ({
        fund: f,
        remaining: getFundRemaining(
          f,
          expenses.filter((e) => e.projectId === projectId),
          custodies.filter((c) => c.projectId === projectId),
          projReqs,
          projTransfers,
        ),
      }))
      .filter((x) => x.remaining > 0);
  }, [projectFunds, expenses, custodies, projectId, projReqs, projTransfers]);

  // Active custodies with remaining balance (يشمل التحويلات الواردة ويخصم السلف القائمة) — توحيد مع availableFunds
  const availableCustodies = useMemo(() => {
    return custodies
      .filter((c) => c.projectId === projectId && c.status === 'active')
      .map((c) => {
        const spent = expenses
          .filter((e) => e.custodyId === c.id)
          .reduce((s, e) => s + e.amount, 0);
        const transfersIn = getCustodyCashTransfersIn(c.id, projTransfers);
        const outstandingAdv = getCustodyOutstandingAdvances(c.id, projReqs);
        return { custody: c, remaining: (c.amount + transfersIn) - spent - outstandingAdv };
      })
      .filter((x) => x.remaining > 0);
  }, [custodies, expenses, projectId, projTransfers, projReqs]);


  // ─── Outstanding advances (paid but not settled) ───
  const outstandingAdvances = useMemo(
    () => projReqs.filter(
      (r) => r.requestType === 'advance' && r.status === 'paid' && r.isAdvanceOutstanding,
    ),
    [projReqs],
  );
  const outstandingAdvancesTotal = outstandingAdvances.reduce(
    (s, r) => s + Math.max(r.amount - (r.refundedAmount ?? 0), 0), 0,
  );
  const oldestAdvanceDays = useMemo(() => {
    if (outstandingAdvances.length === 0) return 0;
    const now = Date.now();
    return Math.max(
      ...outstandingAdvances.map((r) => {
        const t = r.paidDate ? new Date(r.paidDate).getTime() : new Date(r.createdAt).getTime();
        return Math.floor((now - t) / (1000 * 60 * 60 * 24));
      }),
    );
  }, [outstandingAdvances]);

  // ─── Compute age days per advance ───
  // Closes over nothing, so an empty dep list keeps the identity stable and
  // lets the alert effect below depend on it without re-firing every render.
  const advanceAgeDays = useCallback((req: typeof outstandingAdvances[number]): number => {
    const t = req.paidDate ? new Date(req.paidDate).getTime() : new Date(req.createdAt).getTime();
    return Math.max(0, Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24)));
  }, []);

  // ─── Aging toast alerts (once per session per advance/threshold) ───
  const agingAlerted = useRef<Set<string>>(new Set());
  useEffect(() => {
    outstandingAdvances.forEach((req) => {
      const days = advanceAgeDays(req);
      const res = projResources.find((r) => r.id === req.resourceId);
      const name = res?.name || '—';
      const thresholds: { key: string; min: number; fn: typeof toast.error; label: string }[] = [
        { key: `90-${req.id}`, min: 90, fn: toast.error, label: 'حرجة' },
        { key: `60-${req.id}`, min: 60, fn: toast.warning, label: 'متأخرة' },
        { key: `30-${req.id}`, min: 30, fn: toast.info, label: 'تحتاج متابعة' },
      ];
      for (const t of thresholds) {
        if (days >= t.min && !agingAlerted.current.has(t.key)) {
          agingAlerted.current.add(t.key);
          t.fn(`سلفة ${t.label}: ${name} — منذ ${days} يومًا`, {
            description: `المتبقي: ${formatCurrency(Math.max(req.amount - (req.refundedAmount ?? 0), 0))}`,
            duration: t.min >= 90 ? 12000 : 8000,
          });
          break;
        }
      }
    });
  }, [outstandingAdvances, projResources, advanceAgeDays]);

  // ─── Lazy-load settlement events for all advances of this project (once each) ───
  const eventsLoaded = useRef<Set<string>>(new Set());
  useEffect(() => {
    const targets = projReqs.filter(
      (r) => r.requestType === 'advance' && r.status === 'paid' && !eventsLoaded.current.has(r.id),
    );
    if (targets.length === 0) return;
    targets.forEach((r) => {
      eventsLoaded.current.add(r.id);
      loadSettlementEventsForRequest(r.id).catch(() => {});
    });
  }, [projReqs, loadSettlementEventsForRequest]);



  // ─── Export rows builders ───
  const buildOutstandingRows = (): OutstandingAdvanceRow[] =>
    outstandingAdvances.map((req) => {
      const res = projResources.find((r) => r.id === req.resourceId);
      const settled = req.refundedAmount ?? 0;
      const remaining = Math.max(req.amount - settled, 0);
      let source = '—';
      if (req.paidFromFundId) {
        const f = projectFunds.find((x) => x.id === req.paidFromFundId);
        source = `دفعة${f?.fundNumber ? ` #${f.fundNumber}` : ''}`;
      } else if (req.paidFromCustodyId) {
        const c = custodies.find((x) => x.id === req.paidFromCustodyId);
        source = `عهدة${c?.resourceName ? ` (${c.resourceName})` : ''}`;
      }
      return {
        resourceName: res?.name || '—',
        paidDate: req.paidDate || String(req.createdAt).split('T')[0],
        originalAmount: req.amount,
        settledAmount: settled,
        remainingAmount: remaining,
        ageDays: advanceAgeDays(req),
        source,
        description: req.description,
      };
    });

  const buildSettlementEventRows = (): SettlementEventRow[] => {
    const projReqIds = new Set(projReqs.map((r) => r.id));
    return settlementEvents
      .filter((e) => projReqIds.has(e.paymentRequestId))
      .map((e) => {
        const req = projReqs.find((r) => r.id === e.paymentRequestId);
        const res = req ? projResources.find((r) => r.id === req.resourceId) : undefined;
        let overflowAmount: number | undefined;
        let overflowSource: string | undefined;
        if (e.overflowExpenseId) {
          const exp = expenses.find((x) => x.id === e.overflowExpenseId);
          if (exp) {
            overflowAmount = Number(exp.amount);
            if (exp.fundId) {
              const f = projectFunds.find((x) => x.id === exp.fundId);
              overflowSource = `دفعة${f?.fundNumber ? ` #${f.fundNumber}` : ''}`;
            } else if (exp.custodyId) {
              const c = custodies.find((x) => x.id === exp.custodyId);
              overflowSource = `عهدة${c?.resourceName ? ` (${c.resourceName})` : ''}`;
            }
          }
        }
        return {
          date: String(e.createdAt).split('T')[0],
          resourceName: res?.name || '—',
          eventType: e.eventType,
          amount: Number(e.amount),
          overflowAmount,
          overflowSource,
          // The column is nullable; the export row treats "absent" as undefined.
          notes: e.notes ?? undefined,
        };
      });
  };



  return (
    <div className="space-y-6">
      <PayablesScopeBar
        scope={scope}
        onScopeChange={setScope}
        resourceCount={projReimbs.length}
        vendorCount={projVendorReimbs.length}
        onExportCsv={() => exportPayablesSummaryCSV({
          projectId,
          projectName: projectName || 'Project',
          resources: projResources,
          reimbursements: projAllReimbs,
          paymentRequests: projReqs,
          settlements: projSettles,
        })}
      />

      <PayablesSummaryCards
        scope={scope}
        totalApprovedAmount={summary.totalApprovedAmount}
        totalPaidAmount={summary.totalPaidAmount}
        totalOutstandingAmount={summary.totalOutstandingAmount}
        pendingRequestsCount={summary.pendingRequestsCount}
        outstandingAdvancesTotal={outstandingAdvancesTotal}
        outstandingAdvancesCount={outstandingAdvances.length}
        oldestAdvanceDays={oldestAdvanceDays}
      />

      {/* Export bar for advances and settlement events */}
      {(outstandingAdvances.length > 0 || settlementEvents.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 justify-end">
          {outstandingAdvances.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Download className="h-4 w-4" /> تصدير السلف القائمة
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportOutstandingAdvancesPDF(buildOutstandingRows(), projectName || 'Project')}>
                  <FileDown className="h-4 w-4 ml-2" /> PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportOutstandingAdvancesExcel(buildOutstandingRows(), projectName || 'Project')}>
                  <FileSpreadsheet className="h-4 w-4 ml-2" /> Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {buildSettlementEventRows().length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Download className="h-4 w-4" /> تصدير سجل التسويات
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportSettlementEventsPDF(buildSettlementEventRows(), projectName || 'Project')}>
                  <FileDown className="h-4 w-4 ml-2" /> PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportSettlementEventsExcel(buildSettlementEventRows(), projectName || 'Project')}>
                  <FileSpreadsheet className="h-4 w-4 ml-2" /> Excel
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}



      {/* Resources balances */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">أرصدة الموارد</h3>
        </div>
        {projResources.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد موارد بشرية في هذا المشروع.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-right py-2">المورد</th>
                  <th className="text-right py-2">المعتمد</th>
                  <th className="text-right py-2">المدفوع</th>
                  <th className="text-right py-2">الرصيد المستحق</th>
                  <th className="text-right py-2">طلبات معلقة</th>
                  <th className="text-right py-2">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {projResources.map((res) => {
                  const bal = getResourceBalance(res.id, projReimbs, projReqs, projSettles);
                  return (
                    <tr key={res.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 font-medium">{res.name}{res.role && <span className="text-muted-foreground text-xs"> — {res.role}</span>}</td>
                      <td className="py-2">{formatCurrency(bal.totalApprovedReimbursements)}</td>
                      <td className="py-2 text-emerald-600">{formatCurrency(bal.totalPaidReimbursements)}</td>
                      <td className={cn('py-2 font-semibold', bal.outstandingBalance > 0 && 'text-amber-600')}>
                        {formatCurrency(bal.outstandingBalance)}
                      </td>
                      <td className="py-2">{bal.pendingPaymentRequests}</td>
                      <td className="py-2">
                        <div className="flex gap-2 flex-wrap">
                          {canEdit && bal.outstandingBalance > 0 && (
                            <Button
                              size="sm"
                              onClick={() => {
                                const eligible = projReimbs.filter(
                                  (r) => r.resourceId === res.id && r.status === 'approved',
                                );
                                if (eligible.length === 0) {
                                  toast.info('لا توجد استردادات معتمدة قابلة للدفع لهذا المورد');
                                  return;
                                }
                                newRequest.open({ preset: {
                                  resourceId: res.id,
                                  selectedReimbIds: eligible.map((r) => r.id),
                                  description: `دفع مستحقات ${res.name}`,
                                } });
                              }}
                            >
                              <HandCoins className="h-4 w-4 ml-1" />
                              دفع المستحقات
                            </Button>
                          )}
                          {canEdit && bal.outstandingBalance > 0 && (
                            <Button size="sm" variant="outline" onClick={() => settlementDraft.open(res.id)}>
                              مخالصة
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Tabs defaultValue="reimbursements" className="w-full">
        <TabsList>
          <TabsTrigger value="reimbursements">الاستردادات ({scopedReimbs.length})</TabsTrigger>
          <TabsTrigger value="requests">طلبات الصرف ({projReqs.length})</TabsTrigger>
          <TabsTrigger value="settlements">المخالصات ({projSettles.length})</TabsTrigger>
        </TabsList>

        {/* ─── Reimbursements Tab ─── */}
        <TabsContent value="reimbursements" className="space-y-3">
          <ReimbursementsTab
            projectId={projectId}
            scope={scope}
            scopedReimbs={scopedReimbs}
            projResources={projResources}
            canEdit={canEdit}
            isAdmin={isAdmin}
            onReject={rejectDialog.open}
          />
        </TabsContent>

        <TabsContent value="requests" className="space-y-3">
          <PaymentRequestsTab
            projReqs={projReqs}
            projResources={projResources}
            canEdit={canEdit}
            isAdmin={isAdmin}
            advanceAgeDays={advanceAgeDays}
            onNewRequest={() => newRequest.open({})}
            onReject={rejectDialog.open}
            onPay={(id, scheduledDate) => payDialog.open({ id, scheduledDate })}
            onSettleAdvance={openSettleAdvance}
            onEditLinks={editLinks.open}
          />
        </TabsContent>

        {/* ─── Settlements Tab ─── */}
        <TabsContent value="settlements" className="space-y-3">
          <SettlementsTab
            projSettles={projSettles}
            projResources={projResources}
            isAdmin={isAdmin}
          />
        </TabsContent>
      </Tabs>

      {/* New payment request dialog. Mounted at section level, not inside the
          requests tab panel: Radix unmounts an inactive panel, and the
          "دفع المستحقات" button on the balances card above opens this dialog
          from whichever tab is active. */}
      {canEdit && (
        <NewPaymentRequestDialog
          key={newRequest.session}
          open={newRequest.value !== null}
          onOpenChange={(o) => { if (!o) newRequest.close(); }}
          projectId={projectId}
          projResources={projResources}
          projReimbs={projReimbs}
          projBudgetItems={projBudgetItems}
          preset={newRequest.value?.preset}
        />
      )}

      <PayDialog
        key={payDialog.session}
        request={payingReq}
        initialDate={payDialog.value?.scheduledDate}
        onClose={payDialog.close}
        availableFunds={availableFunds}
        availableCustodies={availableCustodies}
      />

      <EditLinksDialog
        key={editLinks.session}
        request={editingReq}
        projReimbs={projReimbs}
        onClose={editLinks.close}
      />

      <RejectDialog
        key={rejectDialog.session}
        target={rejectDialog.value}
        onClose={rejectDialog.close}
      />

      <SettlementDraftDialog
        key={settlementDraft.session}
        resource={settlementResource}
        projectId={projectId}
        companyName={companyName}
        projectName={projectName}
        projReimbs={projReimbs}
        projReqs={projReqs}
        onClose={settlementDraft.close}
      />

      <SettleAdvanceDialog
        key={settleAdvance.session}
        advance={settlingAdvance}
        onClose={settleAdvance.close}
        isAdmin={isAdmin}
        canEdit={canEdit}
        projResources={projResources}
        projBudgetItems={projBudgetItems}
        availableFunds={availableFunds}
        availableCustodies={availableCustodies}
      />
    </div>
  );
}
