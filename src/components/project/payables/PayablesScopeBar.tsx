/**
 * The ledger switch, and the export that spans both ledgers.
 *
 * Presentational on purpose: it owns no state and reaches no store, so which
 * ledger is showing stays a single fact held by the section above it. The
 * counts are passed in rather than derived here, because deriving them twice
 * is how the two ledgers drifted apart in the first place.
 */
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PayablesScope } from './usePayablesScope';

interface Props {
  scope: PayablesScope;
  onScopeChange: (scope: PayablesScope) => void;
  resourceCount: number;
  vendorCount: number;
  onExportCsv: () => void;
}

export function PayablesScopeBar({
  scope, onScopeChange, resourceCount, vendorCount, onExportCsv,
}: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex rounded-lg border p-1 bg-muted/40">
        <button
          type="button"
          onClick={() => onScopeChange('resource')}
          className={cn(
            'px-3 py-1.5 text-sm rounded-md transition-colors',
            scope === 'resource' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground',
          )}
        >
          مستحقات الفريق ({resourceCount})
        </button>
        <button
          type="button"
          onClick={() => onScopeChange('vendor')}
          className={cn(
            'px-3 py-1.5 text-sm rounded-md transition-colors',
            scope === 'vendor' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground',
          )}
        >
          مستحقات الموردين ({vendorCount})
        </button>
      </div>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={onExportCsv}>
        <Download className="h-4 w-4" /> تصدير CSV (فريق + موردون)
      </Button>
    </div>
  );
}
