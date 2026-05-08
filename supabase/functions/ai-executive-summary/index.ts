// AI-powered executive summary using Lovable AI Gateway
// Receives project metrics, returns concise Arabic insights for executives.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://sightb.lovable.app",
  "https://sight.basserh.com",
  "http://localhost:5173",
  "http://localhost:8080",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const isAllowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith(".lovable.app") || origin.endsWith(".lovableproject.com");
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

interface ProjectContext {
  name: string;
  status: string;
  percentComplete: number;
  currentMonth: number;
  durationMonths: number;
  contractValue: number;
  effectiveContractValue: number;
  totalPlanned: number;
  totalActual: number;
  collectedRevenue: number;
  invoicedRevenue: number;
  spendRate: number;
  plannedProfit: number;
  cpi?: number | null;
  spi?: number | null;
  openRisks: number;
  highRisks: number;
  pendingExpenses: number;
  pendingChangeOrders: number;
  delayedMilestones: number;
  unsettledFunds: number;
  remainingInManagerHand: number;
  daysRemaining: number | null;
  currency: string;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ctx: ProjectContext = await req.json();

    const sys = `أنت مدير محفظة مشاريع خبير لديه 30 سنة خبرة في إدارة المشاريع المالية والتشييد.
تكتب ملخصاً تنفيذياً للمدير العام بالعربية الفصحى — مُختصر، عملي، ومرتب.
لا تذكر أرقاماً غير موجودة في البيانات. استخدم الأرقام الإنجليزية (0-9).
يجب أن يكون الرد JSON فقط بهذه البنية:
{
  "headline": "جملة واحدة قصيرة عن الحالة العامة",
  "highlights": ["نقطة 1", "نقطة 2", "نقطة 3"],
  "concerns": ["قلق 1", "قلق 2"],
  "recommendations": ["توصية تنفيذية 1", "توصية 2", "توصية 3"]
}
- highlights: 2-4 نقاط إيجابية أو محايدة
- concerns: 1-3 مخاوف فعلية (احذف القسم لو لا توجد)
- recommendations: 2-4 توصيات قابلة للتنفيذ خلال 30 يوماً`;

    const user = `بيانات المشروع "${ctx.name}":
- الحالة: ${ctx.status} | الإنجاز: ${ctx.percentComplete}% | الشهر ${ctx.currentMonth} من ${ctx.durationMonths}
- قيمة العقد: ${ctx.effectiveContractValue.toLocaleString("en-US")} ${ctx.currency}
- الموازنة المخططة: ${ctx.totalPlanned.toLocaleString("en-US")} | المصروف الفعلي: ${ctx.totalActual.toLocaleString("en-US")} (${ctx.spendRate.toFixed(1)}%)
- الإيرادات المحصّلة: ${ctx.collectedRevenue.toLocaleString("en-US")} | المُفوتر: ${ctx.invoicedRevenue.toLocaleString("en-US")}
- الربح المخطط: ${ctx.plannedProfit.toLocaleString("en-US")}
${ctx.cpi !== null && ctx.cpi !== undefined ? `- CPI: ${ctx.cpi.toFixed(2)} | SPI: ${ctx.spi?.toFixed(2) ?? "-"}` : ""}
- مخاطر مفتوحة: ${ctx.openRisks} (منها ${ctx.highRisks} عالية الأثر)
- مصروفات بانتظار اعتماد: ${ctx.pendingExpenses}
- أوامر تغيير معلقة: ${ctx.pendingChangeOrders}
- مراحل متأخرة: ${ctx.delayedMilestones}
- صرفيات غير مسوّاة: ${ctx.unsettledFunds} | متبقي بيد المدير: ${ctx.remainingInManagerHand.toLocaleString("en-US")}
${ctx.daysRemaining !== null ? `- الأيام المتبقية: ${ctx.daysRemaining}` : ""}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: "تم تجاوز الحد المسموح. حاول بعد قليل." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: "نفد الرصيد للذكاء الاصطناعي. يرجى إضافة رصيد." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!response.ok) {
      const txt = await response.text();
      console.error("[ai-gateway]", response.status, txt);
      return new Response(
        JSON.stringify({ error: "فشل توليد الملخص" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { headline: "تعذّر تحليل الرد", highlights: [], concerns: [], recommendations: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ai-executive-summary] fatal", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
