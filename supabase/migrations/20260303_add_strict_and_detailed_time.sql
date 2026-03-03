-- 案件テーブルに「厳守」「詳細な時設」フラグを追加
ALTER TABLE public.call_requests
  ADD COLUMN IF NOT EXISTS is_strict        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_detailed_time boolean NOT NULL DEFAULT false;
