// First, so the frame guard decides before any other module runs: see lib/frame-guard-boot.
import { renderAllowed } from "@/lib/frame-guard-boot";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { toast } from "sonner";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorHandlers } from "@/lib/logger";
import { installRemoteLogging } from "@/lib/observability";
import { installErrorReporting } from "@/lib/error-reporting";
import { installDeleteFlush } from "@/lib/undo-delete";
import { installOfflineQueue, subscribeToQueueFailures } from "@/lib/offline-queue";

const TABLE_LABELS: Record<string, string> = {
  expenses: "مصروف",
  resource_reimbursements: "مستحق",
  payment_requests: "طلب دفع",
  custodies: "عهدة",
  cash_transfers: "تحويل نقدي",
};

/**
 * Fail loudly when the Supabase connection settings are missing.
 *
 * `integrations/supabase/client.ts` is generated and reads `import.meta.env`
 * with no fallback, so a build without `VITE_SUPABASE_*` produces a client
 * pointed at `undefined` and every query dies with an opaque network error
 * long after startup. Checking here turns that into one legible message —
 * and is what makes it safe to stop committing `.env` (P0-03).
 */
function assertSupabaseEnv(): boolean {
  const missing = (['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'] as const)
    .filter((key) => !import.meta.env[key]);
  if (missing.length === 0) return true;

  const root = document.getElementById('root');
  if (root) {
    root.setAttribute('dir', 'rtl');
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif">
        <div style="max-width:32rem;text-align:center">
          <h1 style="font-size:1.25rem;margin:0 0 .5rem">تعذّر تشغيل النظام</h1>
          <p style="color:#666;margin:0 0 1rem">إعدادات الاتصال بقاعدة البيانات غير متوفرة في هذه البيئة.</p>
          <code style="display:block;background:#f4f4f5;padding:.75rem;border-radius:6px;font-size:.8rem;direction:ltr;text-align:left">${missing.join('\n')}</code>
        </div>
      </div>`;
  }
  return false;
}

installGlobalErrorHandlers();

// Ships warn/error to VITE_LOG_ENDPOINT when it is set. A no-op otherwise,
// which is every environment until you configure a collector — see P0-04 in
// docs/production-readiness-key-points.md. Installed before anything else can
// fail so that startup errors are captured too.
installRemoteLogging();

// Every error also reaches the owner's log in the database (سجل الأعطال).
installErrorReporting();

// A delete waiting out its undo window is sent if the page is left or hidden.
installDeleteFlush();

// A queued offline write that fails permanently (تحقق/صلاحيات) must never
// disappear silently — the optimistic row is still on screen.
subscribeToQueueFailures(({ item, message }) => {
  const label = TABLE_LABELS[item.table] ?? item.table;
  toast.error(`تعذّر حفظ ${label} المؤجل على الخادم`, {
    description: `${message} — لم يُحفظ السجل، يرجى تحديث الصفحة وإعادة إدخاله.`,
    duration: 15000,
  });
});

installOfflineQueue();

// Framed by another site, the app shows a notice instead: see lib/frame-guard.
if (renderAllowed && assertSupabaseEnv()) {
  createRoot(document.getElementById("root")!).render(
    <HelmetProvider>
      <App />
    </HelmetProvider>,
  );
}
