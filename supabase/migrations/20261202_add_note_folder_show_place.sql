-- ============================================================
-- 共有されたフォルダを、「シェアノート」と「マイノート」のどちらに表示するかを覚える
--   note_folder_shows.place  'shared' = シェアノートに表示 / 'mine' = マイノート(自分のフォルダの並び)に表示
--
-- 20261201_add_note_folder_shows.sql をまだ実行していなくても、このSQLだけで足ります
-- (表が無ければ作り、あれば欄だけ足します)。
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (実行する前は、選んだ置き場所をそのパソコンのブラウザにだけ覚えます。
--   実行すると、アカウントごとに覚えるので、別のパソコンでも同じ表示になります)。
-- ============================================================

CREATE TABLE IF NOT EXISTS public.note_folder_shows (
  folder_id  uuid NOT NULL REFERENCES public.note_folders(id) ON DELETE CASCADE,
  user_name  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, user_name)
);
CREATE INDEX IF NOT EXISTS note_folder_shows_user_idx ON public.note_folder_shows (user_name);

ALTER TABLE public.note_folder_shows ADD COLUMN IF NOT EXISTS place text NOT NULL DEFAULT 'shared';

-- 権限(ほかのテーブルと同じく、アプリからの操作をすべて許可)
ALTER TABLE public.note_folder_shows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_note_folder_shows" ON public.note_folder_shows;
CREATE POLICY "allow_all_note_folder_shows" ON public.note_folder_shows FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 追加した欄を、アプリからすぐ使えるようにする
NOTIFY pgrst, 'reload schema';
