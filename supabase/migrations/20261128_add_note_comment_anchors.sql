-- ============================================================
-- ノートの本文の「ここ」にコメントを付ける / コメントに返信する
--   note_comments に、次の欄を足す
--     anchor_text    コメントを付けた文字(本文全体へのコメントは NULL)
--     anchor_prefix  その直前の文字(同じ文字が何回も出るときに、場所を見分けるため)
--     anchor_suffix  その直後の文字
--     parent_id      返信のとき、もとのコメント(もとのコメントを消すと、返信も一緒に消える)
--
-- 何度実行しても同じ結果になります。今あるコメントは、そのまま残ります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (実行すると、本文を選んでコメントを付けられるようになります)。
-- ============================================================

ALTER TABLE public.note_comments ADD COLUMN IF NOT EXISTS anchor_text   text;
ALTER TABLE public.note_comments ADD COLUMN IF NOT EXISTS anchor_prefix text;
ALTER TABLE public.note_comments ADD COLUMN IF NOT EXISTS anchor_suffix text;
ALTER TABLE public.note_comments ADD COLUMN IF NOT EXISTS parent_id     uuid REFERENCES public.note_comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS note_comments_parent_idx ON public.note_comments (parent_id);

-- 追加した欄を、アプリからすぐ使えるようにする
NOTIFY pgrst, 'reload schema';
