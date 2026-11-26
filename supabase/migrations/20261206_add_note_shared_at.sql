-- ============================================================
-- ノートを「共有した日時」を覚える
--   notes.shared_at  公開範囲を「自分だけ」以外にした日時(「自分だけ」のあいだは NULL)
--
-- 何に使うか:
--   編集できない人(見るだけの人)がノートの履歴を開いたとき、
--   共有した日時より前の版は見せない(共有する前に書いて消した内容を、あとから読まれないように)。
--   編集できる人(作った人・共同編集の人)には、これまでどおりすべての版を見せる。
--
-- しくみ:
--   ・公開範囲が「自分だけ」から、それ以外に変わったとき、その時点の日時を入れる
--   ・「自分だけ」に戻したときは、空に戻す(もう一度共有すると、その時点からになる)
--   ・日時は、データベースが自動で入れる(アプリからは書き換えられない)
--   ・すでに共有されているノートは、いまの内容を保存した日時を入れる
--     (いまの内容より前の版は、見るだけの人には見せない)
--
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (実行する前は、見るだけの人が履歴を開いても、いまの内容だけが出ます)。
-- ============================================================

ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS shared_at timestamptz;

CREATE OR REPLACE FUNCTION public.notes_set_shared_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.visibility = 'private' THEN
    NEW.shared_at := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.shared_at := COALESCE(NEW.updated_at, now());
  ELSIF OLD.visibility = 'private' OR OLD.shared_at IS NULL THEN
    NEW.shared_at := COALESCE(NEW.updated_at, now());
  ELSE
    NEW.shared_at := OLD.shared_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notes_set_shared_at ON public.notes;
CREATE TRIGGER notes_set_shared_at
  BEFORE INSERT OR UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.notes_set_shared_at();

-- すでに共有されているノートに、日時を入れる(上のしくみが、いまの内容を保存した日時を入れる)
UPDATE public.notes SET shared_at = updated_at WHERE visibility <> 'private' AND shared_at IS NULL;

-- 追加した欄を、アプリからすぐ使えるようにする
NOTIFY pgrst, 'reload schema';
