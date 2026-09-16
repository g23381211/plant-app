// 建立一個「後台用」的 Supabase client：用 service_role key，
// 可以直接讀寫資料庫、略過 RLS（Row Level Security）限制。
// service_role key 只存在 Edge Function 的環境變數（Supabase secrets）裡，
// 絕對不會出現在前端 —— 這跟原本 server.js 用 .env 藏金鑰是同一個道理，
// 只是現在「伺服器」變成了 Supabase 幫忙代管的 Edge Function。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getServiceClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}
