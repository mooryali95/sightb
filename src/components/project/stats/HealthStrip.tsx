/** The one-line health strip at the top of the project overview. */
import { Badge } from '@/components/ui/badge';
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, type Project, type EVMMetrics } from '@/types/project';

interface Props {
  project: Project;
  evm: EVMMetrics | null;
  currentMonth: number;
  daysRemaining: number | null;
  healthScore: { label: string; color: string; bg: string };
  openRisksCount: number;
}

export function HealthStrip({ project, evm, currentMonth, daysRemaining, healthScore, openRisksCount }: Props) {
  return (
    <>
  {/* شريط الحالة السريع */}
  <div className={`flex flex-wrap items-center gap-2 text-xs p-2.5 rounded-lg border mb-4 ${healthScore.bg}`}>
    <span className={`font-bold ${healthScore.color}`}>{healthScore.label}</span>
    <span className="text-muted-foreground">|</span>
    <Badge className={`text-xs ${PROJECT_STATUS_COLORS[project.status]}`}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
    <span className="text-muted-foreground">|</span>
    <span>الإنجاز {project.percentComplete}%</span>
    <span className="text-muted-foreground">|</span>
    <span>الشهر {currentMonth} من {project.durationMonths}</span>
    {daysRemaining !== null && (
      <>
        <span className="text-muted-foreground">|</span>
        <span className={daysRemaining < 30 ? 'text-destructive font-medium' : ''}>{daysRemaining} يوم متبقي</span>
      </>
    )}
    {evm && (
      <>
        <span className="text-muted-foreground">|</span>
        <span className={evm.cpi >= 1 ? 'health-good' : 'health-critical'}>CPI {evm.cpi.toFixed(2)}</span>
        <span className={evm.spi >= 1 ? 'health-good' : 'health-critical'}>SPI {evm.spi.toFixed(2)}</span>
      </>
    )}
    {openRisksCount > 0 && (
      <>
        <span className="text-muted-foreground">|</span>
        <span>{openRisksCount} خطر مفتوح</span>
      </>
    )}
  </div>
    </>
  );
}
