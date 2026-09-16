# 小綠日記 — 後端服務說明

這個 `server/` 資料夾是這次新增的**後端服務**，用途只有三個：

1. 把 OpenWeatherMap／Google AI Studio 的金鑰藏在伺服器上（絕對不能放進前端 JS，不然任何人打開瀏覽器
   開發者工具就能複製走你的金鑰去亂用）。
2. 做「同一行政區 4 小時內共用一筆天氣快取」——這件事本質上是**共享狀態**，單純的網頁 LocalStorage
   只存在使用者自己的手機裡，沒有伺服器不可能真正共用。
3. 做「AI 辨識每天最多 10 次」的**全域**計數（同樣道理，只有伺服器能算「全部使用者總共呼叫了幾次」）。

前端（`index.html` / `app.js` / `styles.css`）**完全沒有改動架構**，還是同一個純網頁 PWA；只是原本呼叫
「模擬天氣」「模擬 AI 猜測」的地方，改成先呼叫這個後端，打不到的時候才自動退回原本的模擬版本，
所以就算你暫時沒開這個伺服器，App 本身也不會壞掉，只是天氣跟辨識會標示「（模擬）」。

## 目錄結構

```
server/
  server.js          主程式（Express）
  tw-districts.js     台灣縣市／行政區 → 經緯度 對照表
  jsonstore.js        極簡 JSON 檔案儲存（不需要資料庫）
  package.json
  .env                 ⚠️ 實際金鑰在這裡（已幫你填好，見下方安全性提醒）
  .env.example         給別人／上傳 git 用的範本（不含金鑰）
  .gitignore           已經把 .env 跟 data/ 排除在外
  data/                執行時自動產生的快取檔案（天氣快取、AI 快取、用量計數）
```

## 怎麼啟動

需要先裝 [Node.js](https://nodejs.org)（18 版以上即可，你電腦上如果本來就有可以跳過）。

```bash
cd server
npm install
npm start
```

看到這行就是成功了：

```
🌱 小綠日記伺服器已啟動： http://localhost:3000
```

接著**直接用瀏覽器打開 `http://localhost:3000`**（不是打開 index.html 檔案，是打開這個網址），
就會看到完整的 App，而且天氣／AI 辨識都是真的在打 API 了。

## 要在 iPhone 上用（含加入主畫面）

這個伺服器預設只在你電腦上跑，iPhone 沒辦法直接連到 `localhost`。有兩種做法：

**做法 A：同一個 Wi-Fi（最簡單，免費，但電腦要開著）**
1. 在電腦「系統設定」查看電腦在區網內的 IP（例如 `192.168.1.23`）。
2. 確保 iPhone 和電腦連同一個 Wi-Fi。
3. iPhone Safari 打開 `http://192.168.1.23:3000`，正常使用後點「加入主畫面」。
4. 缺點：電腦關機或不在同一個 Wi-Fi 就打不開（App 還是能開，只是天氣/AI 會變成模擬版本）。

**做法 B：部署到免費雲端主機（隨時隨地都能用）**
把整個 `植物app` 資料夾（含 `server/`）部署到 Render / Railway / Fly.io 這類有免費額度的平台都可以，
步驟是「上傳整包程式 → 設定環境變數（跟 `.env` 一樣的內容）→ 啟動指令 `npm start`」。
如果你要走這條路，跟我說一聲，我可以照你選的平台把部署步驟一步步列給你。

## ⚠️ 安全性提醒（重要）

你把兩把金鑰直接貼在對話裡給我，我已經把它們寫進 `server/.env`，**只有這個伺服器自己會讀到，
不會出現在任何前端檔案裡**。但因為金鑰已經在這次對話中出現過，還是建議你之後找時間：

- 到 [OpenWeatherMap 帳號設定](https://home.openweathermap.org/api_keys) 重新產生一把新的 key，換掉 `.env` 裡的值。
- 到 [Google AI Studio](https://aistudio.google.com/apikey) 檢查一下這把金鑰的格式——你給的那把是
  `AQ.` 開頭（實際金鑰內容只存在你自己的 `server/.env` 裡，這份文件不會寫出完整金鑰），
  跟一般 Gemini API key 常見的 `AIzaSy` 開頭格式不太一樣，伺服器啟動測試時我這邊的網路環境剛好也連不到
  Google 驗證，沒辦法幫你即時確認這把金鑰有效。如果實際跑起來 AI 辨識一直失敗、App 自動退回「模擬」結果，
  第一件事就是去 aistudio.google.com/apikey 確認金鑰是否正確、是否已啟用 Gemini API。
- `.env` 已經被 `.gitignore` 排除，如果之後要把專案上傳到 GitHub 之類的地方，記得金鑰不會被一起上傳，
  但**部署到雲端主機時要另外用該平台的「環境變數」設定畫面填一次**，不要把 `.env` 檔案本身上傳上去。

## API 一覽

- `GET /api/weather?city=台北市&district=松山區`
  回傳天氣資料，同地區 4 小時內直接回快取，不會重打 OpenWeatherMap。
- `POST /api/identify-plant`  body: `{ "imageBase64": "data:image/webp;base64,..." }`
  回傳 `{ name, latin, confidence, note }`；同一張照片（用內容雜湊比對）不會重複呼叫；
  每天最多呼叫 `IDENTIFY_DAILY_LIMIT`（預設 10）次，超過會回傳 429，前端會自動改成手動輸入品種。
- `GET /api/usage`
  查詢今天兩個 API 各呼叫了幾次，App「設定」頁會顯示這個。

## 每日額度與快取邏輯放在哪裡

- 天氣快取：`server.js` 的 `getWeather()`，快取檔案是 `data/weather-cache.json`，key 是「城市｜行政區」，
  4 小時內（`WEATHER_CACHE_MS`）直接回快取。
- AI 辨識快取＋每日上限：`server.js` 的 `/api/identify-plant` 路由，快取檔案是
  `data/identify-cache.json`（用照片內容的 SHA-256 雜湊值當 key，同一張照片不會重複扣額度），
  每日次數統計在 `data/usage.json`，每天自動歸零重算。
- 「只是修改環境設定不重打 AI」：這個規則在前端 `app.js` 的 `savePlantSettings()` 裡，
  那個函式只會更新本機植物資料、重算澆水排程，完全不會呼叫 `/api/identify-plant`。
