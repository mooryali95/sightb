import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Paperclip, X } from 'lucide-react';
import type { FundSettlementAttachment } from '@/types/project';

interface AttachmentsEditorProps {
  attachments: FundSettlementAttachment[];
  onChange: (attachments: FundSettlementAttachment[]) => void;
}

/** The invoices attached to a settlement: a list to remove from, and a name and link to add with. */
export function AttachmentsEditor({ attachments, onChange }: AttachmentsEditorProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const add = () => {
    if (!name.trim()) return;
    onChange([...attachments, { name: name.trim(), url: url.trim() || undefined, uploadedAt: new Date().toISOString() }]);
    setName(''); setUrl('');
  };

  return (
    <div>
      <Label>المرفقات (فواتير)</Label>
      <div className="space-y-2 mt-2">
        {attachments.map((a, i) => (
          <div key={i} className="flex items-center gap-2 p-2 border rounded-md text-sm">
            <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="flex-1">{a.name}</span>
            {a.url && (
              <a href={a.url} target="_blank" rel="noopener" className="text-xs text-primary underline">فتح</a>
            )}
            <Button size="icon" variant="ghost" title="إزالة المرفق" className="h-6 w-6" onClick={() => onChange(attachments.filter((_, j) => j !== i))}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input placeholder="اسم المرفق" value={name} onChange={(e) => setName(e.target.value)} className="text-xs" />
          <Input placeholder="رابط (اختياري)" value={url} onChange={(e) => setUrl(e.target.value)} className="text-xs" />
          <Button size="sm" variant="outline" onClick={add}>إضافة</Button>
        </div>
      </div>
    </div>
  );
}
