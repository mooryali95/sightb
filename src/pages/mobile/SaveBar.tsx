/**
 * The sticky bar under the review form: save and start another, or save
 * and go to the project.
 */
import { Button } from '@/components/ui/button';
import { Loader2, Check } from 'lucide-react';

interface Props {
  saving: boolean;
  onSave: (then: 'close' | 'next') => void;
}

export function SaveBar({ saving, onSave }: Props) {
  return (
    <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t p-3 z-10">
    <div className="max-w-md mx-auto grid grid-cols-2 gap-2">
      <Button
        variant="outline"
        onClick={() => onSave('next')}
        disabled={saving}
        className="h-12"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ + التالي'}
      </Button>
      <Button
        onClick={() => onSave('close')}
        disabled={saving}
        className="h-12 gap-1"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Check className="w-4 h-4" />
            حفظ وإغلاق
          </>
        )}
      </Button>
    </div>
    </div>
  );
}
