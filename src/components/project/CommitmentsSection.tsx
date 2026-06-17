import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import {
  COMMITMENT_STATUS_LABELS, COMMITMENT_STATUS_COLORS,
  type Commitment, type CommitmentStatus,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus, Pencil, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { InspectorPanel, InspectorSection, InspectorField, InspectorKpiStrip } from '@/components/ui/inspector-panel';
import { Progress } from '@/components/ui/progress';
import { TableDensityToggle } from '@/components/ui/table-density-toggle';
import { useTableDensity } from '@/hooks/useTableDensity';

interface Props {
  projectId: string;
  commitments: Commitment[];
  totalPlanned: number;
  readOnly?: boolean;
}

export function CommitmentsSection({ projectId, commitments, totalPlanned, readOnly = false }: Props) {
  const { addCommitment, updateCommitment, deleteCommitment } = useStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inspectorId, setInspectorId] = useState<string | null>(null);
  const [density] = useTableDensity();
  const [description, setDescription] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [contractRef, setContractRef] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [spentAmount, setSpentAmount] = useState('0');
  const [status, setStatus] = useState<CommitmentStatus>('active');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setEditingId(null); setDescription(''); setVendorName(''); setContractRef('');
    setTotalAmount(''); setSpentAmount('0'); setStatus('active'); setNotes('');
  };

  const openEdit = (c: Commitment) => {
    setEditingId(c.id); setDescription(c.description);
    setVendorName(c.vendorName || ''); setContractRef(c.contractRef || '');
    setTotalAmount(String(c.totalAmount)); setSpentAmount(String(c.spentAmount));
    setStatus(c.status); setNotes(c.notes || '');
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!description.trim() || !totalAmount) return;
    const spent = parseFloat(spentAmount) || 0;
    const total = parseFloat(totalAmount) || 0;

    // Budget overrun validation (only for new commitments)
    if (!editingId) {
      const currentTotalCommitted = commitments
        .filter(c => c.status === 'active')
        .reduce((s, c) => s + c.totalAmount, 0);
      const newTotal = currentTotalCommitted + total;
      if (newTotal > totalPlanned && totalPlanned > 0) {
        const over = newTotal - totalPlanned;
        const confirmed = window.confirm(
          `هذا الالتزام يتجاوز الميزانية بمقدار ${formatCurrency(over)}. هل تريد المتابعة؟`
        );
        if (!confirmed) return;
      }
    }

    // Auto-complete if fully spent
    let autoStatus = status;
    if (spent >= total && total > 0 && status === 'active') {
      autoStatus = 'completed';
      toast.success('✓ الالتزام اكتمل تلقائياً — المبلغ صُرف بالكامل');
    }

    const data = {
      description: description.trim(),
      vendorName: vendorName.trim() || undefined,
      contractRef: contractRef.trim() || undefined,
      totalAmount: total,
      spentAmount: spent,
      status: autoStatus,
      notes: notes.trim() || undefined,
    };
    if (editingId) {
      await updateCommitment(editingId, data);
      toast.success('تم تعديل الالتزام');
    } else {
      await addCommitment({ projectId, ...data });
      toast.success('تمت إضافة الالتزام');
    }
    resetForm(); setOpen(false);
  };

  const activeCommitments = commitments.filter(c => c.status === 'active');
  const totalCommitted = activeCommitments.reduce((s, c) => s + c.totalAmount, 0);
  const totalSpent = activeCommitments.reduce((s, c) => s + c.spentAmount, 0);
  const availableBudget = totalPlanned - totalCommitted;

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">الالتزامات التعاقدية</h3>
          <p className="text-xs text-muted-foreground">
            {commitments.length} التزام · نشط: {formatCurrency(totalCommitted)} · مصروف: {formatCurrency(totalSpent)}
          </p>
        </div>
        {!readOnly && (
          <ResponsiveFormDialog
            open={open}
            onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}
            title={editingId ? 'تعديل الالتزام' : 'إضافة التزام'}
            trigger={<Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />التزام جديد</Button>}
            footer={<FormFooter onCancel={() => setOpen(false)} onSubmit={handleSubmit} submitLabel={editingId ? 'حفظ التعديلات' : 'إضافة'} />}
          >
            <div className="space-y-4">
                <div className="space-y-2">
                  <Label>الوصف</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: عقد توريد معدات" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>المورّد</Label>
                    <Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="اختياري" />
                  </div>
                  <div className="space-y-2">
                    <Label>مرجع العقد</Label>
                    <Input value={contractRef} onChange={(e) => setContractRef(e.target.value)} placeholder="اختياري" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>إجمالي المبلغ</Label>
                    <Input type="number" inputMode="decimal" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>المصروف حتى الآن</Label>
                    <Input type="number" inputMode="decimal" value={spentAmount} onChange={(e) => setSpentAmount(e.target.value)} placeholder="0" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>الحالة</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as CommitmentStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(COMMITMENT_STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>ملاحظات (اختياري)</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
            </div>
          </ResponsiveFormDialog>
        )}
      </div>

      {/* Summary cards */}
      {commitments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الالتزامات</p>
            <p className="text-sm font-mono font-bold mt-1">{formatCurrency(totalCommitted)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">المصروف</p>
            <p className="text-sm font-mono font-bold mt-1">{formatCurrency(totalSpent)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">متبقي من الالتزامات</p>
            <p className="text-sm font-mono font-bold mt-1">{formatCurrency(totalCommitted - totalSpent)}</p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">المتاح من الموازنة</p>
            <p className={`text-sm font-mono font-bold mt-1 ${availableBudget >= 0 ? 'health-good' : 'text-destructive'}`}>
              {formatCurrency(availableBudget)}
            </p>
          </div>
        </div>
      )}

      {commitments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">لا توجد التزامات تعاقدية بعد</p>
        </div>
      ) : (
        <>
        <div className="flex justify-end mb-2"><TableDensityToggle /></div>
        <div className="data-table-wrapper data-table-wrapper--scroll">
          <table className="data-table" data-density={density}>
            <thead>
              <tr>
                <th>الوصف</th>
                <th>المورّد</th>
                <th>العقد</th>
                <th>المبلغ</th>
                <th>المصروف</th>
                <th>المتبقي</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {commitments.map((c) => {
                const remaining = c.totalAmount - c.spentAmount;
                return (
                  <tr key={c.id}>
                    <td className="font-medium">{c.description}</td>
                    <td className="text-xs text-muted-foreground">{c.vendorName || '—'}</td>
                    <td className="text-xs text-muted-foreground">{c.contractRef || '—'}</td>
                    <td className="font-mono text-sm">{formatCurrency(c.totalAmount)}</td>
                    <td className="font-mono text-sm">{formatCurrency(c.spentAmount)}</td>
                    <td><span className={remaining >= 0 ? 'badge-profit' : 'badge-loss'}>{formatCurrency(remaining)}</span></td>
                    <td>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${COMMITMENT_STATUS_COLORS[c.status]}`}>
                        {COMMITMENT_STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" aria-label="عرض التفاصيل" onClick={() => setInspectorId(c.id)}>
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </Button>
                        {!readOnly && (
                          <>
                            <Button variant="ghost" size="icon" aria-label="تعديل" onClick={() => openEdit(c)}>
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                            <ConfirmDeleteDialog title="حذف الالتزام" description="هل أنت متأكد من حذف هذا الالتزام؟" onConfirm={() => deleteCommitment(c.id)} />
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

      {/* Inspector Panel */}
      {(() => {
        const inspected = inspectorId ? commitments.find(c => c.id === inspectorId) : null;
        if (!inspected) return null;
        const remaining = inspected.totalAmount - inspected.spentAmount;
        const spentRatio = inspected.totalAmount > 0 ? (inspected.spentAmount / inspected.totalAmount) * 100 : 0;
        return (
          <InspectorPanel
            open={!!inspectorId}
            onOpenChange={(v) => { if (!v) setInspectorId(null); }}
            title={inspected.description}
            description={inspected.vendorName ? `المورّد: ${inspected.vendorName}` : undefined}
            meta={
              <span className={`text-xs px-2 py-1 rounded-full ${COMMITMENT_STATUS_COLORS[inspected.status]}`}>
                {COMMITMENT_STATUS_LABELS[inspected.status]}
              </span>
            }
            footer={!readOnly ? (
              <Button size="sm" onClick={() => { openEdit(inspected); setInspectorId(null); }}>
                <Pencil className="w-3.5 h-3.5 ml-1.5" /> تعديل
              </Button>
            ) : undefined}
          >
            <InspectorKpiStrip
              items={[
                { label: 'إجمالي', value: formatCurrency(inspected.totalAmount) },
                { label: 'مصروف', value: formatCurrency(inspected.spentAmount) },
                { label: 'متبقي', value: formatCurrency(remaining), tone: remaining >= 0 ? 'success' : 'destructive' },
                { label: 'نسبة الصرف', value: `${spentRatio.toFixed(1)}%`, tone: spentRatio >= 90 ? 'warning' : 'default' },
              ]}
            />
            <InspectorSection title="الصرف">
              <Progress value={Math.min(spentRatio, 100)} className="h-2" />
              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                {formatCurrency(inspected.spentAmount)} من {formatCurrency(inspected.totalAmount)}
              </p>
            </InspectorSection>
            <InspectorSection title="بيانات العقد">
              <InspectorField label="المورّد" value={inspected.vendorName || '—'} />
              <InspectorField label="مرجع العقد" value={inspected.contractRef || '—'} mono />
            </InspectorSection>
            {inspected.notes && (
              <InspectorSection title="ملاحظات">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{inspected.notes}</p>
              </InspectorSection>
            )}
          </InspectorPanel>
        );
      })()}
    </div>
  );
}
