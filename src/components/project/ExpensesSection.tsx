import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { useDialogSession } from '@/hooks/useDialogSession';
import { formatCurrency, calcVAT, addVAT } from '@/lib/finance';
import {
  EXPENSE_CATEGORY_LABELS, APPROVAL_STATUS_LABELS, APPROVAL_STATUS_COLORS,
  type ExpenseCategory, type ApprovalStatus, type Resource, type Custody, type BudgetItem,
  type Expense, type Revenue,
} from '@/types/project';
import { getActiveFund } from '@/lib/funds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Check, X, AlertCircle, Wallet, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { TableDensityToggle } from '@/components/ui/table-density-toggle';
import { useTableDensity } from '@/hooks/useTableDensity';
import { useResponsiveTableLabels } from '@/hooks/useResponsiveTableLabels';
import { ExpenseFormDialog } from './expenses/ExpenseFormDialog';
import { ExpenseInspector } from './expenses/ExpenseInspector';
import { BulkApproveButton } from './expenses/BulkApproveButton';
import { translateDbError } from './expenses/translateDbError';
import { summarizeSpendByResource, matchesResourceQuery, normalizeArabicName, indexResources, resourceKeyOf, UNLINKED_KEY } from '@/lib/resource-spend';
import { runOrToast } from '@/lib/run-or-toast';
import { useShallow } from 'zustand/react/shallow';

interface ExpensesSectionProps {
  projectId: string;
  durationMonths: number;
  expenses: Expense[];
  resources: Resource[];
  custodies: Custody[];
  budgetItems: BudgetItem[];
  revenues: Revenue[];
  contractValue: number;
  readOnly?: boolean;
  taxPercent?: number;
  projectStatus?: string;
}

