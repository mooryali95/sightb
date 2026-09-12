/**
 * Capture an expense from a receipt on a phone: take a picture, let the
 * OCR read it (or skip), review the form, save. The page owns the flow and
 * the values; the three steps under mobile/ render them.
 *
 * What is saved is net of the project's VAT, booked in the project's month
 * (not the calendar month), drawn on the project's active fund and never
 * more than that fund still holds, and left pending for approval.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/hooks/useAuth';
import { extractReceiptData } from '@/services/aiService';
import { uploadReceipt, attachReceiptMetadata } from '@/services/expenseAttachmentService';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Expense } from '@/types/project';
import { getActiveFund, getFundRemaining } from '@/lib/funds';
import { formatCurrency, getProjectMonth, removeVAT } from '@/lib/finance';
import { errorMessage } from '@/lib/utils';
import { CaptureStep } from './mobile/CaptureStep';
import { ReviewForm } from './mobile/ReviewForm';
import { SaveBar } from './mobile/SaveBar';
import { applyReading, blobToBase64, emptyReceiptForm, type ExtractedReceipt, type ReceiptForm } from './mobile/receiptForm';

type Step = 'capture' | 'analyzing' | 'review' | 'saving';

export default function MobileExpenseCapture() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preselectedProject = params.get('project') || '';
  const { user } = useAuth();
  const { projects, addExpense, expenses, projectFunds, custodies, paymentRequests, cashTransfers } = useStore();

  const [step, setStep] = useState<Step>('capture');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [extracted, setExtracted] = useState<ExtractedReceipt | null>(null);
  const [form, setForm] = useState<ReceiptForm>(() => emptyReceiptForm(preselectedProject));
  const patchForm = (patch: Partial<ReceiptForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const activeProjects = useMemo(
    () => projects.filter((p) => !['archived', 'cancelled'].includes(p.status)),
    [projects],
  );

  const selectedProject = useMemo(() => projects.find((p) => p.id === form.projectId), [projects, form.projectId]);
  const activeFund = useMemo(
    () => (form.projectId ? getActiveFund(form.projectId, projectFunds) : undefined),
    [form.projectId, projectFunds],
  );
  const fundRemaining = activeFund
    ? getFundRemaining(activeFund, expenses, custodies || [], paymentRequests || [], cashTransfers || [])
    : 0;

  useEffect(() => {
    if (!form.projectId && activeProjects.length === 1) {
      setForm((prev) => ({ ...prev, projectId: activeProjects[0].id }));
    }
  }, [activeProjects, form.projectId]);

  const handleImage = (file: File) => {
    setImageBlob(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const extractWithAI = async () => {
    if (!imageBlob) return;
    setStep('analyzing');
    try {
      const base64 = await blobToBase64(imageBlob);
      const ext = (await extractReceiptData(base64, imageBlob.type)) as ExtractedReceipt;
      setExtracted(ext);
      setForm((prev) => applyReading(prev, ext));
      setStep('review');
      toast.success(`تم استخراج البيانات (دقة ${Math.round(ext.confidence * 100)}%)`);
    } catch (e) {
      console.error(e);
      toast.error(errorMessage(e, 'فشل تحليل الصورة. أدخل البيانات يدوياً.'));
      setStep('review');
    }
  };

  const skipOcr = () => {
    setExtracted(null);
    setStep('review');
  };

  /** Back to the first step for the next receipt, on the same project and date. */
  const resetAll = () => {
    setImageBlob(null);
    setImagePreview('');
    setExtracted(null);
    setForm((prev) => ({ ...emptyReceiptForm(prev.projectId), date: prev.date }));
    setStep('capture');
  };

  const handleSave = async (then: 'close' | 'next') => {
    const { projectId, description, amount, date, category, vendor, invoiceRef, isVatInclusive, isVatExempt } = form;
    if (!projectId) { toast.error('اختر المشروع'); return; }
    if (!description.trim()) { toast.error('أدخل وصفاً'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error('أدخل مبلغاً صحيحاً'); return; }
    if (!selectedProject) { toast.error('اختر المشروع'); return; }

    // Net amount (the database stores VAT-exclusive figures). Stripped at
    // the project's own rate, the way the desktop form does; a receipt on a
    // project with no VAT, or an exempt one, is taken whole.
    const vatRate = isVatInclusive && !isVatExempt ? selectedProject.taxPercent || 0 : 0;
    const finalAmount = vatRate > 0 ? +removeVAT(amt, vatRate).toFixed(2) : amt;

    // The same rule as the desktop form: never more than the fund still holds.
    if (activeFund && finalAmount > fundRemaining) {
      toast.error(
        `المبلغ (${formatCurrency(finalAmount)}) يتجاوز المتبقي في الدفعة #${activeFund.fundNumber} (${formatCurrency(fundRemaining)}). قسّم المصروف، أو سجّل دفعة جديدة.`,
      );
      return;
    }

    setStep('saving');
    try {
      // 1) Upload receipt image (if any)
      let receipt: Awaited<ReturnType<typeof uploadReceipt>> = null;
      if (imageBlob && user?.id) {
        receipt = await uploadReceipt(user.id, imageBlob, `إيصال ${vendor || 'بدون مورد'}`);
        if (!receipt) toast.warning('تعذّر رفع الصورة، سيتم حفظ المصروف بدونها');
      }

      // 2) The project's month, not the calendar month: every monthly
      // figure in the app buckets by it.
      const expenseData: Omit<Expense, 'id'> = {
        projectId,
        category,
        description: description.trim(),
        amount: finalAmount,
        date,
        month: getProjectMonth(selectedProject.startDate, date, selectedProject.durationMonths),
        responsible: user?.email,
        approvalStatus: 'pending',
        vendor: vendor.trim() || undefined,
        invoiceRef: invoiceRef.trim() || undefined,
        isVatExempt,
        fundId: activeFund?.id,
      };

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
    } catch (e) {
      console.error(e);
      toast.error(errorMessage(e, 'تعذّر الحفظ'));
      setStep('review');
    }
  };

  return (
    <div className="min-h-screen bg-background">
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
        {step === 'capture' && (
          <CaptureStep imagePreview={imagePreview} onImage={handleImage} onExtract={extractWithAI} onSkip={skipOcr} />
        )}

        {step === 'analyzing' && (
          <Card className="p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
            <div>
              <h2 className="font-semibold">جارٍ تحليل الفاتورة…</h2>
              <p className="text-xs text-muted-foreground mt-1">قد تستغرق ثوانٍ معدودة</p>
            </div>
          </Card>
        )}

        {(step === 'review' || step === 'saving') && (
          <ReviewForm
            form={form}
            onChange={patchForm}
            projects={activeProjects}
            activeFund={activeFund}
            fundRemaining={fundRemaining}
            extracted={extracted}
            imagePreview={imagePreview}
            onClearImage={() => { setImageBlob(null); setImagePreview(''); }}
          />
        )}
      </div>

      {(step === 'review' || step === 'saving') && (
        <SaveBar saving={step === 'saving'} onSave={handleSave} />
      )}
    </div>
  );
}
