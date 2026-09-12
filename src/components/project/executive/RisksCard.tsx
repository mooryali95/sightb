/** The open risks, the high ones, their exposure, and the reserve verdict. */
import { Shield, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import type { Risk } from '@/types/project';
import { SectionCard, SectionTitle } from './SectionCard';

export function RisksCard({ risks, managementReserve }: { risks: Risk[]; managementReserve: number }) {
  const openRisks = risks.filter(r => r.status === 'open' || r.status === 'mitigating');
  const highRisks = openRisks.filter(r => r.impact === 'high' || r.impact === 'very_high');
  const riskExposure = openRisks.reduce((s, r) => s + r.financialImpact, 0);
  return (
    <SectionCard>
      <SectionTitle icon={Shield}>المخاطر</SectionTitle>
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center p-2 rounded-lg bg-muted/40">
          <p className="text-lg font-bold">{openRisks.length}</p>
          <p className="text-xs text-muted-foreground">مفتوحة</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/40">
          <p className="text-lg font-bold text-destructive">{highRisks.length}</p>
          <p className="text-xs text-muted-foreground">عالية</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-muted/40">
          <p className="text-sm font-mono font-bold">{formatCurrency(riskExposure)}</p>
          <p className="text-xs text-muted-foreground">التعرض</p>
        </div>
      </div>
      {highRisks.slice(0, 3).map(r => (
        <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-t border-border">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-destructive" />
            <span>{r.title}</span>
          </div>
          <span className="font-mono text-muted-foreground">{formatCurrency(r.financialImpact)}</span>
        </div>
      ))}
      {managementReserve > 0 && (
        <div className="mt-2 p-2 rounded-lg bg-muted/40 text-xs flex items-center justify-between">
          <span>الاحتياطي: {formatCurrency(managementReserve)}</span>
          <span className={riskExposure > managementReserve ? 'text-destructive' : 'text-emerald-600'}>
            {riskExposure > managementReserve ? '⚠️ التعرض يتجاوز الاحتياطي' : '✓ كافٍ'}
          </span>
        </div>
      )}
    </SectionCard>
  );
}
