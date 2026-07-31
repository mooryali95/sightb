import {
  Users, Wallet, History, BarChart3, Receipt, PiggyBank, Baseline,
  Milestone as MilestoneIcon, FileEdit, AlertTriangle, DollarSign,
  FlaskConical, LayoutDashboard, Banknote, HandCoins, GitCompare, Info, Briefcase,
} from 'lucide-react';

export type TabGroup = 'summary' | 'planning' | 'finance' | 'tracking' | 'management' | 'ssot';

export type BadgeLevel = 'info' | 'warning' | 'critical';

export interface TabGroupDef {
  key: TabGroup;
  label: string;
  icon: typeof MilestoneIcon;
  defaultTab: string;
  badge: number;
  badgeLevel: BadgeLevel;
  badgeHint?: string;
}

export interface SubTabDef {
  value: string;
  label: string;
  icon: typeof MilestoneIcon;
}

interface BadgeInfo { count: number; level: BadgeLevel; hint?: string }
export interface TabBadges {
  planning: BadgeInfo;
  finance: BadgeInfo;
  tracking: BadgeInfo;
  management: BadgeInfo;
}

/** Top-level tab groups with their live badge counters. */
export function buildTabGroups(badges: TabBadges): TabGroupDef[] {
  return [
    { key: 'summary', label: 'الملخص', icon: LayoutDashboard, defaultTab: 'overview', badge: 0, badgeLevel: 'info' },
    { key: 'planning', label: 'التخطيط', icon: MilestoneIcon, defaultTab: 'milestones', badge: badges.planning.count, badgeLevel: badges.planning.level, badgeHint: badges.planning.hint },
    { key: 'finance', label: 'المالية', icon: PiggyBank, defaultTab: 'expenses', badge: badges.finance.count, badgeLevel: badges.finance.level, badgeHint: badges.finance.hint },
    { key: 'tracking', label: 'المتابعة', icon: BarChart3, defaultTab: 'charts', badge: badges.tracking.count, badgeLevel: badges.tracking.level, badgeHint: badges.tracking.hint },
    { key: 'management', label: 'الإدارة', icon: FileEdit, defaultTab: 'changeorders', badge: badges.management.count, badgeLevel: badges.management.level, badgeHint: badges.management.hint },
    { key: 'ssot', label: 'مصدر الحقيقة', icon: Info, defaultTab: 'ssot', badge: 0, badgeLevel: 'info' },
  ];
}

/**
 * Sub-tabs per group. Finance order follows best practice:
 * daily work first (expenses/revenue/cash), then commitments & payables,
 * and references (budget/baseline) last.
 */
export function buildSubTabs(isAdmin: boolean): Record<TabGroup, SubTabDef[]> {
  return {
    summary: [
      { value: 'overview', label: 'نظرة شاملة', icon: LayoutDashboard },
    ],
    planning: [
      { value: 'milestones', label: 'المراحل', icon: MilestoneIcon },
      { value: 'resources', label: 'الموارد', icon: Users },
    ],
    finance: [
      { value: 'expenses', label: 'المصروفات', icon: Receipt },
      { value: 'revenue', label: 'الإيرادات', icon: DollarSign },
      { value: 'funds', label: 'الدفعات', icon: Banknote },
      { value: 'custody', label: 'العهد', icon: Wallet },
      { value: 'payables', label: 'مستحقات الموارد', icon: HandCoins },
      { value: 'commitments', label: 'الالتزامات', icon: Briefcase },
      { value: 'budget', label: 'الموازنة', icon: PiggyBank },
      { value: 'baseline', label: 'خط الأساس', icon: Baseline },
    ],
    tracking: [
      { value: 'performance', label: 'مقارنة الأداء', icon: GitCompare },
      { value: 'charts', label: 'التحليلات', icon: BarChart3 },
      { value: 'whatif', label: 'ما-إذا', icon: FlaskConical },
    ],
    management: [
      { value: 'changeorders', label: 'أوامر التغيير', icon: FileEdit },
      { value: 'risks', label: 'المخاطر', icon: AlertTriangle },
      ...(isAdmin ? [{ value: 'auditlog', label: 'السجل', icon: History }] : []),
    ],
    ssot: [
      { value: 'ssot', label: 'تفسير الحسابات', icon: Info },
    ],
  };
}

/** Mobile FAB primary action per active group. */
export const FAB_ACTIONS: Partial<Record<TabGroup, { label: string; tab: string; group: TabGroup }>> = {
  finance: { label: 'إضافة مصروف', tab: 'expenses', group: 'finance' },
  planning: { label: 'إضافة مرحلة', tab: 'milestones', group: 'planning' },
  tracking: { label: 'تحليل ما-إذا', tab: 'whatif', group: 'tracking' },
  management: { label: 'إضافة خطر', tab: 'risks', group: 'management' },
};
