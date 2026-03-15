import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import {
  CHANGE_ORDER_TYPE_LABELS, CHANGE_ORDER_STATUS_LABELS, CHANGE_ORDER_STATUS_COLORS,
  type ChangeOrderType, type ChangeOrderStatus, type ChangeOrder,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

interface ChangeOrdersSectionProps {
  projectId: string;
  changeOrders: ChangeOrder[];
  contractValue: number;
  readOnly?: boolean;
}

export function ChangeOrdersSection({ projectId, changeOrders, contractValue, readOnly = false }: ChangeOrdersSectionProps) {
  const { addChangeOrder, updateChangeOrder, deleteChangeOrder } = useStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [changeType, setChangeType] = useState<ChangeOrderType>('scope_addition');
  const [amountImpact, setAmountImpact] = useState('');
  const [durationImpact, setDurationImpact] = useState('0');
  const [status, setStatus] = useState<ChangeOrderStatus>('proposed');
  const [requestedBy, setRequestedBy] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setDescription('');
    setChangeType('scope_addition');
    setAmountImpact('');
    setDurationImpact('0');
    setStatus('proposed');
    setRequestedBy('');
  };

  const openEdit = (co: ChangeOrder) => {
    setEditingId(co.id);
    setDescription(co.description);
    setChangeType(co.changeType);
    setAmountImpact(String(co.amountImpact));
    setDurationImpact(String(co.durationImpact));
    setStatus(co.status);
    setRequestedBy(co.requestedBy || '');
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!description.trim()) return;
    const data = {
      description: description.trim(),
      changeType,
      amountImpact: parseFloat(amountImpact) || 0,
      durationImpact: parseInt(durationImpact) || 0,
      status,
      requestedBy: requestedBy || undefined,
      approvedBy: status === 'approved' ? 'admin' : undefined,
      approvedDate: status === 'approved' ? new Date().toISOString().split('T')[0] : undefined,
    };
    if (editingId) {
      await updateChangeOrder(editingId, data);
      toast.success('تم تعديل أمر التغيير');
    } else {
      await addChangeOrder({ projectId, ...data });
      toast.success('تمت إضافة أمر التغيير');
    }
    resetForm();
    setOpen(false);
  };

  const approvedImpact = changeOrders
    .filter(co => co.status === 'approved')
    .reduce((s, co) => s + co.amountImpact, 0);
  const effectiveValue = contractValue + approvedImpact;

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">أوامر التغيير</h3>
          <p className="text-xs text-muted-foreground">
            القيمة الأصلية: {formatCurrency(contractValue)} · المعدّلة: {formatCurrency(effectiveValue)}
            {approvedImpact !== 0 && ` · الأثر: ${approvedImpact > 0 ? '+' : ''}${formatCurrency(approvedImpact)}`}
          </p>
        </div>
        {!readOnly && (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />أمر تغيير جديد</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? 'تعديل أمر التغيير' : 'إضافة أمر تغيير'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: إضافة بنود إضافية للمشروع" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>نوع التغيير</Label>
                  <Select value={changeType} onValueChange={(v) => setChangeType(v as ChangeOrderType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CHANGE_ORDER_TYPE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الحالة</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as ChangeOrderStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CHANGE_ORDER_STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>الأثر المالي (±)</Label>
                  <Input type="number" value={amountImpact} onChange={(e) => setAmountImpact(e.target.value)} placeholder="50000" />
                </div>
                <div className="space-y-2">
                  <Label>الأثر على المدة (أشهر)</Label>
                  <Input type="number" value={durationImpact} onChange={(e) => setDurationImpact(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>طلب بواسطة (اختياري)</Label>
                <Input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
              </div>
              <Button onClick={handleSubmit} className="w-full">{editingId ? 'حفظ التعديلات' : 'إضافة'}</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {changeOrders.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد أوامر تغيير</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الوصف</th>
                <th>النوع</th>
                <th>الأثر المالي</th>
                <th>أثر المدة</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {changeOrders.map((co) => (
                <tr key={co.id}>
                  <td>{co.description}</td>
                  <td className="text-xs">{CHANGE_ORDER_TYPE_LABELS[co.changeType]}</td>
                  <td className={`font-mono text-sm ${co.amountImpact >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                    {co.amountImpact > 0 ? '+' : ''}{formatCurrency(co.amountImpact)}
                  </td>
                  <td className="text-xs">{co.durationImpact !== 0 ? `${co.durationImpact > 0 ? '+' : ''}${co.durationImpact} شهر` : '—'}</td>
                  <td>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CHANGE_ORDER_STATUS_COLORS[co.status]}`}>
                      {CHANGE_ORDER_STATUS_LABELS[co.status]}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(co)}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <ConfirmDeleteDialog title="حذف أمر التغيير" description="هل أنت متأكد من حذف أمر التغيير هذا؟" onConfirm={() => deleteChangeOrder(co.id)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
