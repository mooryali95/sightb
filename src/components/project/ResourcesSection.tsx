import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency, getTotalPlanned } from '@/lib/finance';
import { type Resource, type BudgetItem, type Expense } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

interface ResourcesSectionProps {
  projectId: string;
  resources: Resource[];
  budgetItems?: BudgetItem[];
  expenses?: Expense[];
  readOnly?: boolean;
  durationMonths?: number;
}

export function ResourcesSection({ projectId, resources, budgetItems = [], expenses: propExpenses, readOnly = false, durationMonths = 0 }: ResourcesSectionProps) {
  const { addResource, updateResource, deleteResource, addBudgetItem, expenses: storeExpenses } = useStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [monthlyCost, setMonthlyCost] = useState('');

  // Budget prompt
  const [budgetPrompt, setBudgetPrompt] = useState<{ resourceId: string; name: string; role: string; monthlyCost: number } | null>(null);

  const pExpenses = propExpenses || storeExpenses.filter(e => e.projectId === projectId);

  const resetForm = () => {
    setEditingId(null); setName(''); setRole(''); setMonthlyCost('');
  };

  const openEdit = (r: Resource) => {
    setEditingId(r.id); setName(r.name); setRole(r.role || '');
    setMonthlyCost(String(r.monthlyCost)); setOpen(true);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (editingId) {
      await updateResource(editingId, {
        name: name.trim(), role: role.trim() || undefined,
        monthlyCost: parseFloat(monthlyCost) || 0,
      });
      toast.success('تم تعديل المورد');
    } else {
      const newId = await addResource({
        projectId, name: name.trim(),
        role: role.trim() || undefined, monthlyCost: parseFloat(monthlyCost) || 0,
      });
      toast.success('تمت إضافة المورد');
      if (parseFloat(monthlyCost) > 0 && durationMonths > 0) {
        setBudgetPrompt({
          resourceId: newId, name: name.trim(),
          role: role.trim(), monthlyCost: parseFloat(monthlyCost),
        });
      }
    }
    resetForm(); setOpen(false);
  };

  const totalMonthlyCost = resources.reduce((s, r) => s + r.monthlyCost, 0);
  const hasBudgetData = budgetItems.length > 0;

  // Check if any resource has estimated (no linked budget item) planned cost
  const hasEstimated = resources.some(r => budgetItems.filter(b => b.resourceId === r.id).length === 0 && r.monthlyCost > 0);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">الموارد البشرية</h3>
          <p className="text-xs text-muted-foreground">{resources.length} مورد · التكلفة الشهرية: {formatCurrency(totalMonthlyCost)}</p>
        </div>
        {!readOnly && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />إضافة مورد</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editingId ? 'تعديل المورد' : 'إضافة مورد جديد'}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>الاسم</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أحمد محمد" />
              </div>
              <div className="space-y-2">
                <Label>الدور / المسمى الوظيفي</Label>
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="مثال: مدير مشروع" />
              </div>
              <div className="space-y-2">
                <Label>التكلفة الشهرية</Label>
                <Input type="number" value={monthlyCost} onChange={(e) => setMonthlyCost(e.target.value)} placeholder="0" />
              </div>
              <Button onClick={handleSubmit} className="w-full">{editingId ? 'حفظ التعديلات' : 'إضافة'}</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {resources.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-2">لا توجد موارد مسجلة بعد</p>
          <p className="text-xs text-muted-foreground">ابدأ بتسجيل الموارد البشرية ← ثم أضف بنود الموازنة</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الدور</th>
                <th>التكلفة الشهرية</th>
                <th>المخطط</th>
                <th>إجمالي الصرف</th>
                <th>الانحراف</th>
                <th>نسبة الصرف</th>
                {!readOnly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {resources.map((r) => {
                const totalSpent = pExpenses.filter(e => e.resourceId === r.id).reduce((s, e) => s + e.amount, 0);
                const linkedBudget = budgetItems.filter(b => b.resourceId === r.id);
                const plannedForResource = linkedBudget.length > 0
                  ? getTotalPlanned(linkedBudget)
                  : r.monthlyCost * (durationMonths || 1);
                const isEstimated = linkedBudget.length === 0 && r.monthlyCost > 0;
                const variance = plannedForResource - totalSpent;
                const variancePct = plannedForResource > 0 ? (variance / plannedForResource) * 100 : 0;

                return (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-muted-foreground">{r.role || '—'}</td>
                    <td className="font-mono text-sm">{formatCurrency(r.monthlyCost)}</td>
                    <td className="font-mono text-sm">
                      {plannedForResource > 0 ? (
                        <span className="flex items-center gap-1">
                          {formatCurrency(plannedForResource)}
                          {isEstimated && <span className="text-amber-500 text-[10px]">*</span>}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="font-mono text-sm">{formatCurrency(totalSpent)}</td>
                    <td>
                      {plannedForResource > 0 ? (
                        <span className={variance >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(variance)}</span>
                      ) : '—'}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {plannedForResource > 0 ? `${variancePct.toFixed(1)}%` : '—'}
                    </td>
                    {!readOnly && (
                    <td>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        <ConfirmDeleteDialog title="حذف المورد" description="هل أنت متأكد من حذف هذا المورد؟" onConfirm={() => deleteResource(r.id)} />
                      </div>
                    </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {hasEstimated && (
            <p className="text-[10px] text-muted-foreground mt-2">* تقديري = التكلفة الشهرية × مدة المشروع — لم يُربط ببند موازنة بعد</p>
          )}
        </div>
      )}

      {/* Budget auto-generate dialog */}
      <Dialog open={!!budgetPrompt} onOpenChange={(v) => { if (!v) setBudgetPrompt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إنشاء بند موازنة؟</DialogTitle>
          </DialogHeader>
          {budgetPrompt && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                هل تريد إنشاء بند موازنة تلقائي لهذا المورد؟
              </p>
              <div className="p-3 rounded-lg border border-border bg-muted/30">
                <p className="text-sm font-medium">{budgetPrompt.name} {budgetPrompt.role && `— ${budgetPrompt.role}`}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(budgetPrompt.monthlyCost)} × {durationMonths} شهر = {formatCurrency(budgetPrompt.monthlyCost * (durationMonths || 1))}
                </p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={async () => {
                  await addBudgetItem({
                    projectId,
                    category: 'salary',
                    description: `${budgetPrompt.name}${budgetPrompt.role ? ` — ${budgetPrompt.role}` : ''}`,
                    plannedAmount: budgetPrompt.monthlyCost,
                    costType: 'recurring',
                    costClass: 'direct',
                    startMonth: 1,
                    endMonth: durationMonths || 1,
                    resourceId: budgetPrompt.resourceId,
                  });
                  toast.success('تم إنشاء بند الموازنة');
                  setBudgetPrompt(null);
                }}>
                  نعم — أنشئ البند
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setBudgetPrompt(null)}>
                  لا — يدوياً لاحقاً
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
