/**
 * «الفاتورة بعملة أخرى» in the expense form: the invoice's own amount and
 * currency, and the rate. The booked amount above stays in the project's
 * currency and is what the books read; these fields say how it was reached.
 * Give the invoice amount and the rate and the booked amount follows; change
 * the booked amount (what the bank actually took) and the rate follows.
 */
import { ArrowLeftRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FOREIGN_CURRENCIES } from '@/lib/finance/fx';

interface Props {
  on: boolean; onToggle: (on: boolean) => void;
  projectCurrency: string;
  currency: string; onCurrency: (code: string) => void;
  original: string; onOriginal: (value: string) => void;
  rate: string; onRate: (value: string) => void;
}

export function ForeignInvoiceFields({ on, onToggle, projectCurrency, currency, onCurrency, original, onOriginal, rate, onRate }: Props) {
  const choices = FOREIGN_CURRENCIES.filter((c) => c.code !== projectCurrency);
  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox id="foreign-invoice" checked={on} onCheckedChange={(v) => onToggle(v === true)} />
        <Label htmlFor="foreign-invoice" className="flex cursor-pointer items-center gap-1.5 text-sm">
          <ArrowLeftRight className="h-3.5 w-3.5 text-accent" aria-hidden />الفاتورة بعملة أخرى
        </Label>
      </div>
      {on && (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="fx-currency">عملة الفاتورة</Label>
              <Select value={currency} onValueChange={onCurrency}>
                <SelectTrigger id="fx-currency"><SelectValue placeholder="اختر العملة" /></SelectTrigger>
                <SelectContent>
                  {choices.map((c) => <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fx-original">مبلغ الفاتورة بعملتها</Label>
              <Input id="fx-original" type="number" inputMode="decimal" min="0" value={original} onChange={(e) => onOriginal(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fx-rate">سعر الصرف</Label>
              <Input id="fx-rate" type="number" inputMode="decimal" min="0" step="any" value={rate} onChange={(e) => onRate(e.target.value)} placeholder="مثال: 3.75" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            سعر الصرف: كم {projectCurrency} تساوي الوحدة من عملة الفاتورة. أدخله فيُحسب «المبلغ» أعلاه، أو أدخل «المبلغ» الذي خُصم فعلاً فيُحسب السعر.
            الحسابات كلها تبقى بعملة المشروع.
          </p>
        </>
      )}
    </div>
  );
}
