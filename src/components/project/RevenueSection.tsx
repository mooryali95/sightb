import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';

interface RevenueSectionProps {
  projectId: string;
  revenues: any[];
  durationMonths: number;
}

export function RevenueSection({ projectId, revenues, durationMonths }: RevenueSectionProps) {
  const { addRevenue, deleteRevenue, updateRevenue } = useStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('all');

  const resetForm = () => {
    setEditingId(null);
    setDescription('');
    setAmount('');
    setMonth('1');
    setDate(new Date().toISOString().split('T')[0]);
  };

  const openEdit = (rev: any) => {
    setEditingId(rev.id);
    setDescription(rev.description);
    setAmount(String(rev.amount));
    setMonth(String(rev.month));
    setDate(rev.date);
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!description.trim() || !amount) return;
    if (editingId) {
      await updateRevenue(editingId, {
        description: description.trim(),
        amount: parseFloat(amount),
        date,
        month: parseInt(month),
      });
      toast.success('تم تعديل الإيراد');
    } else {
      await addRevenue({
        projectId,
        description: description.trim(),
        amount: parseFloat(amount),
        date,
        month: parseInt(month),
      });
      toast.success('تمت إضافة الإيراد');
    }
    resetForm();
    setOpen(false);
  };

  const filteredRevenues = revenues.filter((rev: any) => {
    const matchesSearch = !searchQuery || rev.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMonth = filterMonth === 'all' || String(rev.month) === filterMonth;
    return matchesSearch && matchesMonth;
  });

  const total = revenues.reduce((s: number, r: any) => s + r.amount, 0);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">الإيرادات</h3>
          <p className="text-xs text-muted-foreground">الإجمالي: {formatCurrency(total)}</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" />إضافة إيراد</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? 'تعديل الإيراد' : 'إضافة إيراد'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: دفعة أولى من العميل" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>المبلغ</Label>
                  <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
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
              <div className="space-y-2">
                <Label>التاريخ</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <Button onClick={handleSubmit} className="w-full">{editingId ? 'حفظ التعديلات' : 'إضافة'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {revenues.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          <Input placeholder="بحث بالوصف..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="max-w-xs h-8 text-xs" />
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="كل الأشهر" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأشهر</SelectItem>
              {Array.from({ length: durationMonths }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>شهر {i + 1}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(searchQuery || filterMonth !== 'all') && (
            <span className="text-xs text-muted-foreground self-center">({filteredRevenues.length} نتيجة)</span>
          )}
        </div>
      )}

      {revenues.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد إيرادات مسجلة بعد</p>
      ) : filteredRevenues.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">لا توجد نتائج مطابقة للبحث</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>الوصف</th>
                <th>المبلغ</th>
                <th>الشهر</th>
                <th>التاريخ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRevenues.map((r) => (
                <tr key={r.id}>
                  <td>{r.description}</td>
                  <td className="font-mono text-sm">{formatCurrency(r.amount)}</td>
                  <td>شهر {r.month}</td>
                  <td className="text-muted-foreground text-sm">{r.date}</td>
                  <td>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <ConfirmDeleteDialog title="حذف الإيراد" description="هل أنت متأكد من حذف هذا الإيراد؟" onConfirm={() => deleteRevenue(r.id)} />
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
