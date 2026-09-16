/* ==========================================================
   小綠日記 — 後端服務
   1. 提供前端靜態檔案（index.html / styles.css / app.js ...）
   2. GET  /api/weather         天氣代理＋快取（同行政區 4 小時共用一筆）
   3. POST /api/identify-plant  AI 植物品種辨識代理（每日上限 10 次＋結果快取）
   4. GET  /api/usage           查詢今日呼叫次數（給前端「設定」頁顯示用）

   之所以需要一個後端，是因為：
   - API 金鑰絕對不能放進前端 JS（瀏覽器打開 DevTools 就能看到、盜用）。
   - 「同一行政區的使用者在 4 小時內共用同一筆快取」這件事，
     本質上就是「共享狀態」，瀏覽器的 LocalStorage 只存在單一裝置上，
     沒有後端就不可能真正共用。
   ========================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

/* ---- 讀取 .env（不額外依賴 dotenv，手寫極簡版） ---- */
(function loadEnv(){
  const envPath = path.join(__dirname, ".env");
  if(!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for(const line of lines){
    const trimmed = line.trim();
    if(!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if(idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))){
      val = val.slice(1, -1);
    }
    if(!(key in process.env)) process.env[key] = val;
  }
})();

const { JsonStore } = require("./jsonstore");
const { lookupCoords, normalize } = require("./tw-districts");

const PORT = Number(process.env.PORT || 3000);
const OWM_KEY = process.env.OPENWEATHER_API_KEY || "";
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_API_KEY || "";
const GOOGLE_AI_MODEL = process.env.GOOGLE_AI_MODEL || "gemini-2.0-flash";
const WEATHER_CACHE_MS = 4 * 60 * 60 * 1000; // 4 小時
const IDENTIFY_DAILY_LIMIT = Number(process.env.IDENTIFY_DAILY_LIMIT || 10);
const DATA_DIR = path.join(__dirname, "data");

const weatherStore = new JsonStore(path.join(DATA_DIR, "weather-cache.json"), () => ({}));
const identifyCacheStore = new JsonStore(path.join(DATA_DIR, "identify-cache.json"), () => ({}));
const usageStore = new JsonStore(path.join(DATA_DIR, "usage.json"), () => ({}));

function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function bumpUsage(kind){
  const day = todayKey();
  if(!usageStore.data[day]) usageStore.data[day] = { weather: 0, identify: 0 };
  usageStore.data[day][kind] = (usageStore.data[day][kind] || 0) + 1;
  // 只保留最近 14 天，避免檔案一直長大
  const keys = Object.keys(usageStore.data).sort();
  while(keys.length > 14){ delete usageStore.data[keys.shift()]; }
  usageStore.save();
  return usageStore.data[day][kind];
}
function getUsage(){
  const day = todayKey();
  const today = usageStore.data[day] || { weather: 0, identify: 0 };
  return {
    date: day,
    weatherCallsToday: today.weather || 0,
    identifyCallsToday: today.identify || 0,
    identifyDailyLimit: IDENTIFY_DAILY_LIMIT,
    identifyRemainingToday: Math.max(0, IDENTIFY_DAILY_LIMIT - (today.identify || 0))
  };
}

/* ---------------------------------------------------------
   天氣：依「城市＋行政區」查快取，過期或沒有才真的打 OpenWeatherMap
--------------------------------------------------------- */
function weatherCacheKey(city, district){
  return `${normalize(city)}|${normalize(district)}`;
}

