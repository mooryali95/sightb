import { cn } from '@/lib/utils';
import { Filter, Search, X, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PROJECT_STATUS_LABELS } from '@/types/project';

interface Company { id: string; name: string; }

const ACTIVE_STATUSES = ['planning', 'pending_approval', 'approved', 'active', 'on-hold'] as const;
const INACTIVE_STATUSES = ['completed', 'archived', 'cancelled'] as const;

interface DashboardFiltersProps {
  companies: Company[];
  filterCompany: string;
  setFilterCompany: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  timePeriod: string;
  setTimePeriod: (v: string) => void;
  hasActiveFilters: boolean;
  clearFilters: () => void;
  filteredCount: number;
  totalCount: number;
  isMobile: boolean;
  filtersOpen: boolean;
  setFiltersOpen: (v: boolean) => void;
  showInactive: boolean;
  setShowInactive: (v: boolean) => void;
}

export function DashboardFilters({
  companies, filterCompany, setFilterCompany, filterStatus, setFilterStatus,
  searchQuery, setSearchQuery, timePeriod, setTimePeriod,
  hasActiveFilters, clearFilters, filteredCount, totalCount,
  isMobile, filtersOpen, setFiltersOpen,
  showInactive, setShowInactive,
}: DashboardFiltersProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="filter-bar"
    >
      <Collapsible open={!isMobile || filtersOpen} onOpenChange={setFiltersOpen}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground shrink-0">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-semibold">تصفية</span>
            {hasActiveFilters && (
              <span className="text-xs bg-primary/15 text-primary rounded-full px-1.5 py-0.5 font-medium">
                {[filterCompany !== 'all', filterStatus !== 'all', searchQuery !== '', timePeriod !== 'all', showInactive].filter(Boolean).length}
              </span>
            )}
          </div>
          <CollapsibleTrigger asChild className="md:hidden">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="تبديل التصفية">
              <ChevronDown className={cn('w-4 h-4 transition-transform', filtersOpen && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent className="mt-3 md:!block space-y-3">
          {/* Row 1: Search + Show inactive + Clear */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-9 h-9 text-sm"
                aria-label="بحث عن المشاريع"
              />
            </div>

            <Button
              variant={showInactive ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowInactive(!showInactive)}
              className={cn('gap-1.5 text-xs shrink-0 h-9 w-full sm:w-auto justify-center', showInactive && 'bg-muted-foreground/20 text-foreground hover:bg-muted-foreground/30')}
              title={showInactive ? 'إخفاء المشاريع المنتهية' : 'عرض المشاريع المنتهية والمؤرشفة'}
            >
              {showInactive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showInactive ? 'إخفاء المنتهية' : 'عرض المنتهية'}
            </Button>

            <AnimatePresence>
              {hasActiveFilters && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs shrink-0 h-9 w-full sm:w-auto justify-center">
                    <X className="w-3.5 h-3.5" />
                    مسح
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Row 2: Company + Status + Time period */}
          <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full">
            <Select value={filterCompany} onValueChange={setFilterCompany}>
              <SelectTrigger className="w-full sm:flex-1 h-9 text-sm">
                <SelectValue placeholder="جميع الشركات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الشركات</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={(v) => {
              setFilterStatus(v);
              if (INACTIVE_STATUSES.includes(v as any)) {
                setShowInactive(true);
              }
            }}>
              <SelectTrigger className="w-full sm:flex-1 h-9 text-sm">
                <SelectValue placeholder="جميع الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">نشطة</div>
                {ACTIVE_STATUSES.map((key) => (
                  <SelectItem key={key} value={key}>{PROJECT_STATUS_LABELS[key]}</SelectItem>
                ))}
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground border-t border-border mt-1 pt-1">منتهية</div>
                {INACTIVE_STATUSES.map((key) => (
                  <SelectItem key={key} value={key}>{PROJECT_STATUS_LABELS[key]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={timePeriod} onValueChange={setTimePeriod}>
              <SelectTrigger className="w-full sm:flex-1 h-9 text-sm">
                <SelectValue placeholder="كل الفترات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفترات</SelectItem>
                <SelectItem value="month">هذا الشهر</SelectItem>
                <SelectItem value="quarter">هذا الربع</SelectItem>
                <SelectItem value="year">هذه السنة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {hasActiveFilters && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-muted-foreground mt-2"
        >
          عرض {filteredCount} من {totalCount} مشروع
          {!showInactive && filterStatus === 'all' && (
            <span className="text-muted-foreground/70"> (المشاريع النشطة فقط)</span>
          )}
        </motion.p>
      )}
    </motion.div>
  );
}
