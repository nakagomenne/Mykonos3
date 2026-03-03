-- 稼働ステータスの自動復帰時刻カラムを追加
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status_revert_at timestamptz DEFAULT NULL;

-- availability_status の CHECK 制約を更新（'受付不可' → '一時受付不可'）
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_availability_status_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_availability_status_check
    CHECK (availability_status IN ('受付可','一時受付不可','当日受付不可','非稼働'));