async function resolveCoords(city, district){
  const local = lookupCoords(city, district);
  if(local) return local;
  // 本地表查不到 → 用 OpenWeatherMap Geocoding API 查一次（結果不快取地址，只快取天氣本身）
  const q = encodeURIComponent(`${district || ""}${district ? "," : ""}${city || ""},TW`);
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${q}&limit=1&appid=${OWM_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if(!res.ok) throw new Error(`geocoding 失敗 (${res.status})`);
  const arr = await res.json();
  if(!arr || !arr.length) throw new Error("找不到這個地區的座標，請確認縣市／行政區名稱是否正確");
  return { lat: arr[0].lat, lon: arr[0].lon, source: "geocoding-api" };
}

function mapOwmToView(json){
  const w = (json.weather && json.weather[0]) || {};
  const main = json.main || {};
  const owmMain = (w.main || "").toLowerCase();
  const isRain = /rain|drizzle|thunderstorm/.test(owmMain);
  const isSnow = /snow/.test(owmMain);
  let icon = "icon-cloud";
  if(isRain) icon = "icon-cloud-rain";
  else if((main.temp_max != null ? main.temp_max : main.temp) >= 30 && owmMain === "clear") icon = "icon-sun";
  else if(owmMain === "clear") icon = "icon-sun";
  return {
    tempCurrent: main.temp != null ? Math.round(main.temp) : null,
    tempHigh: main.temp_max != null ? Math.round(main.temp_max) : (main.temp != null ? Math.round(main.temp) : null),
    tempLow: main.temp_min != null ? Math.round(main.temp_min) : (main.temp != null ? Math.round(main.temp) : null),
    humidity: main.humidity != null ? main.humidity : null,
    isRain, isSnow,
    condition: w.description || (isRain ? "有雨" : "晴朗"),
    icon,
    source: "live"
  };
}

async function fetchLiveWeather(city, district){
  if(!OWM_KEY) throw new Error("伺服器尚未設定 OPENWEATHER_API_KEY");
  const { lat, lon } = await resolveCoords(city, district);
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=zh_tw&appid=${OWM_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if(!res.ok){
    const text = await res.text().catch(() => "");
    throw new Error(`OpenWeatherMap 回應錯誤 (${res.status}) ${text.slice(0,200)}`);
  }
  const json = await res.json();
  bumpUsage("weather");
  return mapOwmToView(json);
}

async function getWeather(city, district){
  const key = weatherCacheKey(city, district);
  const cached = weatherStore.data[key];
  const now = Date.now();
  if(cached && (now - cached.fetchedAt) < WEATHER_CACHE_MS){
    return { ...cached.data, cached: true, cacheAgeMinutes: Math.round((now - cached.fetchedAt) / 60000) };
  }
  try{
    const data = await fetchLiveWeather(city, district);
    weatherStore.data[key] = { data, fetchedAt: now };
    weatherStore.save();
    return { ...data, cached: false, cacheAgeMinutes: 0 };
  }catch(err){
    // 打不到即時資料時，若有舊快取（就算過期）也先給，好過完全沒有
    if(cached){
      return { ...cached.data, cached: true, stale: true, cacheAgeMinutes: Math.round((now - cached.fetchedAt) / 60000) };
    }
    throw err;
  }
}

/* ---------------------------------------------------------
   AI 品種辨識：相同照片打過一次後直接用快取，不重複呼叫；
   每天最多呼叫 IDENTIFY_DAILY_LIMIT 次。
--------------------------------------------------------- */
function hashImage(base64){
  return crypto.createHash("sha256").update(base64).digest("hex");
}

function extractJsonBlock(text){
  const fence = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const match = candidate.match(/\{[\s\S]*\}/);
  if(!match) throw new Error("AI 回應無法解析為 JSON：" + text.slice(0, 200));
  return JSON.parse(match[0]);
}

async function callGeminiIdentify(base64, mimeType){
  if(!GOOGLE_AI_KEY) throw new Error("伺服器尚未設定 GOOGLE_AI_API_KEY");
  const prompt = "你是植物辨識專家。請辨識這張照片中的植物品種，並「只」以下面的 JSON 格式回覆，不要加任何其他文字或 markdown 標記：\n" +
    '{"name":"中文常見品種名","latin":"學名（不確定可留空）","confidence":0到100之間的整數,"note":"一句話的補充說明，例如判斷依據或不確定的原因"}\n' +
    "如果無法判斷精確品種，name 請填寫最接近的植物類型描述（例如「多肉植物」、「蕨類植物」），不要編造不存在的品種名稱。";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_AI_MODEL}:generateContent?key=${GOOGLE_AI_KEY}`;
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType || "image/webp", data: base64 } }
      ]
    }],
    generationConfig: { temperature: 0.2 }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  if(!res.ok){
    const text = await res.text().catch(() => "");
    throw new Error(`Google AI 回應錯誤 (${res.status}) ${text.slice(0,300)}`);
  }
  const json = await res.json();
  const text = json.candidates && json.candidates[0] && json.candidates[0].content &&
    json.candidates[0].content.parts && json.candidates[0].content.parts.map(p => p.text || "").join("");
  if(!text) throw new Error("Google AI 沒有回傳可用的內容（可能被安全過濾攔截）");
  const parsed = extractJsonBlock(text);
  return {
    name: String(parsed.name || "").trim() || "無法辨識",
    latin: String(parsed.latin || "").trim(),
    confidence: Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(parsed.confidence)))) : null,
    note: String(parsed.note || "").trim()
  };
}

/* ---------------------------------------------------------
   Express App
--------------------------------------------------------- */
const app = express();
app.use(express.json({ limit: "8mb" }));

app.get("/api/weather", async (req, res) => {
  const city = String(req.query.city || "").trim();
  const district = String(req.query.district || "").trim();
  if(!city){ return res.status(400).json({ error: "請提供 city 參數" }); }
  try{
    const data = await getWeather(city, district);
    res.json({ ok: true, city, district, ...data });
  }catch(err){
    console.error("[/api/weather]", err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.post("/api/identify-plant", async (req, res) => {
  try{
    const imageBase64Full = String((req.body && req.body.imageBase64) || "");
    if(!imageBase64Full){ return res.status(400).json({ ok:false, error: "缺少 imageBase64" }); }
    const m = imageBase64Full.match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = m ? m[1] : "image/webp";
    const base64 = m ? m[2] : imageBase64Full;

    const hash = hashImage(base64);
    if(identifyCacheStore.data[hash]){
      return res.json({ ok: true, cached: true, ...identifyCacheStore.data[hash].result, usage: getUsage() });
    }

    const usageBefore = getUsage();
    if(usageBefore.identifyRemainingToday <= 0){
      return res.status(429).json({ ok:false, error: "DAILY_LIMIT_REACHED", message: `今日 AI 辨識次數已達上限（每日 ${IDENTIFY_DAILY_LIMIT} 次），請手動輸入品種，或明天再試。`, usage: usageBefore });
    }

    const result = await callGeminiIdentify(base64, mimeType);
    bumpUsage("identify");
    identifyCacheStore.data[hash] = { result, at: Date.now() };
    // 快取檔案避免無限長大：超過 300 筆時砍掉最舊的一半
    const keys = Object.keys(identifyCacheStore.data);
    if(keys.length > 300){
      keys.sort((a,b) => identifyCacheStore.data[a].at - identifyCacheStore.data[b].at);
      keys.slice(0, 150).forEach(k => delete identifyCacheStore.data[k]);
    }
    identifyCacheStore.save();

    res.json({ ok: true, cached: false, ...result, usage: getUsage() });
  }catch(err){
    console.error("[/api/identify-plant]", err.message);
    res.status(502).json({ ok:false, error: err.message });
  }
});

app.get("/api/usage", (req, res) => { res.json({ ok: true, ...getUsage() }); });

/* ---- 靜態檔案：把整個 App 一起服務起來 ---- */
app.use(express.static(path.join(__dirname, "..")));

app.listen(PORT, () => {
  console.log(`\n🌱 小綠日記伺服器已啟動： http://localhost:${PORT}`);
  console.log(`   在手機瀏覽器打開這個網址（需同一個 Wi-Fi，或改用手機也能連到的網址），再「加入主畫面」即可安裝。`);
  if(!OWM_KEY) console.warn("   [警告] 尚未設定 OPENWEATHER_API_KEY，天氣功能會回傳錯誤，前端會自動改用模擬天氣。");
  if(!GOOGLE_AI_KEY) console.warn("   [警告] 尚未設定 GOOGLE_AI_API_KEY，AI 辨識功能會回傳錯誤，前端會自動改用手動輸入。");
});
