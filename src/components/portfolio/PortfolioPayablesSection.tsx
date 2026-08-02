import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/finance';
import { useStore } from '@/store/useStore';
import {
  getProjectPayablesSummary,
  getVendorPayablesSummary,
} from '@/lib/resource-payables';
import type { Project } from '@/types/project';
import { Users, Store, Wallet, ArrowLeft } from 'lucide-react';

interface Props {
  projects: Project[];
}

const PENDING_STATUSES = ['submitted', 'under_review', 'approved', 'scheduled'];

/**
 * لوحة مستحقات المحفظة: لكل مشروع — مستحقات الفريق مقابل مستحقات الموردين
 * مقابل المدفوعات المتوقعة (طلبات صرف قيد التنفيذ) والمخالصات الموقّعة.
 */
export function PortfolioPayablesSection({ projects }: Props) {
  const navigate = useNavigate();
  const { resources, reimbursements, paymentRequests, resourceSettlements } = useStore();

  const rows = useMemo(() => projects.map((p) => {
    const projReimbs = reimbursements.filter((r) => r.projectId === p.id);
    const projReqs = paymentRequests.filter((q) => q.projectId === p.id);
    const projSettles = resourceSettlements.filter((s) => s.projectId === p.id);
    const res = getProjectPayablesSummary(p.id, resources, projReimbs, projReqs, projSettles);
    const ven = getVendorPayablesSummary(p.id, projReimbs);
    const expected = projReqs
      .filter((q) => PENDING_STATUSES.includes(q.status))
      .reduce((s, q) => s + q.amount, 0);
    const signedSettlements = projSettles.filter((s) => s.status === 'signed').length;
    return {
      project: p,
      resourceOutstanding: res.totalOutstandingAmount,
      resourcePaid: res.totalPaidAmount,
      vendorOutstanding: ven.totalOutstandingAmount,
      vendorPaid: ven.totalPaidAmount,
      expected,
      signedSettlements,
      openSettlements: projSettles.filter((s) => s.status === 'draft').length,
    };
  }), [projects, resources, reimbursements, paymentRequests, resourceSettlements]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    resourceOutstanding: acc.resourceOutstanding + r.resourceOutstanding,
    vendorOutstanding: acc.vendorOutstanding + r.vendorOutstanding,
    expected: acc.expected + r.expected,
    paid: acc.paid + r.resourcePaid + r.vendorPaid,
  }), { resourceOutstanding: 0, vendorOutstanding: 0, expected: 0, paid: 0 }), [rows]);

  if (projects.length === 0) return null;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Users className="h-4 w-4" /> مستحقات الفريق القائمة
          </div>
          <div className="text-2xl font-bold text-amber-600">{formatCurrency(totals.resourceOutstanding)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Store className="h-4 w-4" /> مستحقات الموردين القائمة
          </div>
          <div className="text-2xl font-bold text-amber-600">{formatCurrency(totals.vendorOutstanding)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Wallet className="h-4 w-4" /> مدفوعات متوقعة
          </div>
          <div className="text-2xl font-bold">{formatCurrency(totals.expected)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-muted-foreground text-sm mb-1">إجمالي المسدَّد</div>
          <div className="text-2xl font-bold text-emerald-600">{formatCurrency(totals.paid)}</div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3">المستحقات حسب المشروع</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-right py-2">المشروع</th>
                <th className="text-right py-2">فريق — قائم</th>
                <th className="text-right py-2">فريق — مدفوع</th>
                <th className="text-right py-2">موردون — قائم</th>
                <th className="text-right py-2">موردون — مدفوع</th>
                <th className="text-right py-2">مدفوعات متوقعة</th>
                <th className="text-right py-2">مخالصات</th>
                <th className="text-right py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.project.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 font-medium">{r.project.name}</td>
                  <td className="py-2 text-amber-600">{formatCurrency(r.resourceOutstanding)}</td>
                  <td className="py-2 text-emerald-600">{formatCurrency(r.resourcePaid)}</td>
                  <td className="py-2 text-amber-600">{formatCurrency(r.vendorOutstanding)}</td>
                  <td className="py-2 text-emerald-600">{formatCurrency(r.vendorPaid)}</td>
                  <td className="py-2">{formatCurrency(r.expected)}</td>
                  <td className="py-2">{r.signedSettlements} موقّعة / {r.openSettlements} مسودة</td>
                  <td className="py-2">
                    <Button size="sm" variant="ghost" onClick={() => navigate(`/project/${r.project.id}`)}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
