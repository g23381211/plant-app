/* ==========================================================
   小綠日記 — app.js
   Vanilla JS / LocalStorage / 動態重算邏輯
   ========================================================== */
(function(){
"use strict";

/* ---------------------------------------------------------
   0. 小工具 Utilities
--------------------------------------------------------- */
function pad2(n){ return String(n).padStart(2,"0"); }
function uid(){ return "id-" + Math.random().toString(36).slice(2,9) + Date.now().toString(36); }
function todayDateStr(){ const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function nowTimeStr(){ const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function combineDateTime(dateStr, timeStr){ return new Date(`${dateStr}T${(timeStr||"09:00")}:00`); }
function addDays(date, days){ const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function diffDays(a, b){ return Math.round((new Date(b) - new Date(a)) / 86400000); }
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function fmtDateHuman(iso){ if(!iso) return "—"; const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()}`; }
function fmtDateTimeHuman(iso){ if(!iso) return "—"; const d = new Date(iso); return `${d.getMonth()+1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function fmtWeekday(date){ const w = ["週日","週一","週二","週三","週四","週五","週六"]; return w[date.getDay()]; }
function fmtRelativeDay(iso){
  if(!iso) return "尚未設定";
  const now = new Date();
  const target = new Date(iso);
  const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((dayStart(target) - dayStart(now)) / 86400000);
  if(diff === 0) return "今天";
  if(diff === 1) return "明天";
  if(diff === -1) return "昨天（已過期）";
  if(diff < -1) return `已過期 ${Math.abs(diff)} 天`;
  return `${diff} 天後`;
}
function escapeHtml(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashString(str){
  let h = 2166136261;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* ---------------------------------------------------------
   1. 植物品種資料庫 (照顧指南模板)
--------------------------------------------------------- */
const SPECIES_DB = {
  "真柏": {
    latin: "Shimpaku Juniper",
    intro: "真柏是盆景常見樹種，耐旱性強、生長緩慢，適合半戶外栽培，透過修剪雕塑展現枝幹線條之美。",
    placement: "建議放置於半戶外、日照充足且通風良好處，避免長時間淋雨造成根部悶濕。",
    light: "需要每日至少 4-6 小時日照，光線不足枝葉容易徒長、葉色轉淡。",
    watering: "待表土完全乾燥後再澆透水，避免長期潮濕；真柏耐旱不耐澇。",
    soilJudge: "以竹籤插入土中 2-3 公分，感覺乾燥即可澆水；盆器偏重代表仍濕潤，可再等等。",
    drainageText: "建議使用排水良好的赤玉土或盆景專用介質，避免積水爛根。",
    humidity: "一般空氣濕度即可，不需特別加濕。",
    fertilizeText: "生長季（春、秋）每 4-6 週施一次緩效肥，夏冬減少施肥。",
    pruneText: "配合雕塑造型，每 2-3 個月修剪一次徒長枝，維持樹形。",
    repotText: "每 2 年換盆一次並適度修根，建議於春季進行。",
    pests: "留意介殼蟲與紅蜘蛛，通風不良時較容易發生，可用清水沖洗葉背。",
    base: { soilCheckDays: 3, fertilizeDays: 35, pruneDays: 75, repotDays: 730, photoDays: 14 }
  },
  "小豆樹": {
    latin: "Sophora prostrata",
    intro: "小豆樹枝葉細緻、樹形優雅，喜歡明亮環境與良好通風，是很受歡迎的小品盆栽樹種。",
    placement: "適合放在室內窗邊或陽台明亮處，避免正中午強烈直射造成葉片曬傷。",
    light: "需要明亮散射光或每日 2-4 小時柔和日照，光線太暗容易落葉。",
    watering: "表土乾燥後再澆透水，澆水前先確認盆土是否仍潮濕，避免過度澆水。",
    soilJudge: "觀察表土顏色由深轉淺、觸摸乾燥即可澆水，也可用手掂盆器重量判斷。",
    drainageText: "介質需排水良好，可混合珍珠石增加透氣性。",
    humidity: "喜歡稍高濕度環境，乾燥季節可適度增加空氣濕度。",
    fertilizeText: "生長季每 4 週施一次液肥或緩效肥，促進枝葉生長。",
    pruneText: "每 2-3 個月修剪一次，適度摘心可促進分枝、維持樹形緊緻。",
    repotText: "每 1-2 年換盆一次，根系較密時建議提早換盆。",
    pests: "注意蚜蟲與介殼蟲，新芽較容易受害，可定期檢查葉背與新梢。",
    base: { soilCheckDays: 2, fertilizeDays: 28, pruneDays: 70, repotDays: 545, photoDays: 14 }
  },
  "文竹": {
    latin: "Asparagus setaceus",
    intro: "文竹葉形纖細如羽毛，姿態飄逸，是經典的室內觀葉植物，特別喜歡潮濕的空氣環境。",
    placement: "適合放在室內散射光處，避免陽光直射導致葉片乾枯泛黃。",
    light: "喜歡明亮散射光，可放在窗邊但避開正午強光。",
    watering: "保持土壤微濕、不積水；表土乾燥即可澆水，避免完全乾透。",
    soilJudge: "表土觸摸乾燥即可澆水，文竹不耐乾旱，土壤不宜完全乾透過久。",
    drainageText: "介質需保水又排水良好，可混合泥炭土與珍珠石。",
    humidity: "需要較高空氣濕度，建議每日噴水霧 1-2 次，尤其在冷氣房或乾燥季節。",
    fertilizeText: "生長季每 3-4 週施一次稀釋液肥。",
    pruneText: "定期修剪枯黃細枝，維持通風與美觀，約每 2 個月一次。",
    repotText: "根系生長快，建議每年換盆一次並更新介質。",
    pests: "注意介殼蟲與紅蜘蛛，空氣過於乾燥時風險提高，勤噴水霧可預防。",
    base: { soilCheckDays: 2, fertilizeDays: 24, pruneDays: 60, repotDays: 365, photoDays: 10 }
  },
  "鹿角蕨": {
    latin: "Platycerium",
    intro: "鹿角蕨為附生植物，常見上板或吊掛栽培，葉形奇特分為營養葉與孢子葉，喜歡通風潮濕的環境。",
    placement: "適合上板懸掛於室內通風處，避免陽光直射，喜歡明亮散射光。",
    light: "需要明亮散射光，忌強烈直射陽光，光線太暗則生長緩慢。",
    watering: "採用「泡盆／泡水」方式澆水，將水苔或板材整個浸泡至吸飽水分後取出瀝乾。",
    soilJudge: "觸摸水苔或營養葉基部，感覺輕盈乾燥即可進行泡水；掂起來偏重代表仍濕潤。",
    drainageText: "以水苔或蛇木板栽培為主，需良好通風避免悶濕發霉。",
    humidity: "喜歡高濕度環境，乾燥時可搭配噴霧增加空氣濕度。",
    fertilizeText: "生長季每 4-6 週於泡水時添加稀釋液肥一次。",
    pruneText: "枯黃營養葉可保留作天然覆蓋，不需頻繁修剪，僅需移除腐爛部位。",
    repotText: "約每 1-2 年重新固定水苔或更換板材一次。",
    pests: "注意介殼蟲藏於營養葉下方，通風不良時較易發生。",
    base: { soilCheckDays: 5, fertilizeDays: 35, pruneDays: 90, repotDays: 545, photoDays: 14 }
  },
  "__default__": {
    latin: "",
    intro: "這是一株可愛的植物，持續記錄澆水與生長狀況，就能慢慢掌握牠的照顧節奏。",
    placement: "依植物習性放置在合適的光線與通風環境。",
    light: "觀察葉片狀態調整擺放位置，避免長時間強烈直射或過度陰暗。",
    watering: "待表土乾燥後再澆透水，避免長期積水。",
    soilJudge: "以手指插入土中 2-3 公分感受濕度，乾燥即可澆水。",
    drainageText: "使用排水良好的介質，避免根部長期潮濕。",
    humidity: "依植物習性維持適當空氣濕度。",
    fertilizeText: "生長季每 4-6 週施一次肥料。",
    pruneText: "視生長狀況定期修剪，維持株型。",
    repotText: "約 1-2 年換盆一次。",
    pests: "定期檢查葉片與土壤，及早發現病蟲害徵兆。",
    base: { soilCheckDays: 3, fertilizeDays: 30, pruneDays: 75, repotDays: 545, photoDays: 14 }
  }
};
function speciesTemplate(name){ return SPECIES_DB[name] || SPECIES_DB.__default__; }

const ENV_LABEL = { indoor: "室內", semi: "半戶外", outdoor: "戶外" };
const ENV_ICON = { indoor: "icon-home", semi: "icon-cloud", outdoor: "icon-sun" };

const TYPE_LABEL = { water:"澆水", fertilize:"施肥", prune:"修剪", repot:"換盆", move:"移動位置", pest:"病蟲害處理", diary:"成長日記", rain:"淋雨", snooze:"延後提醒" };
const TYPE_ICON  = { water:"icon-drop", fertilize:"icon-leaf", prune:"icon-scissors", repot:"icon-pot", move:"icon-move", pest:"icon-warn", diary:"icon-edit", rain:"icon-cloud-rain", snooze:"icon-clock" };
const LOG_TYPE_TO_LAST = { water:"lastWateredAt", fertilize:"lastFertilizedAt", prune:"lastPrunedAt", repot:"lastRepottedAt" };
const LOG_TYPE_TO_NEXT = { water:"nextSoilCheckAt", fertilize:"nextFertilizeAt", prune:"nextPruneAt", repot:"nextRepotAt" };
const LOG_TYPE_TO_INTERVAL = { water:"soilCheckIntervalDays", fertilize:"fertilizeIntervalDays", prune:"pruneIntervalDays", repot:"repotIntervalDays" };

/* ---------------------------------------------------------
   2. 天氣
   真實資料來源：後端 /api/weather（OpenWeatherMap 代理，同一
   行政區 4 小時內共用快取，金鑰只存在伺服器上）。
   找不到後端／離線時，自動退回本機模擬天氣，不會讓 App 壞掉。
--------------------------------------------------------- */
/* ---- Supabase 設定：換成你自己專案的值（部署教學裡有截圖說明去哪裡複製） ----
   SUPABASE_FUNCTIONS_URL：Supabase 專案的 Edge Functions 網址，
     格式固定是 https://你的專案代號.supabase.co/functions/v1
   SUPABASE_ANON_KEY：Supabase 專案的 anon public key。
     這把 key 設計上就是給前端公開呼叫用的「公開金鑰」，不是機密
     （真正機密的是 OpenWeatherMap／Google AI 的金鑰，那兩把只會存在
      Supabase 的 Edge Function secrets 裡，不會出現在這支前端檔案中）。
   兩個值都還沒填的話（還是預留字串），天氣／AI 辨識會抓取失敗，
   App 會自動退回本機模擬資料，不會整個壞掉。 */
const SUPABASE_FUNCTIONS_URL = "https://wvqqmxvkdaeswxpdcdur.supabase.co/functions/v1";
const SUPABASE_ANON_KEY = "sb_publishable_HDbfTcmhJW9j0n2D6NzY3Q_NvQONRBl";
const API_BASE = SUPABASE_FUNCTIONS_URL;
function supabaseHeaders(extra){
  return Object.assign({ apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY }, extra || {});
}
const WEATHER_CLIENT_TTL_MS = 4 * 60 * 60 * 1000; // 與後端一致：4 小時
const WEATHER_RETRY_MS = 10 * 60 * 1000; // 若剛剛失敗（例如金鑰還沒填、或網路問題），10 分鐘後才重試，避免一直狂打

function getMockWeather(region, dateStr){
  const seed = hashString((region || "台北市") + dateStr);
  const rng = mulberry32(seed);
  const tempHigh = 22 + Math.floor(rng() * 12);
  const tempLow = tempHigh - 5 - Math.floor(rng() * 4);
  const humidity = 50 + Math.floor(rng() * 40);
  const isRain = rng() < 0.35;
  let condition = isRain ? "有雨" : (tempHigh >= 30 ? "晴朗炎熱" : "晴朗舒適");
  return { tempHigh, tempLow, humidity, isRain, condition, icon: isRain ? "icon-cloud-rain" : (tempHigh >= 30 ? "icon-sun" : "icon-cloud"), isMock: true };
}
function weatherIcon(w){ return (w && w.icon) || (w && w.isRain ? "icon-cloud-rain" : (w && w.tempHigh >= 30 ? "icon-sun" : "icon-cloud")); }

/* 前端這層快取只是為了「同一個裝置不要每次畫面重繪都打後端」，
   真正跨使用者共用的 4 小時快取是在後端（server.js）做的。 */
const weatherClientCache = {}; // key -> { data, fetchedAt, failedAt }
function weatherKey(city, district){ return `${(city||"").trim()}|${(district||"").trim()}`; }

async function fetchWeatherFromServer(city, district){
  const url = `${API_BASE}/weather?city=${encodeURIComponent(city||"")}&district=${encodeURIComponent(district||"")}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(9000), headers: supabaseHeaders() });
  const json = await res.json().catch(() => null);
  if(!res.ok || !json || json.ok === false){
    throw new Error((json && json.error) || `HTTP ${res.status}`);
  }
  return json;
}

/* 立即回傳「目前手邊最好的天氣資料」給同步的 render 用；
   同時視情況在背景觸發一次真正的抓取，抓到後會重新渲染首頁。 */
function getWeatherSync(city, district){
  const key = weatherKey(city, district);
  const entry = weatherClientCache[key];
  const now = Date.now();
  const fresh = entry && entry.data && (now - entry.fetchedAt) < WEATHER_CLIENT_TTL_MS;
  const recentlyFailed = entry && entry.failedAt && (now - entry.failedAt) < WEATHER_RETRY_MS;

  if(!fresh && !recentlyFailed && !(entry && entry.loading)){
    weatherClientCache[key] = weatherClientCache[key] || {};
    weatherClientCache[key].loading = true;
    fetchWeatherFromServer(city, district)
      .then(data => {
        weatherClientCache[key] = { data, fetchedAt: Date.now(), loading: false };
        if(screenStack[screenStack.length-1] === "home") renderHome();
      })
      .catch(err => {
        console.warn("天氣抓取失敗，改用模擬天氣：", err.message);
        weatherClientCache[key] = { ...(weatherClientCache[key]||{}), failedAt: Date.now(), loading: false };
      });
  }
  if(entry && entry.data) return entry.data;
  return getMockWeather(city, todayDateStr());
}

function getWeatherAdjustment(plant){
  const w = getWeatherSync(plant.region, plant.district);
  let delta = 0, note = "";
  if(plant.environment !== "indoor"){
    if(w.isRain){ delta = 1; note = "今天有降雨，已自動延後土壤檢查時間"; }
    else if(w.tempHigh >= 30){ delta = -1; note = "天氣高溫，已提早檢查土壤乾燥狀況"; }
  } else {
    if(plant.settings && plant.settings.acUsage){ delta = -1; note = "室內有使用冷氣、空氣較乾燥，已提早檢查"; }
    else if(plant.settings && plant.settings.lightLevel === "low"){ delta = 1; note = "光線較弱、土壤乾燥較慢，已延後檢查"; }
  }
  return { delta, note, weather: w };
}

/* ---------------------------------------------------------
   3. 手繪風佔位圖片 (無真實照片時使用)
--------------------------------------------------------- */
const PLACEHOLDER_PALETTE = ["#FFE9A8","#FFD9C2","#E4EFC7","#D7E8EC","#F3D9E6"];
function placeholderPhoto(seedText){
  const seed = hashString(seedText || "plant");
  const bg = PLACEHOLDER_PALETTE[seed % PLACEHOLDER_PALETTE.length];
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
    <rect x="4" y="4" width="292" height="292" rx="28" fill="${bg}" stroke="#221D14" stroke-width="7"/>
    <path d="M95 235 H205 L192 175 H108 Z" fill="#FFFCF3" stroke="#221D14" stroke-width="7" stroke-linejoin="round"/>
    <path d="M150 175 V90" fill="none" stroke="#221D14" stroke-width="7" stroke-linecap="round"/>
    <path d="M150 130 C120 120 95 95 90 60 C130 60 155 85 158 118 Z" fill="#FFFCF3" stroke="#221D14" stroke-width="6.5" stroke-linejoin="round"/>
    <path d="M150 105 C178 96 202 75 208 46 C172 44 150 68 146 98 Z" fill="#FFFCF3" stroke="#221D14" stroke-width="6.5" stroke-linejoin="round"/>
    <path d="M150 150 C132 145 112 128 106 105" fill="none" stroke="#221D14" stroke-width="5" stroke-linecap="round"/>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/* ---------------------------------------------------------
   4. 資料模型 / LocalStorage
--------------------------------------------------------- */
const STORAGE_KEY = "plantAppData_v1";
let state = null;
let currentPlantId = null;
let screenStack = ["home"];
let currentDetailTab = "guide";

function loadState(){
  try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw) return JSON.parse(raw); }
  catch(e){ console.warn("讀取資料失敗", e); }
  return null;
}
function saveState(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch(e){ console.warn("儲存資料失敗（可能是儲存空間不足）", e); showToast("儲存空間不足，部分資料可能未儲存"); }
}
function getPlant(id){ return state.plants.find(p => p.id === id); }

function newPlantSkeleton(){
  return { purchaseLocation:"", windowDirection:"", sunHours:"", lightLevel:"", ventilation:"", acUsage:false, growLight:false, potMaterial:"", drainage:"" };
}

function computePlanFromSpecies(speciesName, startISO){
  const t = speciesTemplate(speciesName);
  return {
    soilCheckIntervalDays: t.base.soilCheckDays,
    fertilizeIntervalDays: t.base.fertilizeDays,
    pruneIntervalDays: t.base.pruneDays,
    repotIntervalDays: t.base.repotDays,
    photoIntervalDays: t.base.photoDays,
    lastWateredAt: startISO,
    lastSoilCheckAt: startISO,
    lastFertilizedAt: null,
    lastPrunedAt: null,
    lastRepottedAt: null,
    lastPhotoAt: null,
    nextSoilCheckAt: addDays(new Date(startISO), t.base.soilCheckDays).toISOString(),
    nextFertilizeAt: null,
    nextPruneAt: null,
    nextRepotAt: null,
    avgWaterIntervalDays: t.base.soilCheckDays,
    lastAdjustNote: ""
  };
}

function createPlant(opts){
  const startISO = combineDateTime(opts.startDate || todayDateStr(), "09:00").toISOString();
  const plant = {
    id: uid(),
    name: opts.name || "未命名植物",
    species: opts.species || "",
    photo: opts.photo || null,
    region: opts.region || "台北市",
    district: opts.district || "",
    environment: opts.environment || "indoor",
    startDate: opts.startDate || todayDateStr(),
    settings: newPlantSkeleton(),
    plan: computePlanFromSpecies(opts.species, startISO),
    logs: []
  };
  return plant;
}

/* ---- 種子示範資料：四筆預設植物 ---- */
function daysAgoISO(n, hh, mm){ const d = addDays(new Date(), -n); d.setHours(hh||9, mm||0, 0, 0); return d.toISOString(); }
function daysAgoDateStr(n){ const d = addDays(new Date(), -n); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

function seedLog(type, daysAgo, note, opts){
  opts = opts || {};
  return { id: uid(), type, actualAt: daysAgoISO(daysAgo, opts.hh, opts.mm), note: note || "", photos: opts.photos || [], backfilled: !!opts.backfilled, createdAt: daysAgoISO(daysAgo) };
}

function buildSeedState(){
  const plants = [];

  // 1. 真柏 — 半戶外盆景
  let p = createPlant({ name:"真柏", species:"真柏", region:"台北市", district:"松山區", environment:"semi", startDate: daysAgoDateStr(52) });
  p.settings = Object.assign(p.settings, { purchaseLocation:"花市", windowDirection:"south", sunHours:"long", lightLevel:"direct", ventilation:"good", potMaterial:"clay", drainage:"fast" });
  p.logs = [
    seedLog("water", 21, "澆透水，順便檢查枝條", {hh:8,mm:30}),
    seedLog("prune", 18, "修剪雕塑，調整枝幹線條"),
    seedLog("water", 17, "表土已乾，澆透水", {hh:8,mm:0, backfilled:true}),
    seedLog("water", 14, "表土已乾，澆透水", {hh:8,mm:10}),
    seedLog("fertilize", 10, "施一次緩效肥"),
    seedLog("water", 11, "澆透水", {hh:8,mm:5}),
    seedLog("water", 8, "澆透水", {hh:7,mm:50}),
    seedLog("diary", 8, "枝葉狀態不錯，顏色很飽滿", {photos:[placeholderPhoto("shimpaku-diary")]}),
    seedLog("water", 5, "澆透水", {hh:8,mm:20}),
    seedLog("water", 2, "澆透水", {hh:8,mm:0})
  ];
  applyLogsToPlan(p);
  plants.push(p);

  // 2. 小豆樹 — 室內/陽台明亮處
  p = createPlant({ name:"小豆樹", species:"小豆樹", region:"新北市", district:"板橋區", environment:"indoor", startDate: daysAgoDateStr(26) });
  p.settings = Object.assign(p.settings, { purchaseLocation:"園藝店", windowDirection:"east", sunHours:"mid", lightLevel:"bright-indirect", ventilation:"ok", potMaterial:"ceramic", drainage:"normal" });
  p.logs = [
    seedLog("water", 16, "表土乾燥，澆透水", {hh:19,mm:0}),
    seedLog("water", 13, "表土乾燥，澆透水", {hh:19,mm:10}),
    seedLog("prune", 10, "摘心促進分枝"),
    seedLog("water", 10, "澆透水", {hh:19,mm:0}),
    seedLog("water", 7, "澆透水", {hh:18,mm:40}),
    seedLog("diary", 6, "冒出好多新芽！", {photos:[placeholderPhoto("sophora-diary")]}),
    seedLog("water", 4, "澆透水", {hh:19,mm:5}),
    seedLog("water", 1, "澆透水", {hh:18,mm:50})
  ];
  applyLogsToPlan(p);
  plants.push(p);

  // 3. 文竹 — 室內散射光，高濕度
  p = createPlant({ name:"文竹", species:"文竹", region:"台北市", district:"大安區", environment:"indoor", startDate: daysAgoDateStr(34) });
  p.settings = Object.assign(p.settings, { purchaseLocation:"網路商店", windowDirection:"north", sunHours:"short", lightLevel:"bright-indirect", ventilation:"ok", acUsage:true, potMaterial:"plastic", drainage:"normal" });
  p.logs = [
    seedLog("water", 12, "表土微乾，澆水並噴霧", {hh:9,mm:0}),
    seedLog("diary", 9, "葉子有點乾尖，加強噴水霧觀察中"),
    seedLog("water", 8, "澆水", {hh:9,mm:15}),
    seedLog("water", 5, "澆水＋噴霧", {hh:9,mm:0}),
    seedLog("water", 3, "澆水＋噴霧", {hh:8,mm:50}),
    seedLog("water", 1, "澆水＋噴霧", {hh:9,mm:0})
  ];
  applyLogsToPlan(p);
  plants.push(p);

  // 4. 鹿角蕨 — 上板植物，泡盆澆水
  p = createPlant({ name:"鹿角蕨", species:"鹿角蕨", region:"高雄市", district:"三民區", environment:"indoor", startDate: daysAgoDateStr(70) });
  p.settings = Object.assign(p.settings, { purchaseLocation:"植物專門店", windowDirection:"west", sunHours:"mid", lightLevel:"bright-indirect", ventilation:"good", potMaterial:"clay", drainage:"fast" });
  p.logs = [
    seedLog("water", 23, "整板浸泡 15 分鐘後瀝乾", {hh:10,mm:0}),
    seedLog("repot", 20, "重新固定水苔"),
    seedLog("water", 18, "整板浸泡瀝乾", {hh:10,mm:0}),
    seedLog("diary", 15, "營養葉越長越大片了", {photos:[placeholderPhoto("platycerium-diary")]}),
    seedLog("water", 13, "泡水法澆水", {hh:10,mm:10}),
    seedLog("water", 8, "泡水法澆水", {hh:10,mm:0}),
    seedLog("water", 3, "泡水法澆水", {hh:9,mm:45})
  ];
  applyLogsToPlan(p);
  plants.push(p);

  return {
    plants,
    settings: { notifyTime:"08:00", quietStart:"22:00", quietEnd:"07:00", mergeNotifications:false, travelMode:false, weatherRegion:"台北市" },
    dismissedToday: { date: "", ids: [] }
  };
}

/* ---------------------------------------------------------
   5. 動態重算核心邏輯
--------------------------------------------------------- */
function recalcType(plant, type){
  const logs = plant.logs.filter(l => l.type === type).sort((a,b) => new Date(a.actualAt) - new Date(b.actualAt));
  if(!logs.length) return;
  const latest = logs[logs.length - 1];
  plant.plan[LOG_TYPE_TO_LAST[type]] = latest.actualAt;

  let interval = plant.plan[LOG_TYPE_TO_INTERVAL[type]];
  if(type === "water"){
    const adj = getWeatherAdjustment(plant);
    interval = clamp(interval + adj.delta, 1, interval + 3);
    plant.plan.lastAdjustNote = adj.note;
    if(logs.length >= 2){
      const diffs = [];
      for(let i=1;i<logs.length;i++) diffs.push(diffDays(logs[i-1].actualAt, logs[i].actualAt));
      const avg = diffs.reduce((a,b)=>a+b,0) / diffs.length;
      plant.plan.avgWaterIntervalDays = Math.max(1, Math.round(avg));
    }
  }
  const next = addDays(new Date(latest.actualAt), interval);
  next.setHours(9,0,0,0);
  plant.plan[LOG_TYPE_TO_NEXT[type]] = next.toISOString();
}

function applyLogsToPlan(plant){
  ["water","fertilize","prune","repot"].forEach(t => recalcType(plant, t));
  const photoLogs = plant.logs.filter(l => l.photos && l.photos.length).sort((a,b)=> new Date(a.actualAt)-new Date(b.actualAt));
  if(photoLogs.length) plant.plan.lastPhotoAt = photoLogs[photoLogs.length-1].actualAt;
}

function addLog(plantId, data){
  const plant = getPlant(plantId);
  if(!plant) return null;
  const date = data.date || todayDateStr();
  const time = data.time || nowTimeStr();
  const actualAt = combineDateTime(date, time).toISOString();
  const backfilled = date < todayDateStr();
  const log = { id: uid(), type: data.type, actualAt, note: data.note || "", photos: data.photos || [], backfilled, createdAt: new Date().toISOString() };
  plant.logs.push(log);
  if(LOG_TYPE_TO_NEXT[data.type]) recalcType(plant, data.type);
  if(log.photos.length) plant.plan.lastPhotoAt = actualAt;
  saveState();
  return log;
}

function pushBackDate(iso, days){
  const base = iso ? new Date(iso) : new Date();
  const d = addDays(base, days);
  d.setHours(9,0,0,0);
  return d.toISOString();
}
/* 延後提醒：若原訂時間還在未來就從原訂時間再延後；若已經過期或尚未設定，改從現在開始算，
   確保「延後」永遠會得到一個未來的日期，不會停留在過去。 */
function delayReminder(iso, days){
  const now = new Date();
  const base = (iso && new Date(iso) > now) ? new Date(iso) : now;
  const d = addDays(base, days);
  d.setHours(9,0,0,0);
  return d.toISOString();
}

/* ---------------------------------------------------------
   6. Modal / Toast
--------------------------------------------------------- */
const backdrop = () => document.getElementById("modalBackdrop");
function openModal(id){
  document.querySelectorAll("#modalBackdrop .modal").forEach(m => m.classList.remove("open"));
  document.getElementById(id).classList.add("open");
  backdrop().classList.add("open");
}
function closeModal(){
  backdrop().classList.remove("open");
  document.querySelectorAll("#modalBackdrop .modal").forEach(m => m.classList.remove("open"));
}
let toastTimer = null;
let toastUndoHandler = null;
function showToast(text, onUndo){
  const t = document.getElementById("toastModal");
  document.getElementById("toastText").textContent = text;
  const undoBtn = document.getElementById("toastUndoBtn");
  toastUndoHandler = onUndo || null;
  undoBtn.hidden = !onUndo;
  t.classList.add("open");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("open"); toastUndoHandler = null; }, onUndo ? 5000 : 2600);
}

/* ---------------------------------------------------------
   7. 導覽 / 畫面切換
--------------------------------------------------------- */
function render(screen){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById("screen-" + screen).classList.add("active");

  const mainTab = screenStack[0];
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.nav === mainTab));

  if(screen === "home") renderHome();
  else if(screen === "plants") renderPlantsGrid();
  else if(screen === "detail") renderDetail();
  else if(screen === "add") renderWizard();
  else if(screen === "plant-settings") renderPlantSettingsForm();
  else if(screen === "gallery") renderGallery();
  else if(screen === "settings") renderSettingsScreen();

  window.scrollTo(0,0);
}
function switchTab(name){ screenStack = [name]; render(name); }
function openDetail(plantId){ currentPlantId = plantId; currentDetailTab = "guide"; screenStack.push("detail"); render("detail"); }
function openAdd(){ resetWizard(); screenStack.push("add"); render("add"); }
function openPlantSettings(plantId){ currentPlantId = plantId; screenStack.push("plant-settings"); render("plant-settings"); }
function goBack(){ if(screenStack.length > 1) screenStack.pop(); render(screenStack[screenStack.length-1]); }

/* ---------------------------------------------------------
   8. 今日待辦 / Dashboard
--------------------------------------------------------- */
function getDismissedSet(){
  if(state.dismissedToday.date !== todayDateStr()) state.dismissedToday = { date: todayDateStr(), ids: [] };
  return new Set(state.dismissedToday.ids);
}
function toggleDismissed(key){
  const set = getDismissedSet();
  if(set.has(key)) set.delete(key); else set.add(key);
  state.dismissedToday.ids = Array.from(set);
  saveState();
}

function buildTodoItems(){
  const items = [];
  const now = new Date();
  state.plants.forEach(plant => {
    const t = speciesTemplate(plant.species);
    if(plant.plan.nextSoilCheckAt && new Date(plant.plan.nextSoilCheckAt) <= now){
      items.push({ key:`${plant.id}_soilcheck`, plantId: plant.id, icon:"icon-drop", text:`檢查 ${plant.name} 的土壤濕度`, sub: t.soilJudge, due: plant.plan.nextSoilCheckAt });
    }
    if(plant.plan.nextFertilizeAt && new Date(plant.plan.nextFertilizeAt) <= now){
      items.push({ key:`${plant.id}_fert`, plantId: plant.id, icon:"icon-leaf", text:`該幫 ${plant.name} 施肥囉`, sub: t.fertilizeText, due: plant.plan.nextFertilizeAt });
    }
    if(plant.plan.nextPruneAt && new Date(plant.plan.nextPruneAt) <= now){
      items.push({ key:`${plant.id}_prune`, plantId: plant.id, icon:"icon-scissors", text:`${plant.name} 可以修剪了`, sub: t.pruneText, due: plant.plan.nextPruneAt });
    }
    if(plant.plan.nextRepotAt && new Date(plant.plan.nextRepotAt) <= now){
      items.push({ key:`${plant.id}_repot`, plantId: plant.id, icon:"icon-pot", text:`${plant.name} 差不多該換盆了`, sub: t.repotText, due: plant.plan.nextRepotAt });
    }
  });
  items.sort((a,b) => new Date(a.due) - new Date(b.due));
  return items;
}

function buildTipCards(){
  const tips = [];
  state.plants.forEach(plant => {
    const w = getWeatherSync(plant.region, plant.district);
    const place = plant.district ? `${plant.region}${plant.district}` : plant.region;
    if(plant.environment !== "indoor" && w.isRain){
      tips.push({ plantId: plant.id, icon:"icon-cloud-rain", text:`${plant.name} 所在地區今天有雨，記得留意排水、延後澆水`, sub:`${place} · ${w.condition}` });
    } else if(plant.environment !== "indoor" && w.tempHigh >= 30){
      tips.push({ plantId: plant.id, icon:"icon-sun", text:`${plant.name} 所在地區今天高溫，提早檢查是否需要澆水`, sub:`${place} · 高溫 ${w.tempHigh}°` });
    } else if(plant.environment === "indoor" && plant.settings.acUsage){
      tips.push({ plantId: plant.id, icon:"icon-wind", text:`冷氣房空氣較乾燥，留意 ${plant.name} 是否需要加強保濕`, sub:"室內冷氣提醒" });
    }
  });
  return tips.slice(0,3);
}

function renderHome(){
  const now = new Date();
  const eyebrow = document.querySelector("#screen-home .eyebrow");
  const hour = now.getHours();
  const greet = hour < 11 ? "早安" : (hour < 18 ? "午安" : "晚安");
  eyebrow.textContent = `${greet}，今天也要好好照顧植物們`;
  document.getElementById("todayDate").textContent = `${now.getMonth()+1}月${now.getDate()} ${fmtWeekday(now)}`;

  const region = (state.settings && state.settings.weatherRegion) || "台北市";
  const w = getWeatherSync(region, "");
  const regionSelect = document.getElementById("weatherRegionSelect");
  if(regionSelect && regionSelect.value !== region) regionSelect.value = region;
  document.getElementById("weatherMini").innerHTML =
    `<svg class="icon"><use href="#${weatherIcon(w)}"/></svg><span>${region} ${w.tempLow}°–${w.tempHigh}° · ${w.condition}${w.isMock ? "（模擬）" : ""}</span>`;

  const dismissed = getDismissedSet();
  const items = buildTodoItems();
  const tips = buildTipCards();
  const todoList = document.getElementById("todoList");
  if(!items.length && !tips.length){
    todoList.innerHTML = `<div class="todo-empty">今天沒有待辦事項，植物們都很開心！</div>`;
  } else {
    todoList.innerHTML =
      items.map(it => `
        <div class="todo-item ${dismissed.has(it.key) ? "done" : ""}" data-plant="${it.plantId}">
          <button class="todo-check" data-toggle="${it.key}"><svg class="icon"><use href="#icon-check"/></svg></button>
          <div class="todo-text"><div>${escapeHtml(it.text)}</div><span class="todo-sub">${escapeHtml(it.sub || "")}</span></div>
        </div>
      `).join("") +
      tips.map(tp => `
        <div class="todo-item" data-plant="${tp.plantId}">
          <span class="activity-icon" style="width:26px;height:26px;border-radius:9px;"><svg class="icon icon-sm"><use href="#${tp.icon}"/></svg></span>
          <div class="todo-text"><div>${escapeHtml(tp.text)}</div><span class="todo-sub">${escapeHtml(tp.sub || "")}</span></div>
        </div>
      `).join("");
  }
  todoList.querySelectorAll(".todo-item").forEach(row => {
    row.addEventListener("click", (e) => {
      if(e.target.closest("[data-toggle]")) return;
      openDetail(row.dataset.plant);
    });
  });
  todoList.querySelectorAll("[data-toggle]").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleDismissed(btn.dataset.toggle); renderHome(); });
  });

  const row = document.getElementById("plantCardsRow");
  row.innerHTML = state.plants.length
    ? state.plants.map(p => plantCardHTML(p)).join("")
    : `<div class="empty-state">還沒有任何植物，點下方「新增」開始建檔吧</div>`;
  bindPlantCardClicks(row);

  const activity = document.getElementById("recentActivityList");
  const allLogs = [];
  state.plants.forEach(p => p.logs.forEach(l => allLogs.push({ log:l, plant:p })));
  allLogs.sort((a,b) => new Date(b.log.actualAt) - new Date(a.log.actualAt));
  const recent = allLogs.slice(0,6);
  if(!recent.length){
    activity.innerHTML = `<div class="activity-empty">還沒有任何紀錄，開始記錄第一筆照顧日記吧！</div>`;
  } else {
    activity.innerHTML = recent.map(({log,plant}) => `
      <div class="activity-item" data-plant="${plant.id}">
        <span class="activity-icon"><svg class="icon"><use href="#${TYPE_ICON[log.type]}"/></svg></span>
        <div class="activity-text"><b>${escapeHtml(plant.name)}</b> ${TYPE_LABEL[log.type]}${log.note ? " · " + escapeHtml(log.note) : ""}${log.backfilled ? "（後來補登）" : ""}</div>
        <span class="activity-time">${fmtDateHuman(log.actualAt)}</span>
      </div>
    `).join("");
    activity.querySelectorAll(".activity-item").forEach(el => el.addEventListener("click", () => openDetail(el.dataset.plant)));
  }
}

function plantCardHTML(p){
  const days = daysCared(p);
  const dueSoon = p.plan.nextSoilCheckAt && new Date(p.plan.nextSoilCheckAt) <= new Date();
  return `
    <div class="plant-card" data-plant="${p.id}">
      <img class="plant-photo" src="${p.photo || placeholderPhoto(p.species || p.name)}" alt="${escapeHtml(p.name)}">
      <p class="plant-card-name">${escapeHtml(p.name)}</p>
      <p class="plant-card-meta"><svg class="icon icon-sm"><use href="#${ENV_ICON[p.environment]}"/></svg>${ENV_LABEL[p.environment]} · ${escapeHtml(p.species || "未確定品種")}</p>
      <p class="plant-card-meta"><svg class="icon icon-sm"><use href="#icon-drop"/></svg>上次澆水 ${fmtDateHuman(p.plan.lastWateredAt)}</p>
      <span class="plant-card-days">${dueSoon ? "今天要檢查土壤！" : `已照顧第 ${days} 天`}</span>
    </div>
  `;
}
function bindPlantCardClicks(container){
  container.querySelectorAll(".plant-card").forEach(el => el.addEventListener("click", () => openDetail(el.dataset.plant)));
}
function daysCared(p){ return Math.max(1, diffDays(p.startDate, todayDateStr()) + 1); }

function renderPlantsGrid(){
  const grid = document.getElementById("allPlantsGrid");
  grid.innerHTML = state.plants.length
    ? state.plants.map(p => plantCardHTML(p)).join("")
    : `<div class="empty-state">還沒有任何植物，點右下角的「＋」開始建檔吧</div>`;
  bindPlantCardClicks(grid);
}

/* ---------------------------------------------------------
   9. 植物詳情
--------------------------------------------------------- */
function nearestReminder(plant){
  const candidates = [
    { field:"nextSoilCheckAt", label:"下次檢查土壤", icon:"icon-drop" },
    { field:"nextFertilizeAt", label:"下次施肥", icon:"icon-leaf" },
    { field:"nextPruneAt", label:"下次修剪", icon:"icon-scissors" },
    { field:"nextRepotAt", label:"下次換盆", icon:"icon-pot" }
  ].filter(c => plant.plan[c.field]);
  if(!candidates.length) return null;
  candidates.sort((a,b) => new Date(plant.plan[a.field]) - new Date(plant.plan[b.field]));
  const top = candidates[0];
  return { label: top.label, icon: top.icon, at: plant.plan[top.field], field: top.field };
}

function renderDetail(){
  const plant = getPlant(currentPlantId);
  if(!plant){ switchTab("home"); return; }
  document.getElementById("detailHeaderName").textContent = plant.name;
  document.getElementById("detailPhoto").src = plant.photo || placeholderPhoto(plant.species || plant.name);
  document.getElementById("detailName").textContent = plant.name;
  document.getElementById("detailSpecies").textContent = plant.species ? `${plant.species}${speciesTemplate(plant.species).latin ? " · " + speciesTemplate(plant.species).latin : ""}` : "品種未確定";
  document.getElementById("detailEnvBadge").innerHTML = `<svg class="icon icon-sm"><use href="#${ENV_ICON[plant.environment]}"/></svg> ${ENV_LABEL[plant.environment]}`;
  document.getElementById("detailDaysBadge").textContent = `已照顧第 ${daysCared(plant)} 天`;
  document.getElementById("detailPlaceBadge").innerHTML = `<svg class="icon icon-sm"><use href="#icon-pin"/></svg> ${escapeHtml(plant.district ? plant.region + plant.district : plant.region)}`;

  const near = nearestReminder(plant);
  const card = document.getElementById("nextCheckCard");
  if(near){
    card.innerHTML = `<svg class="icon"><use href="#${near.icon}"/></svg>
      <div><p class="next-check-title">${near.label}</p><p class="next-check-value">${fmtRelativeDay(near.at)}（${fmtDateHuman(near.at)}）</p></div>`;
  } else {
    card.innerHTML = `<svg class="icon"><use href="#icon-clock"/></svg><div><p class="next-check-title">提醒</p><p class="next-check-value">尚未有排定的提醒</p></div>`;
  }

  renderGuide(plant);
  renderTimeline(plant);
  renderAlbum(plant);
  setDetailTab(currentDetailTab);

  document.getElementById("editPlantBtn").onclick = () => openPlantSettings(plant.id);
  document.getElementById("backfillBtn").onclick = () => openLogModal(plant.id, { backfill:true });
  document.getElementById("addLogBtn").onclick = () => openLogModal(plant.id, { backfill:false });

  document.querySelectorAll("#quickActions .qa-btn").forEach(btn => {
    btn.onclick = () => handleQuickAction(plant.id, btn.dataset.action);
  });
}

function setDetailTab(tab){
  currentDetailTab = tab;
  document.querySelectorAll("#detailTabs .tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.getElementById("tab" + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add("active");
}

function renderGuide(plant){
  const t = speciesTemplate(plant.species);
  const blocks = [
    ["icon-leaf","品種介紹", t.intro],
    ["icon-home","建議擺放位置", t.placement],
    ["icon-sun","光照需求", t.light],
    ["icon-drop", `澆水原則（平均每 ${plant.plan.avgWaterIntervalDays} 天）`, `${t.watering} ${t.soilJudge}`],
    ["icon-pot","介質與排水建議", t.drainageText],
    ["icon-cloud","溫濕度需求", t.humidity],
    ["icon-leaf","施肥間隔", t.fertilizeText],
    ["icon-scissors","修剪及換盆建議", `${t.pruneText} ${t.repotText}`],
    ["icon-warn","常見病蟲害", t.pests]
  ];
  document.getElementById("guideContent").innerHTML = blocks.map(([icon,title,text]) => `
    <div class="guide-block">
      <p class="guide-block-title"><svg class="icon icon-sm"><use href="#${icon}"/></svg>${title}</p>
      <p class="guide-block-text">${escapeHtml(text)}</p>
    </div>
  `).join("");
}

function renderTimeline(plant){
  const logs = [...plant.logs].sort((a,b) => new Date(b.actualAt) - new Date(a.actualAt));
  const el = document.getElementById("timelineList");
  if(!logs.length){ el.innerHTML = `<div class="empty-state">還沒有任何紀錄，點選上方按鈕新增第一筆吧</div>`; return; }
  el.innerHTML = logs.map(log => `
    <div class="timeline-item">
      <span class="timeline-dot"><svg class="icon"><use href="#${TYPE_ICON[log.type]}"/></svg></span>
      <div class="tl-card">
        <div class="tl-head"><span class="tl-type">${TYPE_LABEL[log.type]}</span><span class="tl-date">${fmtDateTimeHuman(log.actualAt)}</span></div>
        ${log.note ? `<p class="tl-note">${escapeHtml(log.note)}</p>` : ""}
        ${log.backfilled ? `<span class="tl-backfill-tag">後來補登</span>` : ""}
        ${log.photos && log.photos.length ? `<div class="tl-photos">${log.photos.map(u => `<img src="${u}" data-full="${u}">`).join("")}</div>` : ""}
      </div>
    </div>
  `).join("");
  el.querySelectorAll(".tl-photos img").forEach(img => img.addEventListener("click", () => openLightbox(img.dataset.full, `${plant.name} · ${TYPE_LABEL[logs.find(l=>l.photos&&l.photos.includes(img.dataset.full))?.type] || ""}`)));
}

function collectPhotos(plant){
  const out = [];
  [...plant.logs].sort((a,b) => new Date(b.actualAt) - new Date(a.actualAt)).forEach(log => {
    (log.photos || []).forEach(url => out.push({ url, date: log.actualAt, caption: `${TYPE_LABEL[log.type]}${log.note ? " · " + log.note : ""}`, plantName: plant.name }));
  });
  return out;
}

function renderAlbum(plant){
  const photos = collectPhotos(plant);
  const el = document.getElementById("albumGrid");
  if(!photos.length){ el.innerHTML = `<div class="empty-state">還沒有照片，記錄日記時可以一起加上照片</div>`; return; }
  el.innerHTML = photos.map(ph => `
    <div class="album-item polaroid" data-url="${ph.url}" data-caption="${escapeHtml(ph.caption)}">
      <img src="${ph.url}"><p class="album-caption">${fmtDateHuman(ph.date)} · 第 ${diffDays(plant.startDate, ph.date)+1} 天</p>
    </div>
  `).join("");
  el.querySelectorAll(".album-item").forEach(item => item.addEventListener("click", () => openLightbox(item.dataset.url, item.dataset.caption)));
}

function openLightbox(url, caption){
  document.getElementById("lightboxImg").src = url;
  document.getElementById("lightboxCaption").textContent = caption || "";
  openModal("lightboxModal");
}

/* ---- 快速操作按鈕 ---- */
let lastQuickActionUndo = null; // { plantId, snapshot } 記錄動作前的植物完整狀態，供「復原」使用
function handleQuickAction(plantId, action){
  const plant = getPlant(plantId);
  if(!plant) return;
  const snapshot = JSON.parse(JSON.stringify(plant));
  let message = "";
  if(action === "watered"){
    addLog(plantId, { type:"water", date: todayDateStr(), time: nowTimeStr(), note:"" });
    message = `已記錄澆水！${fmtRelativeDay(plant.plan.nextSoilCheckAt)}再檢查土壤`;
  } else if(action === "notdry"){
    plant.plan.nextSoilCheckAt = delayReminder(plant.plan.nextSoilCheckAt, 1);
    plant.logs.push({ id:uid(), type:"snooze", actualAt:new Date().toISOString(), note:"表土還沒乾，延後檢查", photos:[], backfilled:false, createdAt:new Date().toISOString() });
    saveState();
    message = "好的，已經幫你延後一天再檢查";
  } else if(action === "rained"){
    const days = plant.environment === "indoor" ? 1 : 2;
    plant.plan.nextSoilCheckAt = delayReminder(plant.plan.nextSoilCheckAt, days);
    plant.logs.push({ id:uid(), type:"rain", actualAt:new Date().toISOString(), note:"今天有淋雨，暫時不需要澆水", photos:[], backfilled:false, createdAt:new Date().toISOString() });
    saveState();
    message = "已記錄淋雨，順延澆水檢查時間";
  } else if(action === "postpone"){
    const near = nearestReminder(plant);
    const field = (near && near.field) || "nextSoilCheckAt";
    plant.plan[field] = delayReminder(plant.plan[field], 1);
    plant.logs.push({ id:uid(), type:"snooze", actualAt:new Date().toISOString(), note:"手動延後提醒", photos:[], backfilled:false, createdAt:new Date().toISOString() });
    saveState();
    message = "提醒已延後";
  } else {
    return;
  }
  lastQuickActionUndo = { plantId, snapshot };
  showToast(message, undoLastQuickAction);
  renderDetail();
}

function undoLastQuickAction(){
  if(!lastQuickActionUndo) return;
  const { plantId, snapshot } = lastQuickActionUndo;
  const idx = state.plants.findIndex(p => p.id === plantId);
  lastQuickActionUndo = null;
  if(idx === -1) return;
  state.plants[idx] = snapshot;
  saveState();
  showToast("已復原剛剛的操作");
  if(currentPlantId === plantId && screenStack[screenStack.length-1] === "detail") renderDetail();
  else if(screenStack[screenStack.length-1] === "home") renderHome();
}

/* ---------------------------------------------------------
   10. 新增植物精靈 Wizard
--------------------------------------------------------- */
let wizard = null;
function resetWizard(){
  wizard = { step:1, photo:null, species:null, speciesConfidence:null, name:"", region:"", district:"", environment:null, startDate: todayDateStr() };
}
function renderWizard(){
  document.querySelectorAll(".wp-dot").forEach(d => {
    const s = Number(d.dataset.step);
    d.classList.toggle("active", s === wizard.step);
    d.classList.toggle("done", s < wizard.step);
  });
  document.querySelectorAll(".wizard-step").forEach(s => s.classList.toggle("active", Number(s.dataset.step) === wizard.step));
  document.getElementById("wizardPrevBtn").hidden = wizard.step === 1;
  document.getElementById("wizardNextBtn").textContent = wizard.step === 4 ? "完成建檔" : "下一步";

  document.getElementById("addPhotoPreview").hidden = !wizard.photo;
  document.getElementById("photoPlaceholder").hidden = !!wizard.photo;
  if(wizard.photo) document.getElementById("addPhotoPreview").src = wizard.photo;

  document.getElementById("plantNameInput").value = wizard.name;
  document.getElementById("regionInput").value = wizard.region;
  document.getElementById("districtInput").value = wizard.district;
  document.getElementById("startDateInput").value = wizard.startDate;
  document.querySelectorAll("#envOptionGrid .option-card").forEach(c => c.classList.toggle("selected", c.dataset.env === wizard.environment));
}

function wizardValidateStep(){
  if(wizard.step === 2 && !document.getElementById("plantNameInput").value.trim()){
    showToast("請幫植物取個名字"); return false;
  }
  if(wizard.step === 3 && !wizard.environment){
    showToast("請選擇種植環境"); return false;
  }
  return true;
}

function finalizeWizard(){
  wizard.name = document.getElementById("plantNameInput").value.trim() || "未命名植物";
  wizard.region = document.getElementById("regionInput").value.trim() || "台北市";
  wizard.district = document.getElementById("districtInput").value.trim();
  wizard.startDate = document.getElementById("startDateInput").value || todayDateStr();
  const plant = createPlant(wizard);
  state.plants.push(plant);
  saveState();
  showToast(`${plant.name} 建檔完成！`);
  screenStack = ["plants"];
  openDetail(plant.id);
}

/* ---- AI 植物品種辨識（真實 API：後端 /api/identify-plant） ---- */
async function identifyPlantAPI(dataUrl){
  const res = await fetch(`${API_BASE}/identify-plant`, {
    method: "POST",
    headers: supabaseHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ imageBase64: dataUrl }),
    signal: AbortSignal.timeout(25000)
  });
  const json = await res.json().catch(() => null);
  if(res.status === 429){
    const err = new Error((json && json.message) || "今日 AI 辨識次數已達上限");
    err.code = "DAILY_LIMIT_REACHED";
    err.usage = json && json.usage;
    throw err;
  }
  if(!res.ok || !json || json.ok === false){
    throw new Error((json && json.error) || `HTTP ${res.status}`);
  }
  return json; // { name, latin, confidence, note, cached, usage }
}
function mockGuessSpecies(){
  const keys = Object.keys(SPECIES_DB).filter(k => k !== "__default__");
  return keys[Math.floor(Math.random() * keys.length)];
}
function setAiLoading(on){
  document.getElementById("aiLoadingCard").hidden = !on;
  if(on) document.getElementById("aiGuessCard").hidden = true;
}
function showAiGuessResult(result){
  wizard._guess = result.name;
  const card = document.getElementById("aiGuessCard");
  card.hidden = false;
  document.getElementById("aiGuessName").textContent = result.latin ? `${result.name} · ${result.latin}` : result.name;
  const metaParts = [];
  if(result.isMock) metaParts.push("離線模擬結果，非真實 AI 辨識");
  else {
    if(Number.isFinite(result.confidence)) metaParts.push(`AI 信心度 ${result.confidence}%`);
    if(result.cached) metaParts.push("快取結果（未消耗今日次數）");
    else if(result.usage) metaParts.push(`今日 AI 辨識剩餘 ${result.usage.identifyRemainingToday} 次`);
  }
  if(result.note) metaParts.push(result.note);
  document.getElementById("aiGuessMeta").textContent = metaParts.join(" · ");
  document.getElementById("guessYesBtn").hidden = false;
  document.getElementById("guessRetryBtn").hidden = false;
}
function showAiQuotaReached(message){
  wizard._guess = null;
  const card = document.getElementById("aiGuessCard");
  card.hidden = false;
  document.getElementById("aiGuessName").textContent = "今日 AI 辨識次數已用完";
  document.getElementById("aiGuessMeta").textContent = message || "請直接手動輸入品種，或明天再試。";
  document.getElementById("guessYesBtn").hidden = true;
  document.getElementById("guessRetryBtn").hidden = true;
  const input = document.getElementById("manualSpeciesInput");
  input.hidden = false;
}
async function performIdentify(){
  if(!wizard.photo) return;
  setAiLoading(true);
  try{
    const result = await identifyPlantAPI(wizard.photo);
    showAiGuessResult(result);
  }catch(err){
    if(err.code === "DAILY_LIMIT_REACHED"){
      showAiQuotaReached(err.message);
    } else {
      console.warn("AI 辨識失敗，改用本機模擬猜測：", err.message);
      const pick = mockGuessSpecies();
      showAiGuessResult({ name: pick, latin: SPECIES_DB[pick].latin, confidence: null, note: "", isMock: true });
    }
  } finally {
    setAiLoading(false);
  }
}

/* ---------------------------------------------------------
   11. 植物完整設定 (事後補充)
--------------------------------------------------------- */
const CHIP_FIELDS = ["windowDirection","sunHours","lightLevel","ventilation","potMaterial","drainage"];
function renderPlantSettingsForm(){
  const plant = getPlant(currentPlantId);
  if(!plant) return;
  document.getElementById("plantNicknameInput").value = plant.name || "";
  const photoPreview = document.getElementById("plantSettingsPhotoPreview");
  const photoPlaceholder = document.getElementById("plantSettingsPhotoPlaceholder");
  if(plant.photo){
    photoPreview.src = plant.photo; photoPreview.hidden = false; photoPlaceholder.hidden = true;
  } else {
    photoPreview.hidden = true; photoPlaceholder.hidden = false;
  }
  const form = document.getElementById("plantSettingsForm");
  form.querySelector('[data-field="purchaseLocation"]').value = plant.settings.purchaseLocation || "";
  CHIP_FIELDS.forEach(f => {
    form.querySelectorAll(`.chip-select[data-field="${f}"] .chip`).forEach(c => c.classList.toggle("selected", c.dataset.val === plant.settings[f]));
  });
  form.querySelector('[data-field="acUsage"]').classList.toggle("on", !!plant.settings.acUsage);
  form.querySelector('[data-field="growLight"]').classList.toggle("on", !!plant.settings.growLight);
}
function savePlantSettings(){
  // 注意：這裡只單純更新本機資料（環境設定），不會呼叫 AI 辨識 API，
  // 因為使用者只是在修改既有植物的環境設定，不是重新辨識品種——
  // 每天 10 次的 AI 額度要留給真的需要辨識新植物照片的時候用。
  const plant = getPlant(currentPlantId);
  if(!plant) return;
  const nickname = document.getElementById("plantNicknameInput").value.trim();
  if(nickname) plant.name = nickname;
  const form = document.getElementById("plantSettingsForm");
  plant.settings.purchaseLocation = form.querySelector('[data-field="purchaseLocation"]').value.trim();
  CHIP_FIELDS.forEach(f => {
    const sel = form.querySelector(`.chip-select[data-field="${f}"] .chip.selected`);
    plant.settings[f] = sel ? sel.dataset.val : "";
  });
  plant.settings.acUsage = form.querySelector('[data-field="acUsage"]').classList.contains("on");
  plant.settings.growLight = form.querySelector('[data-field="growLight"]').classList.contains("on");
  recalcType(plant, "water");
  saveState();
  showToast("完整設定已儲存");
  goBack();
}

function deletePlant(plantId){
  const plant = getPlant(plantId);
  if(!plant) return;
  if(!confirm(`確定要刪除「${plant.name}」嗎？這株植物的所有紀錄和照片都會一併刪除，此動作無法復原。`)) return;
  state.plants = state.plants.filter(p => p.id !== plantId);
  saveState();
  showToast(`「${plant.name}」已刪除`);
  screenStack = ["plants"];
  render("plants");
}

/* ---------------------------------------------------------
   12. 相簿／紀錄總覽
--------------------------------------------------------- */
function renderGallery(){
  const sel = document.getElementById("galleryPlantFilter");
  const current = sel.value || "all";
  sel.innerHTML = `<option value="all">全部植物</option>` + state.plants.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  sel.value = current;
  sel.onchange = renderGalleryGrid;
  renderGalleryGrid();
}
function renderGalleryGrid(){
  const filter = document.getElementById("galleryPlantFilter").value;
  let photos = [];
  state.plants.forEach(p => { if(filter === "all" || filter === p.id) photos = photos.concat(collectPhotos(p)); });
  photos.sort((a,b) => new Date(b.date) - new Date(a.date));
  const grid = document.getElementById("galleryGrid");
  if(!photos.length){ grid.innerHTML = `<div class="empty-state">還沒有照片紀錄</div>`; return; }
  grid.innerHTML = photos.map(ph => `
    <div class="album-item polaroid" data-url="${ph.url}" data-caption="${escapeHtml(ph.plantName + " · " + ph.caption)}">
      <img src="${ph.url}"><p class="album-caption">${escapeHtml(ph.plantName)} · ${fmtDateHuman(ph.date)}</p>
    </div>
  `).join("");
  grid.querySelectorAll(".album-item").forEach(item => item.addEventListener("click", () => openLightbox(item.dataset.url, item.dataset.caption)));
}

/* ---------------------------------------------------------
   13. 提醒設定 (全域)
--------------------------------------------------------- */
function renderSettingsScreen(){
  document.getElementById("notifyTimeInput").value = state.settings.notifyTime;
  document.getElementById("quietStartInput").value = state.settings.quietStart;
  document.getElementById("quietEndInput").value = state.settings.quietEnd;
  document.getElementById("mergeNotifToggle").classList.toggle("on", state.settings.mergeNotifications);
  document.getElementById("travelModeToggle").classList.toggle("on", state.settings.travelMode);

  const weatherLine = document.getElementById("weatherUsageLine");
  const identifyLine = document.getElementById("identifyUsageLine");
  fetch(`${API_BASE}/usage`, { signal: AbortSignal.timeout(6000), headers: supabaseHeaders() })
    .then(res => res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status)))
    .then(json => {
      weatherLine.textContent = `天氣 API：今天已呼叫 ${json.weatherCallsToday} 次（同地區 4 小時內共用快取）`;
      identifyLine.textContent = `AI 品種辨識：今天已用 ${json.identifyCallsToday} / ${json.identifyDailyLimit} 次，剩餘 ${json.identifyRemainingToday} 次`;
    })
    .catch(() => {
      weatherLine.textContent = "天氣 API：連不到後端服務（目前使用模擬天氣）";
      identifyLine.textContent = "AI 品種辨識：連不到後端服務（目前使用手動輸入 / 模擬辨識）";
    });
}

/* ---------------------------------------------------------
   14. 紀錄 Modal（新增日記 / 補登紀錄）
--------------------------------------------------------- */
let logModalCtx = { plantId:null, photos:[] };
function openLogModal(plantId, opts){
  logModalCtx = { plantId, photos:[] };
  document.getElementById("logModalTitle").textContent = opts.backfill ? "補登過去紀錄" : "新增日記";
  document.getElementById("backfillFlagNote").hidden = !opts.backfill;
  document.querySelectorAll("#logTypeChips .chip").forEach((c,i) => c.classList.toggle("selected", opts.backfill ? c.dataset.val === "water" : c.dataset.val === "diary"));
  document.getElementById("logDateInput").value = opts.backfill ? daysAgoDateStr(1) : todayDateStr();
  document.getElementById("logTimeInput").value = nowTimeStr();
  document.getElementById("logNoteInput").value = "";
  document.getElementById("logPhotoPreview").hidden = true;
  document.getElementById("logPhotoPlaceholder").hidden = false;
  openModal("logModal");
}
function saveLogFromModal(){
  const typeChip = document.querySelector("#logTypeChips .chip.selected");
  const type = typeChip ? typeChip.dataset.val : "diary";
  const date = document.getElementById("logDateInput").value || todayDateStr();
  const time = document.getElementById("logTimeInput").value || nowTimeStr();
  const note = document.getElementById("logNoteInput").value.trim();
  addLog(logModalCtx.plantId, { type, date, time, note, photos: logModalCtx.photos });
  closeModal();
  showToast(date < todayDateStr() ? "補登完成，已重新計算提醒時間" : "紀錄已儲存");
  if(currentPlantId === logModalCtx.plantId) renderDetail();
}

/* ---------------------------------------------------------
   15. 圖片處理（壓縮避免 LocalStorage 過大）
--------------------------------------------------------- */
/* 前端圖片壓縮：iPhone 拍照常常是 3-5MB，直接存進 LocalStorage 很快就爆掉。
   這裡做的事情跟 App 端用 expo-image-manipulator 壓縮＋轉 WebP 是同一個目的，
   只是這是網頁 PWA（不是 Expo/React Native App，沒有 expo-image-manipulator
   這個原生模組可以用），所以改用瀏覽器原生的 Canvas + toBlob('image/webp')
   達到一樣的效果：縮小解析度＋轉 WebP，目標壓到 100~200KB、肉眼仍清晰。
   若瀏覽器不支援 WebP 編碼（舊版 Safari），會自動退回 JPEG。 */
let _webpSupportCache = null;
function supportsWebPEncode(){
  if(_webpSupportCache !== null) return _webpSupportCache;
  try{
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    _webpSupportCache = c.toDataURL("image/webp").indexOf("data:image/webp") === 0;
  }catch(e){ _webpSupportCache = false; }
  return _webpSupportCache;
}
function canvasToBlob(canvas, mime, quality){
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
}
function blobToDataURL(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
function loadImageFromFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function resizeImageFile(file, maxDim, targetKB){
  maxDim = maxDim || 1024;
  targetKB = targetKB || 180; // 目標 100~200KB 之間
  const mime = supportsWebPEncode() ? "image/webp" : "image/jpeg";
  const img = await loadImageFromFile(file);

  let dim = maxDim;
  let quality = 0.82;
  let blob = null;

  for(let attempt = 0; attempt < 6; attempt++){
    let { width, height } = img;
    if(width > height && width > dim){ height = Math.round(height * dim / width); width = dim; }
    else if(height > dim){ width = Math.round(width * dim / height); height = dim; }

    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    blob = await canvasToBlob(canvas, mime, quality);
    if(!blob){ break; } // 極少數瀏覽器 toBlob 失敗，用目前結果收尾

    if(blob.size <= targetKB * 1024) break; // 已經壓到目標大小以內，完成

    // 還太大：先降畫質，畫質已經很低了就縮小尺寸
    if(quality > 0.45){ quality -= 0.12; }
    else { dim = Math.round(dim * 0.8); quality = 0.6; }
  }

  if(!blob){
    // fallback：極端狀況下直接用 dataURL（品質較低但至少不會整個失敗）
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(img.width, 640); canvas.height = Math.round(img.height * canvas.width / img.width);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.6);
  }
  return blobToDataURL(blob);
}

/* ---------------------------------------------------------
   16. 泛用單選 (chip / option-card) 綁定
--------------------------------------------------------- */
function bindSingleSelect(root, groupSelector, itemSelector){
  root.querySelectorAll(groupSelector).forEach(group => {
    group.querySelectorAll(itemSelector).forEach(item => {
      item.addEventListener("click", () => {
        group.querySelectorAll(itemSelector).forEach(i => i.classList.remove("selected"));
        item.classList.add("selected");
      });
    });
  });
}

/* ---------------------------------------------------------
   17. 事件綁定 / 初始化
--------------------------------------------------------- */
function initEvents(){
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.nav;
      if(target === "add") openAdd(); else switchTab(target);
    });
  });
  document.querySelectorAll('.fab-inline[data-nav="add"]').forEach(btn => btn.addEventListener("click", openAdd));
  document.getElementById("toastUndoBtn").addEventListener("click", () => {
    const handler = toastUndoHandler;
    document.getElementById("toastModal").classList.remove("open");
    clearTimeout(toastTimer);
    toastUndoHandler = null;
    if(handler) handler();
  });
  document.querySelectorAll('[data-nav="back"]').forEach(btn => btn.addEventListener("click", goBack));
  document.querySelectorAll('[data-nav="plants"]').forEach(btn => { if(!btn.classList.contains("nav-btn")) btn.addEventListener("click", () => switchTab("plants")); });
  const weatherRegionSelect = document.getElementById("weatherRegionSelect");
  if(weatherRegionSelect){
    weatherRegionSelect.addEventListener("change", (e) => {
      if(!state.settings) state.settings = {};
      state.settings.weatherRegion = e.target.value;
      saveState();
      renderHome();
    });
  }

  document.getElementById("detailTabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if(btn) setDetailTab(btn.dataset.tab);
  });

  /* ---- Add wizard ---- */
  document.getElementById("photoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    document.getElementById("manualSpeciesInput").hidden = true;
    const dataUrl = await resizeImageFile(file, 768);
    wizard.photo = dataUrl;
    renderWizard();
    await performIdentify();
  });
  document.getElementById("guessYesBtn").addEventListener("click", () => {
    if(!wizard._guess) return;
    wizard.species = wizard._guess;
    showToast(`已確認品種：${wizard.species}`);
    wizard.step = 2; renderWizard();
  });
  document.getElementById("guessRetryBtn").addEventListener("click", performIdentify);
  document.getElementById("guessManualBtn").addEventListener("click", () => {
    const input = document.getElementById("manualSpeciesInput");
    input.hidden = false; input.focus();
  });
  document.getElementById("manualSpeciesInput").addEventListener("change", (e) => {
    wizard.species = e.target.value.trim();
    wizard._guess = wizard.species;
  });
  document.getElementById("skipPhotoBtn").addEventListener("click", () => { wizard.species = null; wizard.photo = null; wizard.step = 2; renderWizard(); });

  document.getElementById("plantNameInput").addEventListener("input", e => wizard.name = e.target.value);
  document.getElementById("regionInput").addEventListener("input", e => wizard.region = e.target.value);
  document.getElementById("districtInput").addEventListener("input", e => wizard.district = e.target.value);
  document.getElementById("startDateInput").addEventListener("change", e => wizard.startDate = e.target.value);
  bindSingleSelect(document.getElementById("envOptionGrid").parentElement, "#envOptionGrid", ".option-card");
  document.getElementById("envOptionGrid").addEventListener("click", (e) => {
    const card = e.target.closest(".option-card");
    if(card) wizard.environment = card.dataset.env;
  });

  document.getElementById("wizardNextBtn").addEventListener("click", () => {
    if(!wizardValidateStep()) return;
    if(wizard.step < 4){ wizard.step += 1; renderWizard(); }
    else finalizeWizard();
  });
  document.getElementById("wizardPrevBtn").addEventListener("click", () => { wizard.step = Math.max(1, wizard.step - 1); renderWizard(); });

  /* ---- plant full settings ---- */
  bindSingleSelect(document.getElementById("plantSettingsForm"), ".chip-select", ".chip");
  document.querySelectorAll('#plantSettingsForm .toggle').forEach(t => t.addEventListener("click", () => t.classList.toggle("on")));
  document.getElementById("plantPhotoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const plant = getPlant(currentPlantId);
    if(!plant) return;
    const dataUrl = await resizeImageFile(file, 768);
    plant.photo = dataUrl;
    saveState();
    renderPlantSettingsForm();
    showToast("照片已更新");
  });
  document.getElementById("savePlantSettingsBtn").addEventListener("click", savePlantSettings);
  document.getElementById("deletePlantBtn").addEventListener("click", () => deletePlant(currentPlantId));

  /* ---- global settings ---- */
  ["notifyTimeInput","quietStartInput","quietEndInput"].forEach(id => {
    document.getElementById(id).addEventListener("change", (e) => {
      const map = { notifyTimeInput:"notifyTime", quietStartInput:"quietStart", quietEndInput:"quietEnd" };
      state.settings[map[id]] = e.target.value; saveState();
    });
  });
  document.getElementById("mergeNotifToggle").addEventListener("click", (e) => { e.currentTarget.classList.toggle("on"); state.settings.mergeNotifications = e.currentTarget.classList.contains("on"); saveState(); });
  document.getElementById("travelModeToggle").addEventListener("click", (e) => { e.currentTarget.classList.toggle("on"); state.settings.travelMode = e.currentTarget.classList.contains("on"); saveState(); if(state.settings.travelMode) showToast("旅行模式開啟，提醒將會暫停"); });
  document.getElementById("resetDataBtn").addEventListener("click", () => {
    if(confirm("確定要重設所有資料嗎？此動作無法復原。")){
      state = buildSeedState();
      saveState();
      showToast("資料已重設");
      switchTab("home");
    }
  });

  /* ---- log modal ---- */
  bindSingleSelect(document.getElementById("logModal"), "#logTypeChips", ".chip");
  document.getElementById("logPhotoInput").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    for(const f of files){
      const dataUrl = await resizeImageFile(f, 640);
      logModalCtx.photos.push(dataUrl);
    }
    if(logModalCtx.photos.length){
      document.getElementById("logPhotoPreview").src = logModalCtx.photos[logModalCtx.photos.length-1];
      document.getElementById("logPhotoPreview").hidden = false;
      document.getElementById("logPhotoPlaceholder").hidden = true;
    }
  });
  document.getElementById("saveLogBtn").addEventListener("click", saveLogFromModal);

  /* ---- modal close ---- */
  document.querySelectorAll("[data-close-modal]").forEach(btn => btn.addEventListener("click", closeModal));
  backdrop().addEventListener("click", (e) => { if(e.target === backdrop()) closeModal(); });
}

/* ---------------------------------------------------------
   18. 啟動
--------------------------------------------------------- */
function init(){
  state = loadState();
  if(!state){ state = buildSeedState(); saveState(); }
  if(!state.dismissedToday) state.dismissedToday = { date:"", ids:[] };
  if(!state.settings) state.settings = {};
  if(!state.settings.weatherRegion) state.settings.weatherRegion = "台北市";
  initEvents();
  render("home");

  if("serviceWorker" in navigator){
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
})();
