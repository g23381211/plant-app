// GET /functions/v1/usage — 查詢今天兩個 API 各呼叫了幾次，App「設定」頁會顯示這個。
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { getUsage } from "../_shared/usage.ts";

const IDENTIFY_DAILY_LIMIT = Number(Deno.env.get("IDENTIFY_DAILY_LIMIT") || 10);

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  const usage = await getUsage(IDENTIFY_DAILY_LIMIT);
  return jsonResponse({ ok: true, ...usage });
});
