// GET /functions/v1/weather?city=台北市&district=松山區
// 天氣代理＋快取：同一行政區 4 小時內共用同一筆快取（存在 Postgres 的 weather_cache 表），
// 過期或沒有快取時才真的打一次 OpenWeatherMap。
// 對應原本 server/server.js 的 /api/weather 路由，邏輯完全比照搬過來。
import { corsHeaders, handleCors, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { bumpUsage } from "../_shared/usage.ts";
import { lookupCoords, normalize } from "../_shared/tw-districts.ts";

const OWM_KEY = Deno.env.get("OPENWEATHER_API_KEY") || "";
const WEATHER_CACHE_MS = 4 * 60 * 60 * 1000; // 4 小時

function weatherCacheKey(city: string, district: string): string {
  return `${normalize(city)}|${normalize(district)}`;
}

async function resolveCoords(city: string, district: string) {
  const local = lookupCoords(city, district);
  if (local) return local;
  // 本地表查不到 → 用 OpenWeatherMap Geocoding API 查一次（結果不快取地址，只快取天氣本身）
  const q = encodeURIComponent(`${district || ""}${district ? "," : ""}${city || ""},TW`);
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${q}&limit=1&appid=${OWM_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`geocoding 失敗 (${res.status})`);
  const arr = await res.json();
  if (!arr || !arr.length) throw new Error("找不到這個地區的座標，請確認縣市／行政區名稱是否正確");
  return { lat: arr[0].lat, lon: arr[0].lon, source: "geocoding-api" };
}

function mapOwmToView(json: any) {
  const w = (json.weather && json.weather[0]) || {};
  const main = json.main || {};
  const owmMain = (w.main || "").toLowerCase();
  const isRain = /rain|drizzle|thunderstorm/.test(owmMain);
  const isSnow = /snow/.test(owmMain);
  let icon = "icon-cloud";
  if (isRain) icon = "icon-cloud-rain";
  else if (owmMain === "clear") icon = "icon-sun";
  return {
    tempCurrent: main.temp != null ? Math.round(main.temp) : null,
    tempHigh: main.temp_max != null ? Math.round(main.temp_max) : (main.temp != null ? Math.round(main.temp) : null),
    tempLow: main.temp_min != null ? Math.round(main.temp_min) : (main.temp != null ? Math.round(main.temp) : null),
    humidity: main.humidity != null ? main.humidity : null,
    isRain, isSnow,
    condition: w.description || (isRain ? "有雨" : "晴朗"),
    icon,
    source: "live",
  };
}

async function fetchLiveWeather(city: string, district: string) {
  if (!OWM_KEY) throw new Error("尚未設定 OPENWEATHER_API_KEY 這個 Edge Function secret");
  const { lat, lon } = await resolveCoords(city, district);
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=zh_tw&appid=${OWM_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenWeatherMap 回應錯誤 (${res.status}) ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  await bumpUsage("weather");
  return mapOwmToView(json);
}

async function getWeather(city: string, district: string) {
  const supabase = getServiceClient();
  const key = weatherCacheKey(city, district);
  const { data: cached } = await supabase
    .from("weather_cache")
    .select("payload, fetched_at")
    .eq("cache_key", key)
    .maybeSingle();

  const now = Date.now();
  const fetchedAt = cached ? new Date(cached.fetched_at).getTime() : 0;
  if (cached && (now - fetchedAt) < WEATHER_CACHE_MS) {
    return { ...cached.payload, cached: true, cacheAgeMinutes: Math.round((now - fetchedAt) / 60000) };
  }
  try {
    const data = await fetchLiveWeather(city, district);
    await supabase.from("weather_cache").upsert({
      cache_key: key,
      payload: data,
      fetched_at: new Date().toISOString(),
    });
    return { ...data, cached: false, cacheAgeMinutes: 0 };
  } catch (err) {
    // 打不到即時資料時，若有舊快取（就算過期）也先給，好過完全沒有
    if (cached) {
      return { ...cached.payload, cached: true, stale: true, cacheAgeMinutes: Math.round((now - fetchedAt) / 60000) };
    }
    throw err;
  }
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const url = new URL(req.url);
  const city = (url.searchParams.get("city") || "").trim();
  const district = (url.searchParams.get("district") || "").trim();
  if (!city) return jsonResponse({ ok: false, error: "請提供 city 參數" }, 400);

  try {
    const data = await getWeather(city, district);
    return jsonResponse({ ok: true, city, district, ...data });
  } catch (err) {
    console.error("[weather]", (err as Error).message);
    return jsonResponse({ ok: false, error: (err as Error).message }, 502);
  }
});
