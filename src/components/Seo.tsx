import { Helmet } from 'react-helmet-async';
import { useLocation, matchPath } from 'react-router-dom';

const SITE_URL = 'https://sight.basserh.com';
const SITE_NAME = 'رؤية بصيرة';

interface Meta {
  title: string;
  description: string;
  noindex?: boolean;
}

const ROUTE_META: Array<{ path: string; meta: Meta }> = [
  {
    path: '/welcome',
    meta: {
      title: 'رؤية بصيرة — منصة إدارة المحافظ والمشاريع المالية',
      description:
        'منصة رؤية من بصيرة لإدارة المحافظ والمشاريع مالياً: الموازنات والعهد والمصروفات والإيرادات وتحليلات الأداء والربحية في مكان واحد.',
    },
  },
  {
    path: '/login',
    meta: {
      title: 'تسجيل الدخول — رؤية بصيرة',
      description:
        'سجّل الدخول إلى منصة رؤية بصيرة للوصول إلى لوحات المشاريع والموازنات والمصروفات وتقارير الأداء المالي الخاصة بمنشأتك.',
      noindex: true,
    },
  },
  {
    path: '/reset-password',
    meta: {
      title: 'استعادة كلمة المرور — رؤية بصيرة',
      description:
        'صفحة إعادة تعيين كلمة المرور لحسابك في منصة رؤية بصيرة لإدارة المحافظ والمشاريع المالية بشكل آمن.',
      noindex: true,
    },
  },
  {
    path: '/',
    meta: {
      title: 'لوحة التحكم — رؤية بصيرة',
      description:
        'لوحة تحكم رؤية بصيرة: نظرة شاملة على أداء المحافظ والمشاريع، الموازنة مقابل المصروف الفعلي، ومؤشرات صحة المشاريع.',
      noindex: true,
    },
  },
  {
    path: '/company/:id',
    meta: {
      title: 'تفاصيل الشركة — رؤية بصيرة',
      description:
        'عرض تفاصيل الشركة ومحافظها ومشاريعها المالية داخل منصة رؤية بصيرة لإدارة المشاريع والموازنات.',
      noindex: true,
    },
  },
  {
    path: '/portfolio/:id',
    meta: {
      title: 'تفاصيل المحفظة — رؤية بصيرة',
      description:
        'تحليل أداء المحفظة ومشاريعها: الموازنات والمصروفات والمستحقات ومؤشرات الربحية داخل منصة رؤية بصيرة.',
      noindex: true,
    },
  },
  {
    path: '/project/:id',
    meta: {
      title: 'تفاصيل المشروع — رؤية بصيرة',
      description:
        'متابعة المشروع مالياً: الموازنة والمخطط والفعلي والعهد والمصروفات وتحليلات القيمة المكتسبة في منصة رؤية بصيرة.',
      noindex: true,
    },
  },
  {
    path: '/alerts',
    meta: {
      title: 'مركز التنبيهات — رؤية بصيرة',
      description:
        'مركز تنبيهات رؤية بصيرة لمتابعة فجوات الصرف وتجاوزات الموازنة والتنبيهات المالية عبر جميع المشاريع.',
      noindex: true,
    },
  },
  {
    path: '/security',
    meta: {
      title: 'الأمان ومفاتيح المرور — رؤية بصيرة',
      description: 'إدارة مفاتيح المرور لحسابك في رؤية بصيرة: دخول بالبصمة دون كلمة مرور، وتحقق بخطوتين بلا رموز بريد.',
      noindex: true,
    },
  },
  {
    path: '/users',
    meta: {
      title: 'إدارة المستخدمين — رؤية بصيرة',
      description:
        'إدارة مستخدمي منصة رؤية بصيرة وصلاحياتهم على الشركات والمحافظ والمشاريع بشكل آمن ومنظم.',
      noindex: true,
    },
  },
  {
    path: '/errors',
    meta: {
      title: 'سجل الأعطال — رؤية بصيرة',
      description: 'الأخطاء التي واجهها مستخدمو منصة رؤية بصيرة، لمالك النظام.',
      noindex: true,
    },
  },
  {
    path: '/audit',
    meta: {
      title: 'سجل التدقيق — رؤية بصيرة',
      description:
        'سجل تدقيق كامل لكل العمليات المالية والإدارية داخل منصة رؤية بصيرة مع توثيق المستخدم والوقت.',
      noindex: true,
    },
  },
];

const FALLBACK: Meta = {
  title: 'رؤية بصيرة — إدارة المحافظ والمشاريع المالية',
  description:
    'منصة رؤية بصيرة لإدارة المحافظ والمشاريع مالياً: الموازنات والعهد والمصروفات والإيرادات وتقارير الأداء.',
  noindex: true,
};

/**
 * وسوم الرأس لكل مسار (title / description / canonical / og).
 * يُحقن مرة واحدة داخل الراوتر ويتبدّل تلقائياً مع تغيّر المسار.
 */
export function Seo() {
  const { pathname } = useLocation();
  const match = ROUTE_META.find((r) => matchPath({ path: r.path, end: true }, pathname));
  const meta = match?.meta ?? FALLBACK;
  const canonical = `${SITE_URL}${match ? pathname : '/welcome'}`;

  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={canonical} />
      {meta.noindex && <meta name="robots" content="noindex, follow" />}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
    </Helmet>
  );
}
