// OCR Receipt extraction using Lovable AI Vision (Gemini 2.5 Pro)
// Receives image (base64), extracts structured invoice/receipt data via tool calling

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPENSE_CATEGORIES = [
  'salary', 'travel', 'hotel', 'food', 'printing', 'photography',
  'import', 'training', 'consulting', 'media', 'hospitality',
  'equipment', 'software', 'contingency', 'other',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { image_base64, mime_type } = body;

    if (!image_base64 || typeof image_base64 !== 'string') {
      return new Response(JSON.stringify({ error: 'image_base64 required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (image_base64.length > 8 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'الصورة كبيرة جداً (الحد ٦ ميجا)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const imageMime = mime_type || 'image/jpeg';
    const dataUrl = `data:${imageMime};base64,${image_base64}`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'system',
            content:
              'أنت مساعد متخصص في استخراج بيانات الفواتير والإيصالات العربية والإنجليزية. ' +
              'استخرج البيانات بدقة. إذا لم تجد قيمة بوضوح، استخدم null. ' +
              'التواريخ بصيغة YYYY-MM-DD ميلادي. الأرقام بأرقام إنجليزية فقط. ' +
              'صنّف الفئة الأنسب من القائمة المتاحة. confidence من 0 إلى 1.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'استخرج بيانات هذه الفاتورة/الإيصال:' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_receipt',
              description: 'Extract structured data from a receipt or invoice image',
              parameters: {
                type: 'object',
                properties: {
                  vendor_name: { type: ['string', 'null'], description: 'اسم المورد/المتجر' },
                  invoice_number: { type: ['string', 'null'], description: 'رقم الفاتورة' },
                  invoice_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
                  total_amount: { type: ['number', 'null'], description: 'الإجمالي شامل أو غير شامل' },
                  vat_amount: { type: ['number', 'null'], description: 'قيمة الضريبة المنفصلة' },
                  is_vat_inclusive: { type: 'boolean', description: 'هل total_amount شامل الضريبة' },
                  currency: { type: ['string', 'null'], description: 'مثال: SAR, ر.س' },
                  suggested_category: {
                    type: 'string',
                    enum: EXPENSE_CATEGORIES,
                    description: 'الفئة الأنسب',
                  },
                  description: { type: ['string', 'null'], description: 'وصف مختصر للمصروف' },
                  line_items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        description: { type: 'string' },
                        amount: { type: 'number' },
                      },
                      required: ['description', 'amount'],
                      additionalProperties: false,
                    },
                  },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
                required: ['suggested_category', 'is_vat_inclusive', 'confidence'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'extract_receipt' } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'تم تجاوز الحد المسموح. حاول بعد قليل.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'انتهى رصيد الذكاء الاصطناعي. يرجى تعبئة الرصيد.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const t = await aiResp.text();
      console.error('AI error', aiResp.status, t);
      return new Response(JSON.stringify({ error: 'فشل تحليل الصورة' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: 'لم يتمكن النظام من استخراج البيانات' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let extracted;
    try {
      extracted = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ error: 'استجابة غير صالحة' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ data: extracted }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('extract-receipt-data error', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
