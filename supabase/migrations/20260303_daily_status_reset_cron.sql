-- 毎日0時(JST = UTC 15:00)に稼働ステータスを自動リセットする pg_cron ジョブを登録
-- ※ Supabase の pg_cron は UTC 基準のため、JST 0:00 = UTC 15:00

-- pg_cron 拡張を有効化（すでに有効な場合はスキップされる）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 既存のジョブがあれば削除してから再登録
SELECT cron.unschedule('daily-status-reset') 
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-status-reset'
);

-- 毎日 UTC 15:00（= JST 0:00）に Edge Function を呼び出す
SELECT cron.schedule(
  'daily-status-reset',         -- ジョブ名
  '0 15 * * *',                  -- UTC 15:00 = JST 0:00 毎日
  $$
  SELECT net.http_post(
    url    := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/daily-status-reset',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body   := '{}'::jsonb
  );
  $$
);
