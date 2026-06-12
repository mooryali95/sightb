import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * InspectorPanel — Slide-over panel for record details / drill-down.
 * Use instead of heavy Dialogs so users keep context with the underlying table.
 *
 * Width tiers: sm (380px), md (480px), lg (640px), xl (820px).
 */
export interface InspectorPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Pill/badge area shown on the right of the title (e.g. status) */
  meta?: React.ReactNode;
  /** Sticky footer (typically primary actions) */
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  className?: string;
}

const widthClasses: Record<NonNullable<InspectorPanelProps["width"]>, string> = {
  sm: "w-full sm:max-w-[380px]",
  md: "w-full sm:max-w-[480px]",
  lg: "w-full sm:max-w-[640px]",
  xl: "w-full sm:max-w-[820px]",
};

export function InspectorPanel({
  open,
  onOpenChange,
  title,
  description,
  meta,
  footer,
  width = "md",
  children,
  className,
}: InspectorPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className={cn(
          widthClasses[width],
          "p-0 flex flex-col gap-0 bg-card",
          className,
        )}
      >
        <SheetHeader className="px-5 py-4 border-b border-border space-y-1.5 text-right">
          <div className="flex items-start justify-between gap-3">
            <SheetTitle className="text-base font-semibold leading-snug">
              {title}
            </SheetTitle>
            {meta && <div className="shrink-0 flex items-center gap-1.5">{meta}</div>}
          </div>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground leading-relaxed">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {children}
        </div>

        {footer && (
          <div className="px-5 py-3 border-t border-border bg-muted/40 flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---------- Helper presentational sub-components ---------- */

export function InspectorSection({
  title,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between">
          {title && (
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function InspectorField({
  label,
  value,
  mono,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Use tabular-nums for numeric values */
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-medium text-foreground text-left",
          mono && "tabular-nums",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function InspectorKpiStrip({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode; tone?: "default" | "success" | "warning" | "destructive" | "info" }>;
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    info: "text-info",
  };
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {items.map((it, i) => (
        <div key={i} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
            {it.label}
          </div>
          <div className={cn("text-sm font-semibold tabular-nums", tones[it.tone ?? "default"])}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}
