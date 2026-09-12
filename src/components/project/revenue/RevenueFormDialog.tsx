/**
 * The revenue form, for adding and for editing.
 *
 * The section remounts this component (via `key`) on every open. An edit
 * starts from the row's values through the `useState` initialisers below,
 * and an add starts blank, so there is no reset handler. The trigger button
 * is rendered here (the responsive dialog wants it as a prop) but opening is
 * the section's call through `onRequestOpen`, so the remount happens first.
 *
 * What the form hides for the chosen status is cleared on save, not left as
 * it was: a planned revenue has no invoice, and only a collected one has a
 * collection date. On an edit `null` clears the field on the wire, where
 * `undefined` would keep it.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency, calcVAT, addVAT, removeVAT } from '@/lib/finance';
import {
  REVENUE_TYPE_LABELS, REVENUE_STATUS_LABELS, MILESTONE_STATUS_LABELS,
  type RevenueType, type RevenueStatus, type Revenue, type Milestone, type MilestoneStatus,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The section opens the form (and remounts it) when the trigger is pressed. */
  onRequestOpen: () => void;
  /** The row being edited; absent for a new revenue. */
  editing?: Revenue;
  projectId: string;
  durationMonths: number;
  taxPercent: number;
  milestones?: Milestone[];
}

export function RevenueFormDialog({
  open, onOpenChange, onRequestOpen, editing, projectId, durationMonths, taxPercent, milestones,
}: Props) {
  const { addRevenue, updateRevenue } = useStore();
  const editingId = editing?.id ?? null;
  const [description, setDescription] = useState(editing?.description ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [month, setMonth] = useState(editing ? String(editing.month) : '1');
  const [date, setDate] = useState(editing?.date ?? new Date().toISOString().split('T')[0]);
  const [revenueType, setRevenueType] = useState<RevenueType>(editing?.revenueType || 'milestone');
  const [status, setStatus] = useState<RevenueStatus>(editing?.status || 'collected');
  const [invoiceNumber, setInvoiceNumber] = useState(editing?.invoiceNumber || '');
  const [invoiceDate, setInvoiceDate] = useState(editing?.invoiceDate || '');
  const [collectionDate, setCollectionDate] = useState(editing?.collectionDate || '');
  const [milestoneId, setMilestoneId] = useState(editing?.milestoneId || '');
  const [inputInclusive, setInputInclusive] = useState(false);

  const showVAT = taxPercent > 0;

  const handleSubmit = async () => {
    if (!description.trim() || !amount) return;
    const rawAmount = parseFloat(amount);
    const finalAmount = inputInclusive && taxPercent > 0 ? removeVAT(rawAmount, taxPercent) : rawAmount;
    const base = {
      description: description.trim(), amount: finalAmount, date,
      month: parseInt(month), revenueType, status,
    };
    const hasInvoice = status === 'invoiced' || status === 'collected';
    const links = {
      milestoneId: milestoneId && milestoneId !== 'none' ? milestoneId : null,
      invoiceNumber: hasInvoice && invoiceNumber ? invoiceNumber : null,
      invoiceDate: hasInvoice && invoiceDate ? invoiceDate : null,
      collectionDate: status === 'collected' && collectionDate ? collectionDate : null,
    };
    if (editingId) {
      await updateRevenue(editingId, { ...base, ...links });
      toast.success('تم تعديل الإيراد');
    } else {
      await addRevenue({
        projectId, ...base,
        milestoneId: links.milestoneId ?? undefined,
        invoiceNumber: links.invoiceNumber ?? undefined,
        invoiceDate: links.invoiceDate ?? undefined,
        collectionDate: links.collectionDate ?? undefined,
      });
      toast.success('تمت إضافة الإيراد');
    }
    onOpenChange(false);
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingId ? 'تعديل الإيراد' : 'إضافة إيراد'}
      trigger={<Button size="sm" className="gap-1.5" onClick={onRequestOpen}><Plus className="w-3.5 h-3.5" />إضافة إيراد</Button>}
      footer={<FormFooter onCancel={() => onOpenChange(false)} onSubmit={handleSubmit} submitLabel={editingId ? 'حفظ التعديلات' : 'إضافة'} />}
    >
      <div className="space-y-4">
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: دفعة أولى من العميل" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>المبلغ</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>الشهر</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: durationMonths }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* VAT inclusive toggle */}
          {showVAT && (
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={inputInclusive} onChange={(e) => setInputInclusive(e.target.checked)} className="rounded" />
                المبلغ شامل الضريبة
              </label>
            </div>
          )}
          {parseFloat(amount) > 0 && showVAT && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
              {inputInclusive
                ? `بدون ضريبة: ${formatCurrency(removeVAT(parseFloat(amount), taxPercent))} · الضريبة: ${formatCurrency(parseFloat(amount) - removeVAT(parseFloat(amount), taxPercent))}`
                : `شامل الضريبة: ${formatCurrency(addVAT(parseFloat(amount), taxPercent))} · الضريبة: ${formatCurrency(calcVAT(parseFloat(amount), taxPercent))}`
              }
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>نوع الإيراد</Label>
              <Select value={revenueType} onValueChange={(v) => setRevenueType(v as RevenueType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REVENUE_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as RevenueStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REVENUE_STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>التاريخ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {/* Milestone link */}
          {milestones && milestones.length > 0 && (
            <div className="space-y-2">
              <Label>ربط بمرحلة / تسليمة</Label>
              <Select value={milestoneId} onValueChange={setMilestoneId}>
                <SelectTrigger><SelectValue placeholder="بدون ربط" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون ربط</SelectItem>
                  {milestones.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({MILESTONE_STATUS_LABELS[m.status as MilestoneStatus]}) — وزن {(m.weight * 100).toFixed(0)}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(status === 'invoiced' || status === 'collected') && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>رقم الفاتورة</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" />
              </div>
              <div className="space-y-2">
                <Label>تاريخ الفاتورة</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              </div>
            </div>
          )}
          {status === 'collected' && (
            <div className="space-y-2">
              <Label>تاريخ التحصيل</Label>
              <Input type="date" value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)} />
            </div>
          )}
      </div>
    </ResponsiveFormDialog>
  );
}
