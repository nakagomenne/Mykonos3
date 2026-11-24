-- ============================================================
-- 共有されたノートを、自分のフォルダに入れる
--   note_placements  人ごとの「このノートを、自分のこのフォルダに入れた」という情報
--     ・原本(notes)の置き場所は変えない。入れた本人にだけ、そのフォルダに見える
--     ・ノートやフォルダを消すと、この情報も一緒に消える
--
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (実行すると、共有されたノートに「自分のフォルダに入れる」欄が出るようになります)。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.note_placements (
  note_id    uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_name  text NOT NULL,
  folder_id  uuid NOT NULL REFERENCES public.note_folders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, user_name)
);
CREATE INDEX IF NOT EXISTS note_placements_user_idx ON public.note_placements (user_name);

-- 権限(ほかのテーブルと同じく、アプリからの操作をすべて許可)
ALTER TABLE public.note_placements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_note_placements" ON public.note_placements;
CREATE POLICY "allow_all_note_placements" ON public.note_placements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
