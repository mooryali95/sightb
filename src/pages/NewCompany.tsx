import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function NewCompany() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const { addCompany } = useStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await addCompany({ name: name.trim(), description: description.trim() || undefined });
      navigate('/');
    } catch (error: any) {
      console.error('[add-company]', error);
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
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            إضافة شركة جديدة
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="stat-card space-y-5">
          <div className="space-y-2">
            <Label>اسم الشركة</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: شركة راز للاستشارات" required />
          </div>
          <div className="space-y-2">
            <Label>الوصف (اختياري)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف مختصر عن الشركة" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'جاري الإضافة...' : 'إضافة الشركة'}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/')}>إلغاء</Button>
          </div>
        </form>
      </motion.div>
    </AppLayout>
  );
}
