import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import {
  Risk, RISK_PROBABILITY_LABELS, RISK_IMPACT_LABELS, RISK_CATEGORY_LABELS,
  RISK_STATUS_LABELS, RISK_PROBABILITY_COLORS, RISK_IMPACT_COLORS, RISK_STATUS_COLORS,
  type RiskProbability, type RiskImpact, type RiskCategory, type RiskStatus,
} from '@/types/project';
import { formatCurrency } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { Plus, AlertTriangle, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface RisksSectionProps {
  projectId?: string;
  portfolioId?: string;
  risks: Risk[];
  readOnly?: boolean;
}

export function RisksSection({ projectId, portfolioId, risks, readOnly = false }: RisksSectionProps) {
  const { addRisk, updateRisk, deleteRisk } = useStore();
  const [open, setOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [probability, setProbability] = useState<RiskProbability>('medium');
  const [impact, setImpact] = useState<RiskImpact>('medium');
  const [financialImpact, setFinancialImpact] = useState('0');
  const [category, setCategory] = useState<RiskCategory>('financial');
  const [status, setStatus] = useState<RiskStatus>('open');
  const [mitigationPlan, setMitigationPlan] = useState('');
  const [owner, setOwner] = useState('');

  const openRisks = risks.filter(r => r.status === 'open' || r.status === 'mitigating');
  const totalExposure = openRisks.reduce((s, r) => s + r.financialImpact, 0);

  const resetForm = () => {
    setTitle(''); setDescription(''); setProbability('medium'); setImpact('medium');
    setFinancialImpact('0'); setCategory('financial'); setStatus('open');
    setMitigationPlan(''); setOwner(''); setEditingRisk(null);
  };

  const openEdit = (risk: Risk) => {
    setEditingRisk(risk);
    setTitle(risk.title); setDescription(risk.description || '');
    setProbability(risk.probability); setImpact(risk.impact);
    setFinancialImpact(String(risk.financialImpact)); setCategory(risk.category);
    setStatus(risk.status); setMitigationPlan(risk.mitigationPlan || '');
    setOwner(risk.owner || '');
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('العنوان مطلوب'); return; }
    try {
      if (editingRisk) {
        await updateRisk(editingRisk.id, {
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
      resetForm(); setOpen(false);
    } catch (e: any) {
      console.error('[updateRisk]', e);
      toast.error(e.message || 'حدث خطأ عند تحديث الخطر');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRisk(id);
      toast.success('تم حذف الخطر');
    } catch { toast.error('فشل الحذف'); }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="stat-card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">مخاطر مفتوحة</p>
            <p className="text-lg font-bold">{openRisks.length}</p>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">إجمالي التعرض المالي</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalExposure)}</p>
          </div>
        </div>
      </div>

      {/* Add button */}
      {!readOnly && (
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); setOpen(v); }}>
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1"><Plus className="w-3.5 h-3.5" />إضافة خطر</Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingRisk ? 'تعديل الخطر' : 'إضافة خطر جديد'}</DialogTitle></DialogHeader>
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
                <Input type="number" value={financialImpact} onChange={e => setFinancialImpact(e.target.value)} />
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
            <Button onClick={handleSubmit} className="w-full">{editingRisk ? 'تحديث' : 'إضافة'}</Button>
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Table */}
      {risks.length > 0 && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>العنوان</th>
                <th>الاحتمال</th>
                <th>الأثر</th>
                <th>الأثر المالي</th>
                <th>الفئة</th>
                <th>الحالة</th>
                <th className="hidden sm:table-cell">المسؤول</th>
                {!readOnly && <th></th>}
              </tr>
            </thead>
            <tbody>
              {risks.map(risk => (
                <tr key={risk.id}>
                  <td className="font-medium">{risk.title}</td>
                  <td><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${RISK_PROBABILITY_COLORS[risk.probability]}`}>{RISK_PROBABILITY_LABELS[risk.probability]}</span></td>
                  <td><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${RISK_IMPACT_COLORS[risk.impact]}`}>{RISK_IMPACT_LABELS[risk.impact]}</span></td>
                  <td className="font-mono text-sm">{formatCurrency(risk.financialImpact)}</td>
                  <td className="text-xs text-muted-foreground">{RISK_CATEGORY_LABELS[risk.category]}</td>
                  <td><span className={`text-[10px] px-1.5 py-0.5 rounded-full ${RISK_STATUS_COLORS[risk.status]}`}>{RISK_STATUS_LABELS[risk.status]}</span></td>
                  <td className="hidden sm:table-cell text-xs text-muted-foreground">{risk.owner || '-'}</td>
                  {!readOnly && (
                  <td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => openEdit(risk)}>تعديل</Button>
                      <ConfirmDeleteDialog onConfirm={() => handleDelete(risk.id)} title="حذف الخطر" description={`هل أنت متأكد من حذف "${risk.title}"؟`} />
                    </div>
                  </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {risks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">لا توجد مخاطر مسجلة</div>
      )}
    </div>
  );
}
