import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorHandlers } from "@/lib/logger";
import { installOfflineQueue, subscribeToQueueFailures } from "@/lib/offline-queue";

const TABLE_LABELS: Record<string, string> = {
  expenses: "مصروف",
  resource_reimbursements: "مستحق",
  payment_requests: "طلب دفع",
  custodies: "عهدة",
  cash_transfers: "تحويل نقدي",
};

installGlobalErrorHandlers();

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

createRoot(document.getElementById("root")!).render(<App />);
