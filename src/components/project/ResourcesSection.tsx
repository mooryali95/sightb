import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { type Resource } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

interface ResourcesSectionProps {
  projectId: string;
  resources: Resource[];
}

export function ResourcesSection({ projectId, resources }: ResourcesSectionProps) {
  const { addResource, deleteResource, expenses } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [monthlyCost, setMonthlyCost] = useState('');

  const handleAdd = async () => {
    if (!name.trim()) return;
    await addResource({
      projectId,
      name: name.trim(),
      role: role.trim() || undefined,
      monthlyCost: parseFloat(monthlyCost) || 0,
    });
    setName(''); setRole(''); setMonthlyCost('');
    setOpen(false);
    toast.success('تمت إضافة المورد');
  };

  const totalMonthlyCost = resources.reduce((s, r) => s + r.monthlyCost, 0);
  const pExpenses = expenses.filter(e => e.projectId === projectId);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">الموارد البشرية</h3>
          <p className="text-xs text-muted-foreground">{resources.length} مورد · التكلفة الشهرية: {formatCurrency(totalMonthlyCost)}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />إضافة مورد</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>إضافة مورد جديد</DialogTitle></DialogHeader>
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
              <Button onClick={handleAdd} className="w-full">إضافة</Button>
            </div>
          </DialogContent>
        </Dialog>
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
              <tr><th>الاسم</th><th>الدور</th><th>التكلفة الشهرية</th><th>إجمالي الصرف</th><th></th></tr>
            </thead>
            <tbody>
              {resources.map((r) => {
                const totalSpent = pExpenses.filter(e => e.resourceId === r.id).reduce((s, e) => s + e.amount, 0);
                return (
                  <tr key={r.id}>
                    <td className="font-medium">{r.name}</td>
                    <td className="text-muted-foreground">{r.role || '—'}</td>
                    <td className="font-mono text-sm">{formatCurrency(r.monthlyCost)}</td>
                    <td className="font-mono text-sm">{formatCurrency(totalSpent)}</td>
                    <td><ConfirmDeleteDialog title="حذف المورد" description="هل أنت متأكد من حذف هذا المورد؟" onConfirm={() => deleteResource(r.id)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
