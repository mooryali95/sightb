import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion } from 'framer-motion';
import { FolderKanban } from 'lucide-react';
import { toast } from 'sonner';
import { portfolioSchema } from '@/lib/validations';

export default function NewPortfolio() {
  const [searchParams] = useSearchParams();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [companyId, setCompanyId] = useState(searchParams.get('company') || '');
  const [loading, setLoading] = useState(false);
  const { companies, addPortfolio, loadAll } = useStore();
  const { isAdmin, canEdit } = useRole();
  const navigate = useNavigate();

  useEffect(() => { loadAll(); }, []);

  const editableCompanies = useMemo(() => companies.filter(c => isAdmin || canEdit('company', c.id)), [companies, isAdmin, canEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = portfolioSchema.safeParse({ name, companyId, description: description || undefined });
    if (!result.success) {
      toast.error(result.error.errors[0]?.message || 'بيانات غير صالحة');
      return;
    }
    setLoading(true);
    try {
      await addPortfolio({ name: result.data.name, companyId: result.data.companyId, description: result.data.description, targetRevenue: 0, targetMargin: 0 });
      navigate('/');
    } catch (error: any) {
      console.error('[add-portfolio]', error);
      toast.error('حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg">
        <div className="page-header">
          <h1 className="page-title flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-gold flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-primary-foreground" />
            </div>
            إضافة محفظة جديدة
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="stat-card space-y-5">
          <div className="space-y-2">
            <Label>الشركة</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger><SelectValue placeholder="اختر الشركة" /></SelectTrigger>
              <SelectContent>
                {editableCompanies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>اسم المحفظة</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مشاريع التطوير التربوي" required />
          </div>
          <div className="space-y-2">
            <Label>الوصف (اختياري)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف المحفظة" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'جاري الإضافة...' : 'إضافة المحفظة'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/')}>إلغاء</Button>
          </div>
        </form>
      </motion.div>
    </AppLayout>
  );
}
