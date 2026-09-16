/* 極簡的 JSON 檔案儲存工具（不需要資料庫）。
   用來存放：天氣快取、AI 辨識快取、每日呼叫次數計數器。 */
"use strict";
const fs = require("fs");
const path = require("path");

function ensureDir(p){ fs.mkdirSync(p, { recursive: true }); }

class JsonStore {
  constructor(filePath, defaultValue){
    this.filePath = filePath;
    ensureDir(path.dirname(filePath));
    this.data = this._load(defaultValue);
  }
  _load(defaultValue){
    try{
      const raw = fs.readFileSync(this.filePath, "utf8");
      return JSON.parse(raw);
    }catch(e){
      return typeof defaultValue === "function" ? defaultValue() : defaultValue;
    }
  }
  save(){
    try{
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
    }catch(e){
      console.warn("[jsonstore] 寫入失敗：", this.filePath, e.message);
    }
  }
}

module.exports = { JsonStore };
