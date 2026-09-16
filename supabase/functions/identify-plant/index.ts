// POST /functions/v1/identify-plant   body: { imageBase64: "data:image/webp;base64,..." }
// AI 植物品種辨識代理：同一張照片（用內容雜湊比對）不重複呼叫；每天最多呼叫
// IDENTIFY_DAILY_LIMIT（預設 10）次，超過回傳 429，前端會自動改成手動輸入品種。
// 對應原本 server/server.js 的 /api/identify-plant 路由。
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { bumpUsage, getUsage } from "../_shared/usage.ts";

const GOOGLE_AI_KEY = Deno.env.get("GOOGLE_AI_API_KEY") || "";
const GOOGLE_AI_MODEL = Deno.env.get("GOOGLE_AI_MODEL") || "gemini-2.0-flash";
const IDENTIFY_DAILY_LIMIT = Number(Deno.env.get("IDENTIFY_DAILY_LIMIT") || 10);

async function hashImage(base64: string): Promise<string> {
  const bytes = new TextEncoder().encode(base64);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractJsonBlock(text: string) {
  const fence = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const match = candidate.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 回應無法解析為 JSON：" + text.slice(0, 200));
  return JSON.parse(match[0]);
}

async function callGeminiIdentify(base64: string, mimeType: string) {
  if (!GOOGLE_AI_KEY) throw new Error("尚未設定 GOOGLE_AI_API_KEY 這個 Edge Function secret");
  const prompt = "你是植物辨識專家。請辨識這張照片中的植物品種，並「只」以下面的 JSON 格式回覆，不要加任何其他文字或 markdown 標記：\n" +
    '{"name":"中文常見品種名","latin":"學名（不確定可留空）","confidence":0到100之間的整數,"note":"一句話的補充說明，例如判斷依據或不確定的原因"}\n' +
    "如果無法判斷精確品種，name 請填寫最接近的植物類型描述（例如「多肉植物」、「蕨類植物」），不要編造不存在的品種名稱。";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_AI_MODEL}:generateContent?key=${GOOGLE_AI_KEY}`;
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType || "image/webp", data: base64 } },
      ],
    }],
    generationConfig: { temperature: 0.2 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google AI 回應錯誤 (${res.status}) ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
  if (!text) throw new Error("Google AI 沒有回傳可用的內容（可能被安全過濾攔截）");
  const parsed = extractJsonBlock(text);
  return {
    name: String(parsed.name || "").trim() || "無法辨識",
    latin: String(parsed.latin || "").trim(),
    confidence: Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(parsed.confidence)))) : null,
    note: String(parsed.note || "").trim(),
  };
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "只接受 POST" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const imageBase64Full = String(body?.imageBase64 || "");
    if (!imageBase64Full) return jsonResponse({ ok: false, error: "缺少 imageBase64" }, 400);

    const m = imageBase64Full.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = m ? m[1] : "image/webp";
    const base64 = m ? m[2] : imageBase64Full;

    const supabase = getServiceClient();
    const hash = await hashImage(base64);

    const { data: cachedRow } = await supabase
      .from("identify_cache")
      .select("result")
      .eq("image_hash", hash)
      .maybeSingle();
    if (cachedRow) {
      const usage = await getUsage(IDENTIFY_DAILY_LIMIT);
      return jsonResponse({ ok: true, cached: true, ...cachedRow.result, usage });
    }

    const usageBefore = await getUsage(IDENTIFY_DAILY_LIMIT);
    if (usageBefore.identifyRemainingToday <= 0) {
      return jsonResponse({
        ok: false,
        error: "DAILY_LIMIT_REACHED",
        message: `今日 AI 辨識次數已達上限（每日 ${IDENTIFY_DAILY_LIMIT} 次），請手動輸入品種，或明天再試。`,
        usage: usageBefore,
      }, 429);
    }

    const result = await callGeminiIdentify(base64, mimeType);
    await bumpUsage("identify");
    await supabase.from("identify_cache").upsert({
      image_hash: hash,
      result,
      created_at: new Date().toISOString(),
    });

    const usage = await getUsage(IDENTIFY_DAILY_LIMIT);
    return jsonResponse({ ok: true, cached: false, ...result, usage });
  } catch (err) {
    console.error("[identify-plant]", (err as Error).message);
    return jsonResponse({ ok: false, error: (err as Error).message }, 502);
  }
});
