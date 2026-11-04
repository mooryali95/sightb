import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

/**
 * The bar fills in the reading direction (from the right in Arabic) and
 * reports its value to assistive technology. A bar without a label of its own
 * is announced as «نسبة التقدم»; pass `aria-label` to say what it measures.
 */
const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, max = 100, ...props }, ref) => {
  const clamped = Math.min(Math.max(Number.isFinite(value) ? Number(value) : 0, 0), max);
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={clamped}
      max={max}
      aria-label={props["aria-labelledby"] ? undefined : "نسبة التقدم"}
      className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-primary origin-left rtl:origin-right transition-transform"
        style={{ transform: `scaleX(${clamped / max})` }}
      />
    </ProgressPrimitive.Root>
  );
});
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
