-- ============================================================
-- Mikopos の返信に、画像(GIF を含む)を付けられるようにする
--   mikopos_replies.image_url  返信に付けた画像のURL(画像なしは NULL)
--
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (実行する前は、文字だけの返信は今までどおり送れ、画像つきの返信だけ送れません)。
-- ============================================================

ALTER TABLE public.mikopos_replies ADD COLUMN IF NOT EXISTS image_url text;

-- 追加した欄を、アプリからすぐ使えるようにする
NOTIFY pgrst, 'reload schema';
