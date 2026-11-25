-- ============================================================
-- ノートとフォルダを、自分の好きな順に並べる
--   note_user_orders  人ごとの並び順(1人につき1行)
--     note_order    ノートのIDを、並べた順に入れた一覧
--     folder_order  フォルダのIDを、並べた順に入れた一覧
--     ・並べた本人の画面にだけ効く(ほかの人の並びは変わらない)
--
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (実行する前は、並べた順をそのパソコンのブラウザにだけ覚えます。
--   実行すると、アカウントごとに覚えるので、別のパソコンでも同じ並びになります)。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.note_user_orders (
  user_name    text PRIMARY KEY,
  note_order   jsonb NOT NULL DEFAULT '[]'::jsonb,
  folder_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 権限(ほかのテーブルと同じく、アプリからの操作をすべて許可)
ALTER TABLE public.note_user_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_note_user_orders" ON public.note_user_orders;
CREATE POLICY "allow_all_note_user_orders" ON public.note_user_orders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
