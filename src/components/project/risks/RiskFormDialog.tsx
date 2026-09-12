/**
 * The risk form, for adding and for editing.
 *
 * The section remounts this component (via `key`) on every open, so an
 * edit starts from the row through the `useState` initialisers and an add
 * starts blank; there is no reset handler. The trigger button is rendered
 * here (the responsive dialog wants it as a prop) but opening is the
 * section's call through `onRequestOpen`, so the remount happens first.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import {
  RISK_PROBABILITY_LABELS, RISK_IMPACT_LABELS, RISK_CATEGORY_LABELS, RISK_STATUS_LABELS,
  type Risk, type RiskProbability, type RiskImpact, type RiskCategory, type RiskStatus,
} from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveFormDialog } from '@/components/ResponsiveFormDialog';
import { FormFooter } from '@/components/FormFooter';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The section opens the form (and remounts it) when the trigger is pressed. */
  onRequestOpen: () => void;
  /** The row being edited; absent for a new risk. */
  editing?: Risk;
  /** A new risk belongs to one of these. */
  projectId?: string;
  portfolioId?: string;
}

export function RiskFormDialog({ open, onOpenChange, onRequestOpen, editing, projectId, portfolioId }: Props) {
  const { addRisk, updateRisk } = useStore();
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [probability, setProbability] = useState<RiskProbability>(editing?.probability ?? 'medium');
  const [impact, setImpact] = useState<RiskImpact>(editing?.impact ?? 'medium');
  const [financialImpact, setFinancialImpact] = useState(editing ? String(editing.financialImpact) : '0');
  const [category, setCategory] = useState<RiskCategory>(editing?.category ?? 'financial');
  const [status, setStatus] = useState<RiskStatus>(editing?.status ?? 'open');
  const [mitigationPlan, setMitigationPlan] = useState(editing?.mitigationPlan ?? '');
  const [owner, setOwner] = useState(editing?.owner ?? '');

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('العنوان مطلوب'); return; }
    try {
      if (editing) {
        await updateRisk(editing.id, {
          title: title.trim(),
          description: description.trim() || null,
          probability, impact,
          financialImpact: parseFloat(financialImpact) || 0, category, status,
          mitigationPlan: mitigationPlan.trim() || null,
          owner: owner.trim() || null,
        });
        toast.success('تم تحديث الخطر');
      } else {
        await addRisk({
          projectId: projectId || undefined,
          portfolioId: portfolioId || undefined,
          title: title.trim(),
          description: description.trim() || undefined, probability, impact,
          financialImpact: parseFloat(financialImpact) || 0, category, status,
          mitigationPlan: mitigationPlan.trim() || undefined,
          owner: owner.trim() || undefined,
        });
        toast.success('تم إضافة الخطر');
      }
      onOpenChange(false);
    } catch (e) {
      console.error('[updateRisk]', e);
      toast.error(errorMessage(e, 'حدث خطأ عند تحديث الخطر'));
    }
  };

  return (
    <ResponsiveFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? 'تعديل الخطر' : 'إضافة خطر جديد'}
      desktopWidthClassName="max-w-lg"
      trigger={<Button size="sm" className="gap-1" onClick={onRequestOpen}><Plus className="w-3.5 h-3.5" />إضافة خطر</Button>}
      footer={<FormFooter onCancel={() => onOpenChange(false)} onSubmit={handleSubmit} submitLabel={editing ? 'تحديث' : 'إضافة'} />}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>العنوان *</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="وصف مختصر للخطر" />
        </div>
        <div className="space-y-1">
          <Label>الوصف</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="تفاصيل إضافية" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>الاحتمال</Label>
            <Select value={probability} onValueChange={v => setProbability(v as RiskProbability)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RISK_PROBABILITY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>الأثر</Label>
            <Select value={impact} onValueChange={v => setImpact(v as RiskImpact)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RISK_IMPACT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>الفئة</Label>
            <Select value={category} onValueChange={v => setCategory(v as RiskCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RISK_CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>الحالة</Label>
            <Select value={status} onValueChange={v => setStatus(v as RiskStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RISK_STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>الأثر المالي (ر.س)</Label>
            <Input type="number" inputMode="decimal" value={financialImpact} onChange={e => setFinancialImpact(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>المسؤول</Label>
            <Input value={owner} onChange={e => setOwner(e.target.value)} placeholder="اسم المسؤول" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>خطة التخفيف</Label>
          <Input value={mitigationPlan} onChange={e => setMitigationPlan(e.target.value)} placeholder="الإجراءات المتخذة" />
        </div>
      </div>
    </ResponsiveFormDialog>
  );
}
