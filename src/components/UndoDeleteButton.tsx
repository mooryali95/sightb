import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The delete icon for a light row: no dialog, the toast offers «تراجع» (see lib/undo-delete). */
export function UndoDeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} title={label} onClick={onDelete}>
      <Trash2 className="w-3.5 h-3.5 text-destructive" aria-hidden="true" />
    </Button>
  );
}
