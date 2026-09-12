/** One end of the month range. */
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

export function MonthSelect({
  value, onChange, durationMonths, placeholder,
}: { value: number; onChange: (v: number) => void; durationMonths: number; placeholder: string }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-9 w-[110px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: durationMonths }, (_, i) => i + 1).map(m => (
          <SelectItem key={m} value={String(m)} className="text-xs">الشهر {m}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
