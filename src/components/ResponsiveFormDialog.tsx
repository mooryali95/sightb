import * as React from 'react';
import { X } from 'lucide-react';
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
 * On mobile (<md): renders as a bottom Sheet with drag handle and large close button.
 * On desktop: renders as a centered Dialog.
 *
 * Hides the default Sheet/Dialog X (small, easy to miss in RTL) and provides a 44x44 touch
 * target close button in the header. Overlay tap and ESC also close.
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
          className={cn(
            'p-0 flex flex-col rounded-t-2xl border-t border-border',
            'h-[90vh] max-h-[90dvh]',
            // Hide the default Radix close X (we render our own larger one)
            '[&>button.absolute]:hidden',
          )}
        >
          {/* Drag affordance */}
          <div className="pt-2 pb-1 flex justify-center shrink-0">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          </div>

          {/* Header: title (right in RTL) + large close button (left in RTL) */}
          <div className="px-4 pb-3 pt-1 border-b border-border shrink-0 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="إغلاق"
              className="h-11 w-11 -ms-2 inline-flex items-center justify-center rounded-full hover:bg-accent active:scale-95 transition-transform focus-ring"
            >
              <X className="h-5 w-5" />
            </button>
            <DialogTitleText>{title}</DialogTitleText>
            {/* spacer to balance the close button visually */}
            <span className="h-11 w-11" aria-hidden />
          </div>

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

// Render the title with semantic heading styling (Sheet's own SheetTitle is replaced
// to gain control over RTL alignment alongside our custom close button).
function DialogTitleText({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex-1 text-base font-semibold text-foreground text-start truncate">
      {children}
    </h2>
  );
}
