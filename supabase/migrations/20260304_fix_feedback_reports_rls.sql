-- feedback_reports の SELECT ポリシーを追加
-- 既存の "service role can do all" は anon キーには適用されないため、
-- anon キーでも全件 SELECT できるようポリシーを追加する

CREATE POLICY "anyone can select feedback"
  ON public.feedback_reports FOR SELECT
  USING (true);
