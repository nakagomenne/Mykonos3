-- call_requests テーブルに emoji カラムを追加
ALTER TABLE public.call_requests
  ADD COLUMN IF NOT EXISTS emoji TEXT NOT NULL DEFAULT '';
