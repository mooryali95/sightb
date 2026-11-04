import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * PageHeader — unified page-level title bar.
 * Use at the top of every page so spacing, sizing, and motion are consistent.
 */
export interface PageHeaderProps {
  /** Short context label rendered above the title (e.g. "مشروع · شركة بصيرة") */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned action buttons */
  actions?: React.ReactNode;
  /** Status pills / badges rendered next to the title */
  meta?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(
        "flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pb-5 mb-5 border-b border-border/60",
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        {eyebrow && (
          <div className="text-xs font-semibold text-accent-text">
            {eyebrow}
          </div>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl md:text-[28px] font-bold leading-tight text-foreground">
            {title}
          </h1>
          {meta && <div className="flex items-center gap-1.5">{meta}</div>}
        </div>
        {subtitle && (
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </motion.header>
  );
}
