-- ============================================================
-- ノートのコメントを「どこまで見たか」を、人ごとに覚える
--   note_comment_seen  ノートごと・人ごとに、最後にコメントを見た日時
--     ・これより新しいコメントを「まだ見ていないコメント」として、一覧の青い点や、ノートの中の案内で知らせる
--     ・どの端末で開いても同じ状態になる
--     ・ノートを消すと、この情報も一緒に消える
--
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (実行すると、まだ見ていないコメントのお知らせが出るようになります)。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.note_comment_seen (
  note_id   uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  seen_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, user_name)
);
CREATE INDEX IF NOT EXISTS note_comment_seen_user_idx ON public.note_comment_seen (user_name);

-- 権限(ほかのテーブルと同じく、アプリからの操作をすべて許可)
ALTER TABLE public.note_comment_seen ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_note_comment_seen" ON public.note_comment_seen;
CREATE POLICY "allow_all_note_comment_seen" ON public.note_comment_seen FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
