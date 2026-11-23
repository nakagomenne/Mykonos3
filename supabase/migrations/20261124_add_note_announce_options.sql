-- ============================================================
-- ノートのアナウンスの拡張
--   1. 重要なアナウンス: notes.announce_important
--        true のアナウンスは、まだ確認していない人が Mykonos を開いたときに画面中央へ表示する
--   2. 確認の期限: notes.announce_due
--        「この日までに確認してください」の日付(なければ NULL)
--
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (アナウンスの「重要」と「期限」は、実行後に使えるようになります)。
-- ============================================================

ALTER TABLE notes ADD COLUMN IF NOT EXISTS announce_important boolean NOT NULL DEFAULT false;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS announce_due date;
