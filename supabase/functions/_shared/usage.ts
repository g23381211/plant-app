// 每日用量計數，存在 Postgres 的 usage_counters 表（取代原本 server.js 的 data/usage.json）。
import { getServiceClient } from "./supabase.ts";

export function todayKey(): string {
  const d = new Date();
  const tz = new Date(d.getTime() + 8 * 60 * 60 * 1000); // 概略用 UTC+8（台灣）算「今天」
  return tz.toISOString().slice(0, 10);
}

export async function bumpUsage(kind: "weather" | "identify"): Promise<void> {
  const day = todayKey();
  const supabase = getServiceClient();
  const column = kind === "weather" ? "weather_calls" : "identify_calls";
  // 用資料庫函式做「原子性 +1」，避免兩個請求同時進來時互相蓋掉彼此的加總
  // （對應的 SQL 函式 bump_usage 定義在 migrations/0001_init.sql）
  const { error } = await supabase.rpc("bump_usage", {
    p_day: day,
    p_column: column,
  });
  if (error) console.error("[bumpUsage]", error.message);
}

export async function getUsage(identifyDailyLimit: number) {
  const day = todayKey();
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("usage_counters")
    .select("weather_calls, identify_calls")
    .eq("day", day)
    .maybeSingle();
  if (error) console.error("[getUsage]", error.message);
  const weatherCallsToday = data?.weather_calls || 0;
  const identifyCallsToday = data?.identify_calls || 0;
  return {
    date: day,
    weatherCallsToday,
    identifyCallsToday,
    identifyDailyLimit,
    identifyRemainingToday: Math.max(0, identifyDailyLimit - identifyCallsToday),
  };
}
