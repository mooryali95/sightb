/**
 * The company edit form. The page remounts it (via `key`) on every open, so
 * the fields start from the company through the `useState` initialisers
 * and there is no reset handler. An emptied description is sent as `null`
 * so the store clears it; `undefined` would leave the old text.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import type { Company } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

interface Props {
  company: Company;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCompanyDialog({ company, open, onOpenChange }: Props) {
  const updateCompany = useStore((s) => s.updateCompany);
  const [editName, setEditName] = useState(company.name);
  const [editDescription, setEditDescription] = useState(company.description || '');

  const handleSaveEdit = async () => {
    if (!editName.trim()) { toast.error('اسم الشركة مطلوب'); return; }
    try {
      await updateCompany(company.id, { name: editName.trim(), description: editDescription.trim() || null });
      toast.success('تم تحديث بيانات الشركة');
      onOpenChange(false);
    } catch { toast.error('فشل التحديث'); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>تعديل بيانات الشركة</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>اسم الشركة *</Label>
            <Input value={editName} onChange={e => setEditName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>الوصف</Label>
            <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
          </div>
          <Button onClick={handleSaveEdit} className="w-full">حفظ</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
