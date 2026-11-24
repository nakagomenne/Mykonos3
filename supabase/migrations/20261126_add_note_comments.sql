-- ============================================================
-- ノートのコメント
--   note_comments  ノートに付けるコメント(ノートを消すと、一緒に消える)
--
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (実行すると、ノートの下にコメント欄が出るようになります)。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.note_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  author     text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS note_comments_note_idx ON public.note_comments (note_id, created_at);

-- 権限(ほかのテーブルと同じく、アプリからの操作をすべて許可)
ALTER TABLE public.note_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_note_comments" ON public.note_comments;
CREATE POLICY "allow_all_note_comments" ON public.note_comments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Realtime (コメントの自動更新・通知用)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.note_comments;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- すでに登録済み
END $$;
