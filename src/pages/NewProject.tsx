import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { Briefcase } from 'lucide-react';
import { toast } from 'sonner';

export default function NewProject() {
  const [searchParams] = useSearchParams();
  const { companies, portfolios, addProject, loadAll } = useStore();
  const navigate = useNavigate();

  useEffect(() => { loadAll(); }, []);

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
  const [loading, setLoading] = useState(false);

  const filteredPortfolios = portfolios.filter((p) => p.companyId === companyId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !companyId || !contractValue) return;
    setLoading(true);
    try {
      await addProject({
        name: name.trim(),
        description: description.trim() || undefined,
        companyId,
        portfolioId: portfolioId || undefined,
        contractValue: parseFloat(contractValue),
        currency,
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: endDate || '',
        durationMonths: parseInt(durationMonths) || 4,
        resourceCount: parseInt(resourceCount) || 1,
        status: 'active',
      });
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  };

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
                  {companies.map((c) => (
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
              <Label>قيمة العقد ({currency})</Label>
              <Input type="number" value={contractValue} onChange={(e) => setContractValue(e.target.value)} placeholder="230,000" required />
            </div>
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
