/**
 * The first step: take or choose a picture of the receipt, then send it to
 * the OCR or skip straight to the form. The file input lives here with its
 * `capture` attribute trick for the gallery button; the page only learns
 * which file was chosen, and refuses anything that is not a small image.
 */
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, Sparkles, Upload, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

interface Props {
  imagePreview: string;
  onImage: (file: File) => void;
  onExtract: () => void;
  onSkip: () => void;
}

export function CaptureStep({ imagePreview, onImage, onExtract, onSkip }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('الرجاء اختيار صورة');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('حجم الصورة كبير (الحد ٦ ميجا)');
      return;
    }
    onImage(file);
  };

  return (
    <>
      <Card className="p-6 text-center space-y-4">
        <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Camera className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold mb-1">صوّر الفاتورة</h2>
          <p className="text-sm text-muted-foreground">
            سيقوم النظام باستخراج البيانات تلقائياً بالذكاء الاصطناعي
          </p>
        </div>

        {imagePreview ? (
          <>
            <div className="rounded-lg overflow-hidden border">
              <img src={imagePreview} alt="معاينة الفاتورة" className="w-full max-h-80 object-contain bg-muted" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-1">
                <RefreshCw className="w-4 h-4" />
                إعادة التقاط
              </Button>
              <Button onClick={onExtract} className="gap-1">
                <Sparkles className="w-4 h-4" />
                استخراج بالذكاء
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-xs w-full">
              تخطي والإدخال يدوياً
            </Button>
          </>
        ) : (
          <div className="space-y-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              size="lg"
              className="w-full h-14 gap-2 text-base"
            >
              <Camera className="w-5 h-5" />
              فتح الكاميرا
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture');
                  fileInputRef.current.click();
                  // reset capture for next time
                  setTimeout(() => fileInputRef.current?.setAttribute('capture', 'environment'), 500);
                }
              }}
              className="w-full gap-2"
            >
              <Upload className="w-4 h-4" />
              اختيار من المعرض
            </Button>
            <Button variant="ghost" size="sm" onClick={onSkip} className="text-xs w-full">
              إدخال يدوي بدون صورة
            </Button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelected}
          className="hidden"
        />
      </Card>
    </>
  );
}
