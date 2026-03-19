import { useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { BarChart3, Shield, TrendingUp, FolderKanban, ArrowLeft, ExternalLink } from 'lucide-react';
import basserhLogo from '@/assets/basserh-logo.webp';
import { useAuth } from '@/hooks/useAuth';

const features = [
  {
    icon: <FolderKanban className="w-6 h-6" />,
    title: 'إدارة المحافظ والمشاريع',
    description: 'تنظيم الشركات والمحافظ والمشاريع في هيكل تكاملي مرن',
  },
  {
    icon: <TrendingUp className="w-6 h-6" />,
    title: 'تتبع الربحية والمصروفات',
    description: 'مراقبة الموازنة والمصروفات والإيرادات والربحية في الوقت الحقيقي',
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: 'تحليلات ورؤى مالية',
    description: 'رسوم بيانية وتقارير شاملة لدعم اتخاذ القرار',
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: 'أمان وصلاحيات متقدمة',
    description: 'نظام صلاحيات متعدد المستويات مع سجل مراجعة كامل',
  },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--navy))] to-[hsl(var(--navy-light))]" />
        <div className="relative max-w-5xl mx-auto px-6 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <img
              src={basserhLogo}
              alt="بصيرة"
              width={80}
              height={80}
              fetchPriority="high"
              className="w-20 h-20 rounded-2xl object-cover mx-auto mb-6 shadow-xl border-2 border-[hsl(var(--gold)/0.3)]"
            />
            <h1 className="text-4xl sm:text-5xl font-bold text-[hsl(var(--gold-light))] mb-4">
              رؤية
            </h1>
            <p className="text-lg sm:text-xl text-[hsl(var(--sidebar-foreground))] max-w-2xl mx-auto mb-3">
              نظام إدارة المحافظ والمشاريع المالية
            </p>
            <p className="text-sm text-[hsl(var(--sidebar-foreground)/0.7)] max-w-lg mx-auto mb-8">
              منصة متكاملة لتتبع الميزانيات والمصروفات والإيرادات وإدارة المخاطر — مصممة لشركة بصيرة والشركات التابعة
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={() => navigate('/login')}
                className="gap-2 px-8 text-base"
              >
                <ArrowLeft className="w-4 h-4" />
                تسجيل الدخول
              </Button>
              <a
                href="https://basserh.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-[hsl(var(--gold-light))] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                زيارة موقع بصيرة
              </a>
            </div>
          </motion.div>
        </div>
      </header>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-2xl font-bold text-center mb-10"
        >
          المزايا الرئيسية
        </motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="stat-card flex gap-4"
            >
              <div className="w-12 h-12 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                {feature.icon}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 pb-16">
        <div className="stat-card text-center py-10 border-primary/20">
          <h3 className="text-lg font-bold mb-2">هل لديك دعوة للانضمام؟</h3>
          <p className="text-sm text-muted-foreground mb-6">
            يتم الوصول إلى النظام عبر دعوة من مدير النظام فقط. إذا تلقيت دعوة، يمكنك تسجيل الدخول مباشرة.
          </p>
          <Button onClick={() => navigate('/login')} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            تسجيل الدخول
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} بصيرة — جميع الحقوق محفوظة
        </p>
      </footer>
    </div>
  );
}
