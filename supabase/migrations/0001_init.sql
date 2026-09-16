-- 小綠日記 — Supabase 資料庫初始化
-- 對應原本 server/ 用 JSON 檔案做的三個快取／計數：
--   weather-cache.json   -> weather_cache 表
--   identify-cache.json  -> identify_cache 表
--   usage.json           -> usage_counters 表
--
-- 這些表只給 Edge Function（用 service_role key）讀寫，
-- 一般前端的 anon key 完全連不到、也看不到裡面的資料
-- （下面用 RLS 把 anon／authenticated 角色的存取權限鎖起來，
--  不用另外寫任何 policy，預設就是「沒有 policy = 沒有權限」）。

create table if not exists weather_cache (
  cache_key   text primary key,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now()
);
alter table weather_cache enable row level security;

create table if not exists identify_cache (
  image_hash  text primary key,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);
alter table identify_cache enable row level security;

create table if not exists usage_counters (
  day             text primary key,
  weather_calls   integer not null default 0,
  identify_calls  integer not null default 0
);
alter table usage_counters enable row level security;

-- 原子性地把某一天某個欄位的計數 +1，避免高併發時互相覆蓋。
create or replace function bump_usage(p_day text, p_column text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_column = 'weather_calls' then
    insert into usage_counters (day, weather_calls) values (p_day, 1)
    on conflict (day) do update set weather_calls = usage_counters.weather_calls + 1;
  elsif p_column = 'identify_calls' then
    insert into usage_counters (day, identify_calls) values (p_day, 1)
    on conflict (day) do update set identify_calls = usage_counters.identify_calls + 1;
  else
    raise exception 'unknown column %', p_column;
  end if;
end;
$$;

-- 定期清掉太舊的天氣快取／AI 辨識快取，避免資料庫（免費額度 500MB）一直長大。
-- 這不是必要的排程，只是順手加一個函式，未來要在 Supabase 後台設 Cron 也可以直接用。
create or replace function cleanup_old_cache()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from weather_cache where fetched_at < now() - interval '2 days';
  delete from identify_cache where created_at < now() - interval '180 days';
  delete from usage_counters where day < to_char(now() - interval '30 days', 'YYYY-MM-DD');
end;
$$;
