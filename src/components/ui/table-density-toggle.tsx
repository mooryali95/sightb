import { Rows3, Rows4 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTableDensity } from "@/hooks/useTableDensity";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

/**
 * Compact / comfortable density switcher for `.data-table`.
 * Preference is global and persisted in localStorage.
 */
export function TableDensityToggle({ className }: Props) {
  const [density, setDensity] = useTableDensity();
  return (
    <ToggleGroup
      type="single"
      size="sm"
      value={density}
      onValueChange={(v) => v && setDensity(v as "comfortable" | "compact")}
      className={cn("border border-border/60 rounded-md", className)}
      aria-label="كثافة الجدول"
    >
      <ToggleGroupItem
        value="comfortable"
        aria-label="عرض مريح"
        title="عرض مريح"
        className="h-7 px-2"
      >
        <Rows3 className="h-3.5 w-3.5" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="compact"
        aria-label="عرض مضغوط"
        title="عرض مضغوط"
        className="h-7 px-2"
      >
        <Rows4 className="h-3.5 w-3.5" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
