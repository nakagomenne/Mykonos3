-- コメントへのリプライテーブル
-- user_name: リプライ先のユーザー名（そのユーザーのコメントへのリプライ）
-- author: リプライ投稿者名
-- body: リプライ本文（100文字まで）
-- created_at: 投稿日時

CREATE TABLE IF NOT EXISTS public.comment_replies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name  text NOT NULL,   -- リプライ先ユーザー（comment owner）
  author     text NOT NULL,   -- リプライ投稿者
  body       text NOT NULL CHECK (char_length(body) <= 100),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: anon キーで全操作を許可
ALTER TABLE public.comment_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_comment_replies"
  ON public.comment_replies FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
