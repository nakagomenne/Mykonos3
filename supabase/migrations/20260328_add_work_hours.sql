-- 稼働時間設定カラムを users テーブルに追加
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS work_start              TEXT    NOT NULL DEFAULT '11:00',
  ADD COLUMN IF NOT EXISTS work_end                TEXT    NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS auto_unavailable_offset INTEGER     NULL;  -- NULL=自動切替なし, 0=退勤ちょうど, 15=15分前, 30=30分前
