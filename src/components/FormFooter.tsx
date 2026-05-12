import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FormFooterProps {
  onCancel: () => void;
  onSubmit?: () => void;
  /** If provided, renders submit as type="button" with this handler. Otherwise uses type="submit". */
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  /** Variant for the submit button. Default: default. */
  submitVariant?: 'default' | 'destructive';
  className?: string;
}

/**
 * Standard footer for ResponsiveFormDialog forms.
 * - Two equal-width buttons on mobile (h-11) so both Cancel and Save are reachable.
 * - Right-aligned compact buttons on desktop.
 */
export function FormFooter({
  onCancel,
  onSubmit,
  submitLabel = 'حفظ',
  cancelLabel = 'إلغاء',
  isSubmitting = false,
  submitDisabled = false,
  submitVariant = 'default',
  className,
}: FormFooterProps) {
  return (
    <div className={cn('flex gap-2 sm:justify-end', className)}>
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        className="flex-1 sm:flex-none h-11 sm:h-10"
      >
        {cancelLabel}
      </Button>
      <Button
        type={onSubmit ? 'button' : 'submit'}
        onClick={onSubmit}
        disabled={isSubmitting || submitDisabled}
        variant={submitVariant}
        className="flex-1 sm:flex-none h-11 sm:h-10"
      >
        {isSubmitting ? '...' : submitLabel}
      </Button>
    </div>
  );
}
