import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { formatCurrency, calcVAT, addVAT } from '@/lib/finance';
import {
  REVENUE_TYPE_LABELS, REVENUE_STATUS_LABELS, REVENUE_STATUS_COLORS,
  type RevenueType, type RevenueStatus,
} from '@/types/project';
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
  readOnly?: boolean;
  taxPercent?: number;
}

export function RevenueSection({ projectId, revenues, durationMonths, readOnly = false, taxPercent = 15 }: RevenueSectionProps) {
  const { addRevenue, deleteRevenue, updateRevenue } = useStore();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [revenueType, setRevenueType] = useState<RevenueType>('milestone');
  const [status, setStatus] = useState<RevenueStatus>('collected');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [collectionDate, setCollectionDate] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const resetForm = () => {
    setEditingId(null);
    setDescription('');
    setAmount('');
    setMonth('1');
    setDate(new Date().toISOString().split('T')[0]);
    setRevenueType('milestone');
    setStatus('collected');
    setInvoiceNumber('');
    setInvoiceDate('');
    setCollectionDate('');
  };

  const openEdit = (rev: any) => {
    setEditingId(rev.id);
    setDescription(rev.description);
    setAmount(String(rev.amount));
    setMonth(String(rev.month));
    setDate(rev.date);
    setRevenueType(rev.revenueType || 'milestone');
    setStatus(rev.status || 'collected');
    setInvoiceNumber(rev.invoiceNumber || '');
    setInvoiceDate(rev.invoiceDate || '');
    setCollectionDate(rev.collectionDate || '');
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!description.trim() || !amount) return;
    const data = {
      description: description.trim(),
      amount: parseFloat(amount),
      date,
      month: parseInt(month),
      revenueType,
      status,
      invoiceNumber: invoiceNumber || undefined,
      invoiceDate: invoiceDate || undefined,
      collectionDate: collectionDate || undefined,
    };
    if (editingId) {
      await updateRevenue(editingId, data);
      toast.success('تم تعديل الإيراد');
    } else {
      await addRevenue({ projectId, ...data });
      toast.success('تمت إضافة الإيراد');
    }
    resetForm();
    setOpen(false);
  };

  const filteredRevenues = revenues.filter((rev: any) => {
    const matchesSearch = !searchQuery || rev.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMonth = filterMonth === 'all' || String(rev.month) === filterMonth;
    const matchesStatus = filterStatus === 'all' || rev.status === filterStatus;
    return matchesSearch && matchesMonth && matchesStatus;
  });

  const total = revenues.reduce((s: number, r: any) => s + r.amount, 0);
  const totalTax = taxPercent > 0 ? total * (taxPercent / 100) : 0;
  const totalWithTax = total + totalTax;
  const collectedTotal = revenues.filter((r: any) => r.status === 'collected').reduce((s: number, r: any) => s + r.amount, 0);
  const invoicedTotal = revenues.filter((r: any) => r.status === 'invoiced').reduce((s: number, r: any) => s + r.amount, 0);
  const plannedTotal = revenues.filter((r: any) => r.status === 'planned').reduce((s: number, r: any) => s + r.amount, 0);

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold">الإيرادات</h3>
          <p className="text-xs text-muted-foreground">
            الإجمالي: {formatCurrency(total)} · شامل الضريبة ({taxPercent}%): {formatCurrency(totalWithTax)}
          </p>
        </div>
        {!readOnly && (
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
              <Button onClick={handleSubmit} className="w-full">{editingId ? 'حفظ التعديلات' : 'إضافة'}</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Revenue summary */}
      {revenues.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="p-2 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">مخطط</p>
            <p className="text-xs font-mono font-bold">{formatCurrency(plannedTotal)}</p>
          </div>
          <div className="p-2 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">مُفوتر</p>
            <p className="text-xs font-mono font-bold">{formatCurrency(invoicedTotal)}</p>
          </div>
          <div className="p-2 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">محصّل</p>
            <p className="text-xs font-mono font-bold">{formatCurrency(collectedTotal)}</p>
          </div>
          <div className="p-2 rounded-lg border border-border bg-muted/30 text-center">
            <p className="text-[10px] text-muted-foreground">ذمم مدينة</p>
            <p className="text-xs font-mono font-bold">{formatCurrency(invoicedTotal)}</p>
          </div>
        </div>
      )}

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
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(REVENUE_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(searchQuery || filterMonth !== 'all' || filterStatus !== 'all') && (
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
                <th>النوع</th>
                <th>المبلغ</th>
                <th>الضريبة</th>
                <th>شامل الضريبة</th>
                <th>الحالة</th>
                <th>الشهر</th>
                <th>التاريخ</th>
                {!readOnly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filteredRevenues.map((r) => (
                <tr key={r.id}>
                  <td>{r.description}</td>
                  <td className="text-xs">{REVENUE_TYPE_LABELS[r.revenueType as RevenueType] || r.revenueType}</td>
                  <td className="font-mono text-sm">{formatCurrency(r.amount)}</td>
                  <td className="font-mono text-xs text-emerald-600">{formatCurrency(calcVAT(r.amount, taxPercent))}</td>
                  <td className="font-mono text-xs">{formatCurrency(addVAT(r.amount, taxPercent))}</td>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${REVENUE_STATUS_COLORS[r.status as RevenueStatus] || ''}`}>
                      {REVENUE_STATUS_LABELS[r.status as RevenueStatus] || r.status}
                    </span>
                  </td>
                  <td>شهر {r.month}</td>
                  <td className="text-muted-foreground text-sm">{r.date}</td>
                  {!readOnly && (
                  <td>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <ConfirmDeleteDialog title="حذف الإيراد" description="هل أنت متأكد من حذف هذا الإيراد؟" onConfirm={() => deleteRevenue(r.id)} />
                    </div>
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
