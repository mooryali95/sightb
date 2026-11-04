/**
 * The vendor payables ledger: what vendors paid on the project's behalf and
 * are still owed. Recording and settling live in the two dialogs under
 * vendor/; the panel lists, totals, and says who may write.
 */
import { useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { useRole } from '@/hooks/useRole';
import { useDialogSession } from '@/hooks/useDialogSession';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Wallet, CheckCircle } from 'lucide-react';
import type { ResourceReimbursement } from '@/types/project';
import { RecordVendorPayableDialog } from './vendor/RecordVendorPayableDialog';
import { SettleVendorPayableDialog } from './vendor/SettleVendorPayableDialog';

interface Props {
  projectId: string;
  readOnly?: boolean;
}

export function VendorPayablesPanel({ projectId, readOnly }: Props) {
  const { canEdit: canEditFn } = useRole();
  const canEdit = !readOnly && canEditFn('project', projectId);

  const reimbursements = useStore((s) => s.reimbursements);

  const vendorPayables = useMemo(
    () => (reimbursements || []).filter(
      (r) => r.projectId === projectId && r.sourceKind === 'vendor',
    ),
    [reimbursements, projectId],
  );

  // Both dialogs start fresh on open: the record form is remounted through
  // a dialog session, and the settle dialog is mounted only while settling.
  const record = useDialogSession<true>();
  const [settling, setSettling] = useState<ResourceReimbursement | null>(null);

  // Settled is the ledger's word (status), not only the expense link one
  // path of settling leaves behind.
  const isSettled = (p: ResourceReimbursement) => p.status === 'reimbursed' || !!p.settledExpenseId;
  const totalOutstanding = vendorPayables
    .filter((p) => !isSettled(p))
    .reduce((s, p) => s + Number(p.amount), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          ذمم المورّدين (دفعوا نيابة عن المشروع)
          {totalOutstanding > 0 && (
            <Badge variant="destructive">مستحق: {totalOutstanding.toLocaleString('en-US')}</Badge>
          )}
        </CardTitle>
        {canEdit && (
          <RecordVendorPayableDialog
            key={record.session}
            open={record.value !== null}
            onOpenChange={(v) => { if (!v) record.close(); }}
            onRequestOpen={() => record.open(true)}
            projectId={projectId}
          />
        )}
      </CardHeader>

      <CardContent>
        {vendorPayables.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد ذمم مورّدين مسجّلة.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المورد</TableHead>
                <TableHead>الوصف</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-end">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendorPayables.map((p) => {
                const settled = isSettled(p);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.vendorName}</TableCell>
                    <TableCell>{p.description}</TableCell>
                    <TableCell>{Number(p.amount).toLocaleString('en-US')}</TableCell>
                    <TableCell>{p.expenseDate}</TableCell>
                    <TableCell>
                      {settled
                        ? <Badge variant="secondary"><CheckCircle className="h-3 w-3 me-1" /> مسدّدة</Badge>
                        : <Badge variant="destructive">مستحقة</Badge>}
                    </TableCell>
                    <TableCell className="text-end">
                      {!settled && canEdit && (
                        <Button size="sm" variant="outline" onClick={() => setSettling(p)}>سداد</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {settling && (
        <SettleVendorPayableDialog payable={settling} projectId={projectId} onClose={() => setSettling(null)} />
      )}
    </Card>
  );
}
