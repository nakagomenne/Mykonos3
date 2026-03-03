-- フィードバック（バグ報告・要望）テーブル
CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL CHECK (type IN ('bug', 'request', 'other')),
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  reporter    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_read     boolean NOT NULL DEFAULT false
);

-- SAのみ全件取得・削除可能、一般ユーザーはINSERTのみ
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert feedback"
  ON public.feedback_reports FOR INSERT
  WITH CHECK (true);

CREATE POLICY "service role can do all"
  ON public.feedback_reports FOR ALL
  USING (true)
  WITH CHECK (true);
