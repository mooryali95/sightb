/**
 * The review step: the picture (if any), the OCR confidence line, and the
 * form the expense is saved from. The page owns the values; this component
 * reports each change and nothing else.
 */
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory, type Project, type ProjectFund } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Sparkles, X } from 'lucide-react';
import type { ExtractedReceipt, ReceiptForm } from './receiptForm';

interface Props {
  form: ReceiptForm;
  onChange: (patch: Partial<ReceiptForm>) => void;
  projects: Project[];
  activeFund: ProjectFund | null | undefined;
  fundRemaining: number;
  extracted: ExtractedReceipt | null;
  imagePreview: string;
  onClearImage: () => void;
}

export function ReviewForm({ form, onChange, projects: activeProjects, activeFund, fundRemaining, extracted, imagePreview, onClearImage }: Props) {
  return (
    <>
      {imagePreview && (
        <Card className="p-2 relative">
          <img src={imagePreview} alt="الفاتورة" className="w-full max-h-40 object-contain rounded" />
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-1 start-1 h-7 w-7 bg-background/80"
            aria-label="إزالة الصورة"
            onClick={onClearImage}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </Card>
      )}

      {extracted && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">
            تم الاستخراج بدقة {Math.round(extracted.confidence * 100)}% — راجع البيانات
          </span>
        </div>
      )}

      <Card className="p-4 space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">المشروع *</Label>
          <Select value={form.projectId} onValueChange={(v) => onChange({ projectId: v })}>
            <SelectTrigger className="h-12"><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
            <SelectContent>
              {activeProjects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.projectId && activeFund && (
            <p className="text-xs text-muted-foreground">
              الدفعة #{activeFund.fundNumber} — متبقي: {fundRemaining.toLocaleString('en-US')} ر.س
            </p>
          )}
          {form.projectId && !activeFund && (
            <p className="text-xs health-warning">
              ⚠️ لا توجد دفعة نشطة — لن يتم ربط المصروف بدفعة
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm">الوصف *</Label>
          <Input
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="مثال: قرطاسية للمكتب"
            className="h-12"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-sm">المبلغ *</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
              placeholder="0.00"
              className="h-12 text-lg font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">التاريخ</Label>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => onChange({ date: e.target.value })}
              className="h-12"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">الفئة</Label>
          <Select value={form.category} onValueChange={(v) => onChange({ category: v as ExpenseCategory })}>
            <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-sm">المورد</Label>
            <Input
              value={form.vendor}
              onChange={(e) => onChange({ vendor: e.target.value })}
              placeholder="اختياري"
              className="h-12"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">رقم الفاتورة</Label>
            <Input
              value={form.invoiceRef}
              onChange={(e) => onChange({ invoiceRef: e.target.value })}
              placeholder="اختياري"
              className="h-12"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isVatInclusive}
              onChange={(e) => onChange({ isVatInclusive: e.target.checked })}
              disabled={form.isVatExempt}
              className="h-4 w-4"
            />
            المبلغ شامل ضريبة القيمة المضافة
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isVatExempt}
              onChange={(e) => onChange({ isVatExempt: e.target.checked })}
              className="h-4 w-4"
            />
            معفى من الضريبة
          </label>
        </div>

        {extracted?.line_items && extracted.line_items.length > 0 && (
          <div className="space-y-1 text-xs">
            <Label className="text-xs text-muted-foreground">بنود الفاتورة المستخرجة</Label>
            <div className="space-y-1 bg-muted/30 rounded p-2">
              {extracted.line_items.slice(0, 5).map((it, i) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate">{it.description}</span>
                  <span className="font-mono">{it.amount.toLocaleString('en-US')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
