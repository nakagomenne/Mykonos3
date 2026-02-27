-- ============================================================
-- Mykonos3β Initial Schema
-- Supabase (PostgreSQL) マイグレーション
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. users テーブル
--    フロントエンドの User 型に合わせた構造
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL UNIQUE,
  is_admin         boolean NOT NULL DEFAULT false,
  is_line_prechecker boolean NOT NULL DEFAULT false,
  is_super_admin   boolean NOT NULL DEFAULT false,
  password         text NOT NULL DEFAULT 'NNE040121',
  profile_picture  text,
  availability_status text NOT NULL DEFAULT '受付可'
    CHECK (availability_status IN ('受付可','受付不可','当日受付不可','非稼働')),
  non_working_days text[]  NOT NULL DEFAULT '{}',
  available_products text[] NOT NULL DEFAULT '{回線,水}',
  comment          text    NOT NULL DEFAULT '',
  comment_updated_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 2. call_requests テーブル
--    フロントエンドの CallRequest 型に合わせた構造
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.call_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  text NOT NULL,
  requester    text NOT NULL,
  assignee     text NOT NULL,
  list_type    text NOT NULL DEFAULT ''
    CHECK (list_type IN ('', '回線', 'MF', 'OK', 'NG')),
  rank         text NOT NULL,
  date_time    text NOT NULL,           -- "YYYY-MM-DDT時刻" 形式
  notes        text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT '追客中'
    CHECK (status IN ('追客中', '完了')),
  absence_count integer NOT NULL DEFAULT 0,
  prechecker   text,
  imported     boolean NOT NULL DEFAULT false,
  history      jsonb NOT NULL DEFAULT '[]',
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 3. app_settings テーブル
--    お知らせ・バージョンなどのグローバル設定
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL DEFAULT ''
);

-- デフォルト設定の挿入
INSERT INTO public.app_settings (key, value)
VALUES
  ('announcement', ''),
  ('app_version', 'ver 3.0.0')
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4. RLS (Row Level Security) の設定
--    ※ Supabase Anon Key で全操作を許可する公開テーブルとして設定
--    　 本番運用では認証と組み合わせてポリシーを厳格化してください
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings    ENABLE ROW LEVEL SECURITY;

-- anon / authenticated ロールに全操作を許可
CREATE POLICY "allow_all_users"         ON public.users         FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_call_requests" ON public.call_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_app_settings"  ON public.app_settings  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 5. インデックス
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_call_requests_assignee   ON public.call_requests (assignee);
CREATE INDEX IF NOT EXISTS idx_call_requests_customer_id ON public.call_requests (customer_id);
CREATE INDEX IF NOT EXISTS idx_call_requests_status     ON public.call_requests (status);
CREATE INDEX IF NOT EXISTS idx_call_requests_created_at ON public.call_requests (created_at DESC);
