import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/hooks/useAuth';
import { extractReceiptData } from '@/services/aiService';
import { uploadReceipt, attachReceiptMetadata } from '@/services/expenseAttachmentService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Camera, Loader2, Check, ArrowRight, Sparkles, X, Upload, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  EXPENSE_CATEGORY_LABELS,
  type ExpenseCategory,
  type Expense,
} from '@/types/project';
import { getActiveFund, getFundRemaining } from '@/lib/funds';

interface ExtractedReceipt {
  vendor_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  total_amount?: number | null;
  vat_amount?: number | null;
  is_vat_inclusive: boolean;
  currency?: string | null;
  suggested_category: ExpenseCategory;
  description?: string | null;
  line_items?: { description: string; amount: number }[];
  confidence: number;
}

type Step = 'capture' | 'analyzing' | 'review' | 'saving';

export default function MobileExpenseCapture() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselectedProject = params.get('project') || '';
  const { user } = useAuth();
  const { projects, addExpense, expenses, projectFunds } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('capture');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null);

  // form fields
  const [projectId, setProjectId] = useState(preselectedProject);
  const [vendor, setVendor] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [description, setDescription] = useState('');
  const [isVatInclusive, setIsVatInclusive] = useState(false);
  const [isVatExempt, setIsVatExempt] = useState(false);

  const activeProjects = useMemo(
    () => projects.filter((p) => !['archived', 'cancelled'].includes(p.status)),
    [projects],
  );

  const activeFund = useMemo(
    () => (projectId ? getActiveFund(projectId, projectFunds) : undefined),
    [projectId, projectFunds],
  );
  const fundRemaining = activeFund ? getFundRemaining(activeFund, expenses, useStore.getState().custodies || [], useStore.getState().paymentRequests || []) : 0;

  useEffect(() => {
    if (!projectId && activeProjects.length === 1) {
      setProjectId(activeProjects[0].id);
    }
  }, [activeProjects, projectId]);

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('الرجاء اختيار صورة');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      toast.error('حجم الصورة كبير (الحد ٦ ميجا)');
      return;
    }
    setImageBlob(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const extractWithAI = async () => {
    if (!imageBlob) return;
    setStep('analyzing');
    try {
      const base64 = await blobToBase64(imageBlob);
      const ext = (await extractReceiptData(base64, imageBlob.type)) as ExtractedReceipt;

      setExtracted(ext);
      // pre-fill form
      if (ext.vendor_name) setVendor(ext.vendor_name);
      if (ext.invoice_number) setInvoiceRef(ext.invoice_number);
      if (ext.invoice_date) setDate(ext.invoice_date);
      if (ext.total_amount) setAmount(String(ext.total_amount));
      if (ext.suggested_category) setCategory(ext.suggested_category);
      if (ext.description) setDescription(ext.description);
      setIsVatInclusive(!!ext.is_vat_inclusive);
      setStep('review');
      toast.success(`تم استخراج البيانات (دقة ${Math.round(ext.confidence * 100)}%)`);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'فشل تحليل الصورة. أدخل البيانات يدوياً.');
      setStep('review');
    }
  };

  const skipOcr = () => {
    setExtracted(null);
    setStep('review');
  };

  const resetAll = () => {
    setImageBlob(null);
    setImagePreview('');
    setExtracted(null);
    setVendor(''); setInvoiceRef(''); setAmount(''); setDescription('');
    setCategory('other'); setIsVatInclusive(false); setIsVatExempt(false);
    setStep('capture');
  };

  const handleSave = async (then: 'close' | 'next') => {
    if (!projectId) { toast.error('اختر المشروع'); return; }
    if (!description.trim()) { toast.error('أدخل وصفاً'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return; }

    setStep('saving');
    try {
      // 1) Upload receipt image (if any)
      let receipt: Awaited<ReturnType<typeof uploadReceipt>> = null;
      if (imageBlob && user?.id) {
        receipt = await uploadReceipt(user.id, imageBlob, `إيصال ${vendor || 'بدون مورد'}`);
        if (!receipt) toast.warning('تعذّر رفع الصورة، سيتم حفظ المصروف بدونها');
      }

      // 2) Net amount (DB stores VAT-exclusive per Net Storage Policy)
      // VAT removal happens here if the captured total is VAT-inclusive
      let finalAmount = amt;
      if (isVatInclusive && !isVatExempt) {
        finalAmount = +(amt / 1.15).toFixed(2);
      }

      const expenseData: Omit<Expense, 'id'> = {
        projectId,
        category,
        description: description.trim(),
        amount: finalAmount,
        date,
        month: new Date(date).getMonth() + 1,
        responsible: user?.email,
        approvalStatus: 'pending',
        vendor: vendor.trim() || undefined,
        invoiceRef: invoiceRef.trim() || undefined,
        isVatExempt,
        fundId: activeFund?.id,
      } as any;

      const newId = await addExpense(expenseData);

      // 3) Persist receipt + ocr metadata via direct update (slice doesn't expose these yet)
      if (newId && (receipt || extracted)) {
        await attachReceiptMetadata(newId, receipt, extracted);
      }

      toast.success('تم حفظ المصروف');
      if (then === 'next') {
        resetAll();
      } else {
        navigate(`/project/${projectId}`);
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'تعذّر الحفظ');
      setStep('review');
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center justify-between p-4 max-w-md mx-auto">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
            <ArrowRight className="w-4 h-4" />
            رجوع
          </Button>
          <h1 className="text-base font-semibold">تسجيل مصروف</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-md mx-auto p-4 space-y-4 pb-32">
        {/* STEP 1: CAPTURE */}
        {step === 'capture' && (
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
                    <Button onClick={extractWithAI} className="gap-1">
                      <Sparkles className="w-4 h-4" />
                      استخراج بالذكاء
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={skipOcr} className="text-xs w-full">
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
                  <Button variant="ghost" size="sm" onClick={skipOcr} className="text-xs w-full">
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
        )}

        {/* STEP 2: ANALYZING */}
        {step === 'analyzing' && (
          <Card className="p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <div>
              <h2 className="font-semibold">جارٍ تحليل الفاتورة…</h2>
              <p className="text-xs text-muted-foreground mt-1">قد تستغرق ثوانٍ معدودة</p>
            </div>
          </Card>
        )}

        {/* STEP 3: REVIEW */}
        {(step === 'review' || step === 'saving') && (
          <>
            {imagePreview && (
              <Card className="p-2 relative">
                <img src={imagePreview} alt="الفاتورة" className="w-full max-h-40 object-contain rounded" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-1 left-1 h-7 w-7 bg-background/80"
                  onClick={() => { setImageBlob(null); setImagePreview(''); }}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </Card>
            )}

            {extracted && (
              <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-muted-foreground">
                  تم الاستخراج بدقة {Math.round(extracted.confidence * 100)}% — راجع البيانات
                </span>
              </div>
            )}

            <Card className="p-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">المشروع *</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                  <SelectContent>
                    {activeProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {projectId && activeFund && (
                  <p className="text-xs text-muted-foreground">
                    الدفعة #{activeFund.fundNumber} — متبقي: {fundRemaining.toLocaleString('en-US')} ر.س
                  </p>
                )}
                {projectId && !activeFund && (
                  <p className="text-xs health-warning">
                    ⚠️ لا توجد دفعة نشطة — لن يتم ربط المصروف بدفعة
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm">الوصف *</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="مثال: قرطاسية للمكتب"
                  className="h-12"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">المبلغ *</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="h-12 text-lg font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">التاريخ</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="h-12"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">الفئة</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                  <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">المورد</Label>
                  <Input
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="اختياري"
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">رقم الفاتورة</Label>
                  <Input
                    value={invoiceRef}
                    onChange={(e) => setInvoiceRef(e.target.value)}
                    placeholder="اختياري"
                    className="h-12"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isVatInclusive}
                    onChange={(e) => setIsVatInclusive(e.target.checked)}
                    disabled={isVatExempt}
                    className="h-4 w-4"
                  />
                  المبلغ شامل ضريبة القيمة المضافة
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isVatExempt}
                    onChange={(e) => setIsVatExempt(e.target.checked)}
                    className="h-4 w-4"
                  />
                  معفى من الضريبة
                </label>
              </div>

              {extracted?.line_items && extracted.line_items.length > 0 && (
                <div className="space-y-1 text-xs">
                  <Label className="text-xs text-muted-foreground">بنود الفاتورة المستخرجة</Label>
                  <div className="space-y-1 bg-muted/30 rounded p-2">
                    {extracted.line_items.slice(0, 5).map((it, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="truncate">{it.description}</span>
                        <span className="font-mono">{it.amount.toLocaleString('en-US')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {/* Sticky Save Bar */}
      {(step === 'review' || step === 'saving') && (
        <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t p-3 z-10">
          <div className="max-w-md mx-auto grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => handleSave('next')}
              disabled={step === 'saving'}
              className="h-12"
            >
              {step === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ + التالي'}
            </Button>
            <Button
              onClick={() => handleSave('close')}
              disabled={step === 'saving'}
              className="h-12 gap-1"
            >
              {step === 'saving' ? (
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
      )}
    </div>
  );
}
