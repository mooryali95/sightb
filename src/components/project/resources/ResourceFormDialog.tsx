/**
 * The resource form, for adding and for editing.
 *
 * The section remounts this component (via `key`) on every open, so an edit
 * starts from the row through the `useState` initialisers and an add starts
 * blank; there is no reset handler. The trigger button is rendered here and
 * opening is the section's call through `onRequestOpen`, so the remount
 * happens before the dialog shows.
 */
import { useState } from 'react';
import { useStore } from '@/store/useStore';
import type { Resource } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

/** What the section needs to offer a budget item for a resource just added. */
export interface AddedResource {
  resourceId: string;
  name: string;
  role: string;
  monthlyCost: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The section opens the form (and remounts it) when the trigger is pressed. */
  onRequestOpen: () => void;
  /** The row being edited; absent for a new resource. */
  editing?: Resource;
  projectId: string;
  /** Fires after a new resource is saved; the section decides whether to offer a budget item. */
  onAdded: (added: AddedResource) => void;
}

export function ResourceFormDialog({ open, onOpenChange, onRequestOpen, editing, projectId, onAdded }: Props) {
  const { addResource, updateResource } = useStore();
  const editingId = editing?.id ?? null;
  const [name, setName] = useState(editing?.name ?? '');
  const [role, setRole] = useState(editing?.role ?? '');
  const [monthlyCost, setMonthlyCost] = useState(editing ? String(editing.monthlyCost) : '');

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
      onAdded({ resourceId: newId, name: name.trim(), role: role.trim(), monthlyCost: parseFloat(monthlyCost) || 0 });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5" onClick={onRequestOpen}>
          <Plus className="w-3.5 h-3.5" />إضافة مورد
        </Button>
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
  );
}