export function ExpensesSection({ projectId, durationMonths, expenses, resources, custodies, budgetItems, revenues, contractValue, readOnly = false, taxPercent = 15, projectStatus }: ExpensesSectionProps) {
  const { deleteExpense, updateExpense, projectFunds } = useStore(useShallow((s) => ({ deleteExpense: s.deleteExpense, updateExpense: s.updateExpense, projectFunds: s.projectFunds })));
  const { isAdminFor } = useRole();
  const isAdmin = isAdminFor('project', projectId);
  const inspector = useDialogSession<string>();
  const [density] = useTableDensity();
  const mobileTableRef = useResponsiveTableLabels<HTMLTableElement>();

  const activeFund = useMemo(
    () => getActiveFund(projectId, projectFunds),
    [projectId, projectFunds],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterApproval, setFilterApproval] = useState<string>('all');
  const [resourceQuery, setResourceQuery] = useState('');
  const [filterResource, setFilterResource] = useState<string | null>(null);

  // إخفاء السلف القائمة من جدول المصروفات (تُعرض كذمم مدينة في قسم المستحقات)
  const visibleExpenses = useMemo(
    () => expenses.filter((e) => !e.isOutstandingAdvance),
    [expenses],
  );

  // The search now covers the vendor and the linked resource's name too, and
  // ignores Arabic spelling variants (أ/ا، ة/ه، ى/ي), so "ايمن" finds "أيمن".
  const resourceNameById = useMemo(() => new Map(resources.map((r) => [r.id, r.name])), [resources]);
  const q = normalizeArabicName(searchQuery);
  const matchesFilters = (exp: Expense) => {
    const haystack = normalizeArabicName(
      [exp.description, exp.responsible, exp.vendor, exp.resourceId ? resourceNameById.get(exp.resourceId) : '']
        .filter(Boolean).join(' '),
    );
    const matchesSearch = !q || haystack.includes(q);
    const matchesCategory = filterCategory === 'all' || exp.category === filterCategory;
    const matchesMonth = filterMonth === 'all' || String(exp.month) === filterMonth;
    const matchesApproval = filterApproval === 'all' || exp.approvalStatus === filterApproval;
    return matchesSearch && matchesCategory && matchesMonth && matchesApproval;
  };
  // One attribution rule for both the cards and the table filter, so clicking
  // a card shows exactly the expenses its figure adds up.
  const resourceIdx = useMemo(() => indexResources(resources), [resources]);
  const filteredByFields = visibleExpenses.filter(matchesFilters);
  const filteredExpenses = filterResource
    ? filteredByFields.filter((e) => resourceKeyOf(e, resourceIdx) === filterResource)
    : filteredByFields;

  const pendingCount = visibleExpenses.filter(e => e.approvalStatus === 'pending').length;

  // ─── The expense form (add and edit) ───
  // Owns its own state; remounted (via `key`) on every open so an edit starts
  // from the row and an add starts blank. See useDialogSession.
  const form = useDialogSession<{ expense?: Expense }>();

  // Quick-link an existing legacy expense to the active fund
  const handleQuickLinkFund = async (expId: string) => {
    if (!activeFund) return;
    try {
      await updateExpense(expId, { fundId: activeFund.id });
      toast.success('تم ربط المصروف بالدفعة النشطة');
    } catch (err) {
      toast.error(translateDbError(errorMessage(err, '')) || 'تعذّر الربط');
    }
  };

  const handleApprove = async (expId: string) => {
    if (!(await runOrToast(() => updateExpense(expId, { approvalStatus: 'approved' }), 'تعذّر اعتماد المصروف'))) return;
    toast.success('تم اعتماد المصروف');
  };

  const handleReject = async (expId: string) => {
    if (!(await runOrToast(() => updateExpense(expId, { approvalStatus: 'rejected' }), 'تعذّر رفض المصروف'))) return;
    toast.success('تم رفض المصروف');
  };

  // What counts as spend: not a rejected expense, and not an advance still
  // outstanding, which the table hides as a receivable. Every figure on this
  // screen reads the same list, so the per-resource and per-responsible cards
  // cannot disagree with the total above them.
  const countedExpenses = visibleExpenses.filter((e) => e.approvalStatus !== 'rejected');

  const responsibleMap = new Map<string, number>();
  countedExpenses.forEach((e) => {
    const key = e.responsible || 'غير محدد';
    responsibleMap.set(key, (responsibleMap.get(key) || 0) + e.amount);
  });

  // Per-resource spend follows the table's filters (month, category, approval,
  // search), so the cards move with whatever the user narrows to. Expenses are
  // attributed by link first, then by the name typed in المسؤول / المورد.
  const filtersActive = !!q || filterCategory !== 'all' || filterMonth !== 'all' || filterApproval !== 'all';
  const resourceSpend = summarizeSpendByResource(
    countedExpenses.filter(matchesFilters),
    resourceIdx,
  );
  const resourceSpendShown = resourceSpend.filter((r) => matchesResourceQuery(r, resourceQuery));
  const resourceSpendTotal = resourceSpend.reduce((s, r) => s + r.total, 0);

  const totalExpenses = countedExpenses.reduce((s, e) => s + e.amount, 0);
  const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
  const spendFromRevenue = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;
  const spendFromContract = contractValue > 0 ? (totalExpenses / contractValue) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Pending approval alert */}
      {pendingCount > 0 && !readOnly && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-700/30">
          <AlertCircle className="w-4 h-4 text-warning shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {pendingCount} مصروف بانتظار الاعتماد
          </p>
          <BulkApproveButton
            pending={filteredExpenses.filter((e) => e.approvalStatus === 'pending')}
            approve={(id) => updateExpense(id, { approvalStatus: 'approved' })}
          />
        </div>
      )}

      {/* Spend ratios */}
      <div className="stat-card space-y-3">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>نسبة ما صُرف من قيمة العقد ({spendFromContract.toFixed(1)}%)</span>
            <span>{formatCurrency(totalExpenses)} / {formatCurrency(contractValue)}</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-[width] bg-primary" style={{ width: `${Math.min(spendFromContract, 100)}%` }} />
          </div>
        </div>
        {totalRevenue > 0 && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>نسبة ما صُرف من الإيراد ({spendFromRevenue.toFixed(1)}%)</span>
              <span>{formatCurrency(totalExpenses)} / {formatCurrency(totalRevenue)}</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(spendFromRevenue, 100)}%`, backgroundColor: spendFromRevenue > 100 ? 'hsl(var(--destructive))' : 'hsl(var(--primary))' }} />
            </div>
          </div>
        )}
      </div>

      {/* Resource Spending Summary */}
      {resourceSpend.length > 0 && (
        <div className="stat-card">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold">ملخص الصرف حسب المورد</h3>
              <p className="text-xs text-muted-foreground">
                {resourceSpend.filter((r) => r.key !== UNLINKED_KEY).length} مورد · الإجمالي {formatCurrency(resourceSpendTotal)}
                {filtersActive && ' · حسب الفلاتر الحالية'}
              </p>
            </div>
            <Input
              value={resourceQuery}
              onChange={(e) => setResourceQuery(e.target.value)}
              placeholder="ابحث باسم المورد أو دوره…"
              aria-label="بحث في الموارد"
              className="h-8 w-full sm:w-56 text-xs"
            />
          </div>
          {resourceSpendShown.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">لا يوجد مورد يطابق «{resourceQuery}»</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {resourceSpendShown.map((r) => {
                const selected = filterResource === r.key;
                const unlinked = r.key === UNLINKED_KEY;
                const share = resourceSpendTotal > 0 ? (r.total / resourceSpendTotal) * 100 : 0;
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setFilterResource(selected ? null : r.key)}
                    aria-pressed={selected}
                    title={selected ? 'إلغاء التصفية' : 'عرض مصروفاته في الجدول'}
                    className={`text-start p-3 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected ? 'border-primary bg-primary/10' : unlinked ? 'border-dashed border-amber-400/60 bg-amber-50/50 dark:bg-amber-900/10' : 'border-border bg-muted/30 hover:bg-muted/60'
                    }`}
                  >
                    <p className="text-xs text-muted-foreground truncate">{r.name}</p>
                    <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(r.total)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.role ? `${r.role} · ` : ''}{r.count} مصروف · {share.toFixed(0)}%
                      {r.matchedByName > 0 && !unlinked && ` · ${r.matchedByName} بالاسم`}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
          {filterResource && (
            <button type="button" onClick={() => setFilterResource(null)} className="mt-3 text-xs text-primary hover:underline">
              الجدول مصفّى على مورد واحد — إلغاء التصفية
            </button>
          )}
        </div>
      )}

      {/* Responsible Summary */}
      {responsibleMap.size > 1 && (
        <div className="stat-card">
          <h3 className="text-sm font-semibold mb-3">ملخص الصرف حسب المسؤول</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from(responsibleMap.entries()).map(([name, total]) => (
              <div key={name} className="p-3 rounded-lg border border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">{name}</p>
                <p className="text-sm font-mono font-semibold mt-1">{formatCurrency(total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">سجل المصروفات</h3>
          {!readOnly && (
          <ExpenseFormDialog
            key={form.session}
            open={form.value !== null}
            onOpenChange={(v) => { if (!v) form.close(); }}
            editing={form.value?.expense}
            projectId={projectId}
            durationMonths={durationMonths}
            expenses={expenses}
            resources={resources}
            custodies={custodies}
            budgetItems={budgetItems}
            taxPercent={taxPercent}
            projectStatus={projectStatus}
            isAdmin={isAdmin}
            onRequestOpen={() => form.open({})}
          />
          )}
        </div>


        {/* Search & Filter Bar */}
        {expenses.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            <Input placeholder="بحث بالوصف أو المسؤول..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="max-w-xs h-8 text-xs" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفئات</SelectItem>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="كل الأشهر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأشهر</SelectItem>
                {Array.from({ length: durationMonths }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterApproval} onValueChange={setFilterApproval}>
              <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                {Object.entries(APPROVAL_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(searchQuery || filterCategory !== 'all' || filterMonth !== 'all' || filterApproval !== 'all') && (
              <span className="text-xs text-muted-foreground self-center">({filteredExpenses.length} نتيجة)</span>
            )}
          </div>
        )}

        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد مصروفات مسجلة بعد</p>
        ) : filteredExpenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">لا توجد نتائج مطابقة للبحث</p>
        ) : (
          <>
          <div className="flex justify-end mb-2"><TableDensityToggle /></div>
          <div className="data-table-wrapper data-table-wrapper--scroll">
            <table ref={mobileTableRef} className="data-table data-table--mobile-cards" data-density={density}>
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th>الوصف</th>
                  <th>المبلغ</th>
                  <th className="w-16">الضريبة</th>
                  <th>الحالة</th>
                  <th className="hidden sm:table-cell">الشهر</th>
                  <th className="hidden md:table-cell">بند الموازنة</th>
                  <th className="hidden md:table-cell">المورد</th>
                  <th className="hidden lg:table-cell">المسؤول</th>
                  <th className="hidden lg:table-cell">العهدة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses.map((exp) => {
                  const resource = resources.find(r => r.id === exp.resourceId);
                  const custody = custodies.find(c => c.id === exp.custodyId);
                  const budgetItem = budgetItems.find(b => b.id === exp.budgetItemId);
                  const status = exp.approvalStatus || 'approved';
                  return (
                    <tr key={exp.id} className={status === 'rejected' ? 'opacity-50' : ''}>
                      <td><span className="badge-gold">{EXPENSE_CATEGORY_LABELS[exp.category as ExpenseCategory]}</span></td>
                      <td>
                        <div>
                          {exp.description}
                          {exp.vendor && <span className="block text-xs text-muted-foreground">{exp.vendor}</span>}
                          {exp.sourcePaymentRequestId && (
                            <Badge variant="outline" className="mt-1 text-xs border-amber-300 text-amber-700 dark:text-amber-400">
                              تسوية سلفة
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="font-mono text-sm">{formatCurrency(exp.amount)}</td>
                      <td className="text-xs">
                        {exp.isVatExempt ? (
                          <span className="text-muted-foreground">معفى</span>
                        ) : taxPercent > 0 ? (
                          <span className="text-success" title={`شامل: ${formatCurrency(addVAT(exp.amount, taxPercent))}`}>
                            +{formatCurrency(calcVAT(exp.amount, taxPercent))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td>
                        <Badge className={`text-xs ${APPROVAL_STATUS_COLORS[status as ApprovalStatus] || ''}`}>
                          {APPROVAL_STATUS_LABELS[status as ApprovalStatus] || status}
                        </Badge>
                      </td>
                      <td className="hidden sm:table-cell">شهر {exp.month}</td>
                      <td className="hidden md:table-cell text-xs">{budgetItem?.description || '—'}</td>
                      <td className="hidden md:table-cell text-xs">{resource?.name || '—'}</td>
                      <td className="text-muted-foreground hidden lg:table-cell">{exp.responsible || '—'}</td>
                      <td className="hidden lg:table-cell text-xs">{custody?.resourceName || '—'}</td>
                      <td>
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => inspector.open(exp.id)} title="عرض التفاصيل">
                            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          {!readOnly && (
                            <>
                              {status === 'pending' && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleApprove(exp.id)} title="اعتماد">
                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleReject(exp.id)} title="رفض">
                                    <X className="w-3.5 h-3.5 text-destructive" />
                                  </Button>
                                </>
                              )}
                              {!exp.fundId && !exp.custodyId && activeFund && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title={`ربط بالدفعة #${activeFund.fundNumber}`}
                                  onClick={() => handleQuickLinkFund(exp.id)}
                                >
                                  <Wallet className="w-3.5 h-3.5 text-warning" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" title="تعديل المصروف" onClick={() => form.open({ expense: exp })}>
                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                              <ConfirmDeleteDialog title="حذف المصروف" description="هل أنت متأكد من حذف هذا المصروف؟" onConfirm={() => deleteExpense(exp.id)} />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <ExpenseInspector
        expense={inspector.value ? expenses.find((e) => e.id === inspector.value) : undefined}
        resources={resources}
        custodies={custodies}
        budgetItems={budgetItems}
        projectFunds={projectFunds}
        taxPercent={taxPercent}
        readOnly={readOnly}
        onEdit={(exp) => { form.open({ expense: exp }); inspector.close(); }}
        onClose={inspector.close}
      />
    </div>
  );
}
