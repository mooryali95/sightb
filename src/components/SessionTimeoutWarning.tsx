import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Timer } from 'lucide-react';

export function SessionTimeoutWarning() {
  const { showWarning, remainingSeconds, resetActivity } = useSessionTimeout();

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <AlertDialog open={showWarning}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Timer className="w-5 h-5 text-destructive" />
            تحذير: انتهاء الجلسة
          </AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            سيتم تسجيل خروجك تلقائياً بسبب عدم النشاط خلال{' '}
            <span className="font-bold text-destructive">
              {minutes > 0 ? `${minutes} دقيقة و ` : ''}{seconds} ثانية
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={resetActivity}>
            متابعة العمل
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
