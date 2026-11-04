import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface ConfirmDeleteDialogProps {
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  trigger?: React.ReactNode;
  variant?: 'icon' | 'button' | 'inline';
}

export function ConfirmDeleteDialog({
  title = 'تأكيد الحذف',
  description = 'هل أنت متأكد من الحذف؟ لا يمكن التراجع عن هذا الإجراء.',
  confirmLabel = 'حذف',
  onConfirm,
  trigger,
  variant = 'icon',
}: ConfirmDeleteDialogProps) {
  const defaultTrigger =
    variant === 'icon' ? (
      <Button variant="ghost" size="icon" aria-label={confirmLabel}>
        <Trash2 className="w-3.5 h-3.5 text-destructive" />
      </Button>
    ) : variant === 'inline' ? (
      <button aria-label={confirmLabel} className="hit text-destructive hover:text-destructive/80 me-1">
        <Trash2 className="w-3 h-3" />
      </button>
    ) : (
      <Button variant="destructive" size="sm">
        <Trash2 className="w-4 h-4 me-1" /> حذف
      </Button>
    );

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger || defaultTrigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row-reverse gap-2">
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
