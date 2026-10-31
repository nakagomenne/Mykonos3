-- 周知ノートを「確認済みにして非表示」にするための列
-- (本人が非表示にした周知は、周知の一覧から隠れ、「非表示の周知一覧」で見られる)
ALTER TABLE public.note_reads
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
