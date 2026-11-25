-- ============================================================
-- 共有されたフォルダのうち、ふだん表示するものを自分で選ぶ
--   note_folder_shows  人ごとの「この共有フォルダを、フォルダ欄に表示する」という情報
--     ・選んだ本人のフォルダ欄にだけ効く(フォルダそのものや、ほかの人の表示は変えない)
--     ・フォルダを消すと、この情報も一緒に消える
--
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (実行する前は、選んだ内容をそのパソコンのブラウザにだけ覚えます。
--   実行すると、アカウントごとに覚えるので、別のパソコンでも同じ表示になります)。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.note_folder_shows (
  folder_id  uuid NOT NULL REFERENCES public.note_folders(id) ON DELETE CASCADE,
  user_name  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, user_name)
);
CREATE INDEX IF NOT EXISTS note_folder_shows_user_idx ON public.note_folder_shows (user_name);

-- 権限(ほかのテーブルと同じく、アプリからの操作をすべて許可)
ALTER TABLE public.note_folder_shows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_note_folder_shows" ON public.note_folder_shows;
CREATE POLICY "allow_all_note_folder_shows" ON public.note_folder_shows FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
