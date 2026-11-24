-- ============================================================
-- Mikopos のタイムライン
--   1. mikopos_posts       ポスト(上書きせず、積み重ねて残す)。画像・投票・メンションつき
--   2. mikopos_reactions   ポストへのリアクション(絵文字)
--   3. mikopos_replies     ポストへの返信
--   4. mikopos_poll_votes  投票(1人1票。あとから選び直せる)
--
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (実行すると、Mikopos がタイムライン表示に切り替わります)。
-- ============================================================

-- ── 1. ポスト ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mikopos_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author     text NOT NULL,
  body       text NOT NULL DEFAULT '',
  image_url  text,
  -- 投票: {"options": ["A", "B", ...]} (投票なしは NULL)
  poll       jsonb,
  -- メンションされた人の名前
  mentions   text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mikopos_posts_created_at_idx ON public.mikopos_posts (created_at DESC);

-- ── 2. リアクション ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mikopos_reactions (
  post_id    uuid NOT NULL REFERENCES public.mikopos_posts(id) ON DELETE CASCADE,
  user_name  text NOT NULL,
  emoji      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_name, emoji)
);

-- ── 3. 返信 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mikopos_replies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES public.mikopos_posts(id) ON DELETE CASCADE,
  author     text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mikopos_replies_post_idx ON public.mikopos_replies (post_id, created_at);

-- ── 4. 投票 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mikopos_poll_votes (
  post_id      uuid NOT NULL REFERENCES public.mikopos_posts(id) ON DELETE CASCADE,
  user_name    text NOT NULL,
  option_index integer NOT NULL,
  voted_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_name)
);

-- ── 5. 権限(ほかのテーブルと同じく、アプリからの操作をすべて許可) ──
ALTER TABLE public.mikopos_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mikopos_reactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mikopos_replies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mikopos_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_mikopos_posts"      ON public.mikopos_posts;
DROP POLICY IF EXISTS "allow_all_mikopos_reactions"  ON public.mikopos_reactions;
DROP POLICY IF EXISTS "allow_all_mikopos_replies"    ON public.mikopos_replies;
DROP POLICY IF EXISTS "allow_all_mikopos_poll_votes" ON public.mikopos_poll_votes;
CREATE POLICY "allow_all_mikopos_posts"      ON public.mikopos_posts      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_mikopos_reactions"  ON public.mikopos_reactions  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_mikopos_replies"    ON public.mikopos_replies    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_mikopos_poll_votes" ON public.mikopos_poll_votes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── 6. Realtime (タイムラインの自動更新・通知用) ──────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mikopos_posts', 'mikopos_reactions', 'mikopos_replies', 'mikopos_poll_votes'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- すでに登録済み
    END;
  END LOOP;
END $$;

-- ── 7. いまの「ひとこと」を、最初のポストとしてタイムラインに入れる ──
--    (タイムラインが空のときだけ。2回目以降の実行では何もしない)
INSERT INTO public.mikopos_posts (author, body, created_at)
SELECT u.name, u.comment, COALESCE(u.comment_updated_at, now())
FROM public.users u
WHERE COALESCE(u.comment, '') <> ''
  AND NOT EXISTS (SELECT 1 FROM public.mikopos_posts);
