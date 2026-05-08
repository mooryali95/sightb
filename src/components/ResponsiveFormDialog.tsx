import * as React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface ResponsiveFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  trigger?: React.ReactNode;
  children: React.ReactNode;
  /** Footer rendered as a sticky action bar inside the form (mobile-friendly). */
  footer?: React.ReactNode;
  /** Override desktop dialog width. Default: max-w-md */
  desktopWidthClassName?: string;
}

/**
 * On mobile (<md): renders as a full-height bottom Sheet (drawer).
 * On desktop: renders as a centered Dialog.
 *
 * Children is the scrollable form body. Footer (if provided) is pinned at the bottom
 * on mobile so the primary action is always reachable.
 */
export function ResponsiveFormDialog({
  open,
  onOpenChange,
  title,
  trigger,
  children,
  footer,
  desktopWidthClassName = 'max-w-md',
}: ResponsiveFormDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
        <SheetContent
          side="bottom"
          className="h-[92vh] p-0 flex flex-col rounded-t-2xl"
        >
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
            <SheetTitle className="text-right">{title}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-4 [&_input]:h-11 [&_button[role=combobox]]:h-11 [&_textarea]:min-h-[88px]">
            {children}
          </div>
          {footer && (
            <div className="px-4 py-3 border-t border-border bg-background shrink-0 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
              {footer}
            </div>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={cn('max-h-[90vh] overflow-y-auto', desktopWidthClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">{children}</div>
        {footer && <div className="pt-3 border-t border-border mt-3">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
