import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/AppLayout';

/**
 * Skeleton placeholder that mirrors the Dashboard layout while data loads.
 * Provides a perceived-performance boost (Material Design 3 / Nielsen #1).
 */
export function DashboardSkeleton() {
  return (
    <AppLayout>
      {/* Page header */}
      <div className="page-header flex items-center justify-between gap-4 mb-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>

      {/* Filters bar */}
      <Skeleton className="h-20 w-full rounded-xl mb-6" />

      {/* Stat cards (4 placeholders) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>

      {/* Two-column charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>

      {/* Table */}
      <div className="stat-card p-4">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="space-y-3">
          <div className="grid grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, row) => (
            <div key={row} className="grid grid-cols-6 gap-3 pt-2 border-t border-border/50">
              {Array.from({ length: 6 }).map((_, col) => (
                <Skeleton key={col} className="h-4 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
