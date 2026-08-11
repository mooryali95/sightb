import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { Project } from '@/types/project';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project;
  onSave: (values: Partial<Project>) => Promise<void>;
}

const emptyForm = {
  name: '', contractValue: 0, durationMonths: 0, description: '',
  retentionPercent: 0, managementReserve: 0, percentComplete: 0, taxPercent: 15,
};

export function ProjectEditDialog({ open, onOpenChange, project, onSave }: Props) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    setForm({
      name: project.name,
      contractValue: project.contractValue,
      durationMonths: project.durationMonths,
      description: project.description || '',
      retentionPercent: project.retentionPercent || 0,
      managementReserve: project.managementReserve || 0,
      percentComplete: project.percentComplete || 0,
      taxPercent: project.taxPercent ?? 15,
    });
    // Keyed on the identity of the project, not its contents: this seeds the
    // form when a different project is opened. Depending on the fields would
    // re-seed whenever the underlying row changes — including a realtime update
    // arriving mid-edit, which would silently discard what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('اسم المشروع مطلوب'); return; }
    if (form.contractValue < 0) { toast.error('قيمة العقد يجب أن تكون موجبة'); return; }
    if (form.durationMonths < 1) { toast.error('المدة يجب أن تكون شهر واحد على الأقل'); return; }
    try {
      await onSave({
        name: form.name.trim(),
        contractValue: form.contractValue,
        durationMonths: form.durationMonths,
        description: form.description.trim() || undefined,
        retentionPercent: form.retentionPercent,
        managementReserve: form.managementReserve,
        percentComplete: form.percentComplete,
        taxPercent: form.taxPercent,
      });
      onOpenChange(false);
      toast.success('تم تحديث بيانات المشروع');
    } catch {
      toast.error('فشل تحديث المشروع');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل بيانات المشروع</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>اسم المشروع</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>قيمة العقد</Label>
              <Input type="number" min={0} value={form.contractValue} onChange={e => setForm(f => ({ ...f, contractValue: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>المدة (أشهر)</Label>
              <Input type="number" min={1} max={120} value={form.durationMonths} onChange={e => setForm(f => ({ ...f, durationMonths: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>نسبة الإنجاز %</Label>
              <Input type="number" min={0} max={100} value={form.percentComplete} onChange={e => setForm(f => ({ ...f, percentComplete: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>نسبة الحجز %</Label>
              <Input type="number" min={0} max={100} value={form.retentionPercent} onChange={e => setForm(f => ({ ...f, retentionPercent: Number(e.target.value) }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>الاحتياطي الإداري</Label>
            <Input type="number" min={0} value={form.managementReserve} onChange={e => setForm(f => ({ ...f, managementReserve: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label>نسبة الضريبة (VAT) %</Label>
            <Input type="number" min={0} max={100} step={0.1} value={form.taxPercent} onChange={e => setForm(f => ({ ...f, taxPercent: Number(e.target.value) }))} />
          </div>
          <div className="space-y-1.5">
            <Label>الوصف</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} maxLength={500} rows={2} />
          </div>
          <Button onClick={handleSave} className="w-full">حفظ التعديلات</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
