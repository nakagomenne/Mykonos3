-- usersテーブルにフリガナカラムを追加
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS furigana text DEFAULT NULL;
