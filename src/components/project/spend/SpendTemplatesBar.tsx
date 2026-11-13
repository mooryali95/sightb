/**
 * Saved views of the explorer, kept per user in local storage: save the
 * current one under a name, apply one, delete one.
 */
import { useEffect, useState } from 'react';
import { listSpendTemplates, saveSpendTemplate, deleteSpendTemplate, type SpendTemplate } from '@/lib/spend-templates';
import type { SpendViewState } from '@/lib/spend-url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Save, Trash2 } from 'lucide-react';

interface Props {
  projectId?: string;
  /** The view a new template is saved from. */
  current: SpendViewState;
  onApply: (view: SpendViewState) => void;
}

export function SpendTemplatesBar({ projectId, current, onApply }: Props) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<SpendTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');

  useEffect(() => { setTemplates(listSpendTemplates(projectId)); }, [projectId]);

  const handleSave = () => {
    const name = templateName.trim();
    if (!name) return;
    saveSpendTemplate({ name, projectId: projectId ?? null, dimensions: current.dimensions, filters: current.filters, sort: current.sort });
    setTemplates(listSpendTemplates(projectId));
    setTemplateName('');
    toast({ title: 'تم حفظ القالب', description: name });
  };

  const remove = (id: string) => {
    deleteSpendTemplate(id);
    setTemplates(listSpendTemplates(projectId));
  };

  return (
    <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1 flex-1 min-w-48">
          <Label className="text-xs">حفظ الفلاتر الحالية كقالب</Label>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="مثال: مصروفات الربع الأول — د. أنور"
          />
        </div>
        <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={!templateName.trim()}>
          <Save className="w-3.5 h-3.5" />حفظ القالب
        </Button>
      </div>
      {templates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {templates.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-background ps-2 pe-1 py-0.5">
              <button type="button" className="text-xs" onClick={() => onApply(t)}>{t.name}</button>
              {!t.projectId && <Badge variant="outline" className="text-xs">عام</Badge>}
              <button type="button" aria-label="حذف القالب" onClick={() => remove(t.id)}>
                <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
