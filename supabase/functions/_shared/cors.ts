// 共用 CORS 標頭：前端（GitHub Pages 等，跟 Supabase 不同網域）
// 用瀏覽器直接呼叫 Edge Function 時，瀏覽器會先送一個 OPTIONS 預檢請求，
// 沒有這些標頭的話瀏覽器會直接擋掉，不會讓真正的請求送出去。
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
