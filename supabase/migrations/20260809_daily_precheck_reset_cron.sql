-- 毎日9時(JST = UTC 0:00)に回線前確・電気契確の「昨日以前+待機中」案件を
-- 「当日+待機中」に自動更新する pg_cron ジョブを登録
-- ※ Supabase の pg_cron は UTC 基準のため、JST 9:00 = UTC 0:00
--
-- 背景: この処理はクライアント側（ブラウザの setTimeout）にも実装されているが、
-- 朝9時台に誰もアプリを開いていない場合は発火しないという欠陥があった。
-- サーバー側の pg_cron から Edge Function を確実に呼び出すことで、
-- ブラウザの起動状況に依存せず毎日実行されるようにする。

-- pg_cron 拡張を有効化（すでに有効な場合はスキップされる）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 既存のジョブがあれば削除してから再登録
SELECT cron.unschedule('daily-precheck-reset')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-precheck-reset'
);

-- 毎日 UTC 0:00（= JST 9:00）に Edge Function を呼び出す
SELECT cron.schedule(
  'daily-precheck-reset',        -- ジョブ名
  '0 0 * * *',                   -- UTC 0:00 = JST 9:00 毎日
  $$
  SELECT net.http_post(
    url    := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL') || '/functions/v1/daily-precheck-reset',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY')
    ),
    body   := '{}'::jsonb
  );
  $$
);
