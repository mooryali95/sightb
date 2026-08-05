import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { calcVAT, addVAT, removeVAT, formatCurrency } from '@/lib/finance';
import { useStore } from '@/store/useStore';
import { useCoreData } from '@/hooks/useAppData';
import { useRole } from '@/hooks/useRole';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { projectSchema } from '@/lib/validations';
import { PROJECT_STATUS_LABELS, CONTRACT_TYPE_LABELS, type ProjectStatus, type ContractType } from '@/types/project';
import { cn } from '@/lib/utils';

export default function NewProject() {
  const [searchParams] = useSearchParams();
  const { companies, portfolios, addProject, loadAll } = useStore();
  const { isAdmin, canEdit } = useRole();
  const navigate = useNavigate();

  useCoreData();

  const [companyId, setCompanyId] = useState(searchParams.get('company') || '');
  const [portfolioId, setPortfolioId] = useState(searchParams.get('portfolio') || '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contractValue, setContractValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationMonths, setDurationMonths] = useState('4');
  const [resourceCount, setResourceCount] = useState('1');
  const [currency] = useState('ر.س');
  const [contractType, setContractType] = useState<ContractType>('lump_sum');
  const [retentionPercent, setRetentionPercent] = useState('0');
  const [loading, setLoading] = useState(false);
  const [taxPercent, setTaxPercent] = useState('15');
  const [vatInclusive, setVatInclusive] = useState(false);

  const editableCompanies = useMemo(() => companies.filter(c => isAdmin || canEdit('company', c.id)), [companies, isAdmin, canEdit]);
  const filteredPortfolios = portfolios.filter((p) => p.companyId === companyId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawValue = parseFloat(contractValue) || 0;
    const rate = parseFloat(taxPercent) || 15;
    const finalContractValue = vatInclusive ? removeVAT(rawValue, rate) : rawValue;

    const result = projectSchema.safeParse({
      name,
      companyId,
      portfolioId: portfolioId && portfolioId !== 'none' ? portfolioId : undefined,
      description: description || undefined,
      contractValue: finalContractValue,
      durationMonths: parseInt(durationMonths) || 4,
      resourceCount: parseInt(resourceCount) || 1,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    if (!result.success) {
      toast.error(result.error.errors[0]?.message || 'بيانات غير صالحة');
      return;
    }
    setLoading(true);
    try {
      await addProject({
        name: result.data.name,
        description: result.data.description,
        companyId: result.data.companyId,
        portfolioId: result.data.portfolioId,
        contractValue: result.data.contractValue,
        currency,
        startDate: result.data.startDate || new Date().toISOString().split('T')[0],
        endDate: result.data.endDate || '',
        durationMonths: result.data.durationMonths,
        resourceCount: result.data.resourceCount,
        status: 'planning',
        percentComplete: 0,
        contractType,
        retentionPercent: parseFloat(retentionPercent) || 0,
        managementReserve: 0,
        taxPercent: parseFloat(taxPercent) || 15,
        vatInclusive: false,
      });
      navigate('/');
    } catch (error: any) {
      console.error('[add-project]', error);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  const parsedValue = parseFloat(contractValue) || 0;
  const parsedTax = parseFloat(taxPercent) || 0;

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl">
        <div className="page-header">
          <h1 className="page-title flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-primary-foreground" />
            </div>
            إنشاء مشروع جديد
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="stat-card space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الشركة <span className="text-destructive">*</span></Label>
              <Select value={companyId} onValueChange={(v) => { setCompanyId(v); setPortfolioId(''); }}>
                <SelectTrigger><SelectValue placeholder="اختر الشركة" /></SelectTrigger>
                <SelectContent>
                  {editableCompanies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المحفظة <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
              <Select value={portfolioId} onValueChange={setPortfolioId} disabled={!companyId}>
                <SelectTrigger><SelectValue placeholder="بدون محفظة (مشروع مستقل)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون محفظة (مشروع مستقل)</SelectItem>
                  {filteredPortfolios.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>اسم المشروع</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مشروع الرواد — ألبانيا 2026" required />
          </div>
          <div className="space-y-2">
            <Label>وصف المشروع (اختياري)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف مختصر" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>قيمة العقد {vatInclusive ? '(شاملة الضريبة)' : '(بدون ضريبة)'} ({currency})</Label>
              <Input type="number" value={contractValue} onChange={(e) => setContractValue(e.target.value)} placeholder="230,000" required />
            </div>
            <div className="space-y-2">
              <Label>نوع العقد</Label>
              <Select value={contractType} onValueChange={(v) => setContractType(v as ContractType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTRACT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>نسبة المحتجزات %</Label>
              <Input type="number" value={retentionPercent} onChange={(e) => setRetentionPercent(e.target.value)} min="0" max="100" step="0.1" />
            </div>
            <div className="space-y-2">
              <Label>نسبة الضريبة (VAT) %</Label>
              <Input type="number" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} min="0" max="100" step="0.1" />
            </div>
          </div>

          {/* VAT inclusive/exclusive toggle */}
          {parsedTax > 0 && (
            <div className="space-y-3">
              <Label>القيمة المُدخلة</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVatInclusive(false)}
                  className={cn(
                    "flex-1 p-2 rounded-lg border text-xs text-center transition-colors",
                    !vatInclusive ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted/50"
                  )}
                >
                  بدون ضريبة
                </button>
                <button
                  type="button"
                  onClick={() => setVatInclusive(true)}
                  className={cn(
                    "flex-1 p-2 rounded-lg border text-xs text-center transition-colors",
                    vatInclusive ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted/50"
                  )}
                >
                  شاملة الضريبة
                </button>
              </div>

              {parsedValue > 0 && (
                <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">بدون ضريبة:</span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(vatInclusive ? removeVAT(parsedValue, parsedTax) : parsedValue)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الضريبة ({taxPercent}%):</span>
                    <span className="font-mono health-warning">
                      {formatCurrency(vatInclusive
                        ? parsedValue - removeVAT(parsedValue, parsedTax)
                        : calcVAT(parsedValue, parsedTax)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <span className="text-muted-foreground font-medium">شامل الضريبة:</span>
                    <span className="font-mono font-bold">
                      {formatCurrency(vatInclusive ? parsedValue : addVAT(parsedValue, parsedTax))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>مدة المشروع (أشهر)</Label>
              <Input type="number" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} min="1" />
            </div>
            <div className="space-y-2">
              <Label>عدد الموارد البشرية</Label>
              <Input type="number" value={resourceCount} onChange={(e) => setResourceCount(e.target.value)} min="1" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>تاريخ البداية</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ النهاية</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'جاري الإنشاء...' : 'إنشاء المشروع'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/')}>إلغاء</Button>
          </div>
        </form>
      </motion.div>
    </AppLayout>
  );
}
