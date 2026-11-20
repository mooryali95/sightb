/**
 * What the settings page offers each person. The audience of every tool
 * matches the side menu and the guard on the page it opens, so the settings
 * page never shows a door the role cannot walk through.
 */
export type AppRoleName = 'owner' | 'admin' | 'editor' | 'viewer';
export type Audience = 'everyone' | 'admin' | 'owner';
export type ToolKey = 'finance' | 'organize' | 'alerts' | 'security' | 'users' | 'controlCenter' | 'audit' | 'errors';

export interface Access { isAdmin: boolean; isOwner: boolean }

export interface Tool { key: ToolKey; label: string; description: string; path: string; audience: Audience }

export const TOOLS: Tool[] = [
  { key: 'finance', label: 'الشاشة المالية', description: 'مقارنة الشركات والمحافظ والمشاريع جنبًا إلى جنب.', path: '/finance', audience: 'everyone' },
  { key: 'alerts', label: 'مركز التنبيهات', description: 'ما يحتاج انتباهك في الموازنات والمصروفات.', path: '/alerts', audience: 'everyone' },
  { key: 'organize', label: 'هيكلة المشاريع', description: 'ترتيب المشاريع داخل الشركات والمحافظ.', path: '/organize', audience: 'everyone' },
  { key: 'security', label: 'الأمان', description: 'كلمة المرور ومفاتيح الدخول بالبصمة.', path: '/security', audience: 'everyone' },
  { key: 'users', label: 'إدارة المستخدمين', description: 'دعوة المستخدمين وتحديد أدوارهم ونطاقهم.', path: '/users', audience: 'admin' },
  { key: 'controlCenter', label: 'مركز الرقابة', description: 'مطابقة الأرقام وسلامة الترابط وسجل الإصلاحات.', path: '/control-center', audience: 'owner' },
  { key: 'audit', label: 'السجل الرئيسي', description: 'كل تغيير على البيانات: من ومتى وماذا.', path: '/audit', audience: 'owner' },
  { key: 'errors', label: 'سجل الأعطال', description: 'الأخطاء التي واجهها المستخدمون.', path: '/errors', audience: 'owner' },
];

export function canSee(audience: Audience, access: Access): boolean {
  if (audience === 'owner') return access.isOwner;
  if (audience === 'admin') return access.isAdmin || access.isOwner;
  return true;
}

export function visibleTools(access: Access): Tool[] {
  return TOOLS.filter((t) => canSee(t.audience, access));
}

export const AUDIENCE_LABELS: Record<Audience, string> = { everyone: 'للجميع', admin: 'للمدير', owner: 'للمالك' };

export const ROLE_LABELS: Record<AppRoleName, string> = { owner: 'مالك', admin: 'أدمن', editor: 'محرر', viewer: 'مشاهد' };
const RANK: AppRoleName[] = ['owner', 'admin', 'editor', 'viewer'];

/** The strongest role a person holds anywhere, or null when they hold none. */
export function strongestRole(roles: { role: string }[]): AppRoleName | null {
  return RANK.find((r) => roles.some((x) => x.role === r)) ?? null;
}

export interface Capability { label: string; roles: AppRoleName[] }

/** What each role may do, read top to bottom; a role holds every line it is named on. */
export const CAPABILITIES: Capability[] = [
  { label: 'عرض الأرقام والتقارير ضمن النطاق', roles: ['owner', 'admin', 'editor', 'viewer'] },
  { label: 'إضافة المصروفات والإيرادات وتعديلها', roles: ['owner', 'admin', 'editor'] },
  { label: 'إنشاء الشركات وأرشفتها', roles: ['owner', 'admin'] },
  { label: 'دعوة المستخدمين وتحديد أدوارهم', roles: ['owner', 'admin'] },
  { label: 'مركز الرقابة والسجلات', roles: ['owner'] },
];

export interface RoleLine { role: AppRoleName; label: string; scope: string }

/** Each role a person holds, with the company or project it covers named. */
export function describeRoles(
  roles: { role: string; scopeType: string; scopeId: string | null }[],
  names: { company: (id: string) => string | undefined; project: (id: string) => string | undefined },
): RoleLine[] {
  return roles
    .filter((r): r is typeof r & { role: AppRoleName } => (RANK as string[]).includes(r.role))
    .sort((a, b) => RANK.indexOf(a.role) - RANK.indexOf(b.role))
    .map((r) => {
      let scope = 'كل النظام';
      if (r.scopeType === 'company') scope = `شركة: ${(r.scopeId && names.company(r.scopeId)) || 'غير متاحة'}`;
      if (r.scopeType === 'project') scope = `مشروع: ${(r.scopeId && names.project(r.scopeId)) || 'غير متاح'}`;
      return { role: r.role, label: ROLE_LABELS[r.role], scope };
    });
}

/** Rules the system holds for everyone; shown for reference, not edited here. */
export const SYSTEM_POLICIES = [
  { label: 'انتهاء الجلسة', value: 'بعد 30 دقيقة دون نشاط' },
  { label: 'التحقق عند الدخول', value: 'رمز تحقق ثانٍ أو بصمة' },
  { label: 'الأرقام والتاريخ', value: 'أرقام إنجليزية وتقويم ميلادي' },
  { label: 'ضريبة القيمة المضافة', value: 'تُحسب عند العرض من نسبة المشروع' },
  { label: 'الحذف', value: 'أرشفة أولًا، مع تأكيد قبل الحذف النهائي' },
];
