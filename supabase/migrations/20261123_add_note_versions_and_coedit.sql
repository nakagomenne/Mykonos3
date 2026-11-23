-- ============================================================
-- ノート機能の拡張
--   1. 共同編集: notes.allow_edit
--        true のノートは、見られる人(公開範囲に入っている人)も本文を編集できる
--   2. 編集履歴: note_versions
--        ノートのタイトル・本文を保存するたびに、保存前の内容を1件残す
--        (アプリ側で、1ノートにつき新しいものから30件までに整理する)
--
-- 何度実行しても同じ結果になります。
-- このSQLを実行する前でも、アプリは今までどおり動きます
-- (共同編集のスイッチと「履歴」は、実行後に使えるようになります)。
-- ============================================================

-- ── 1. 共同編集 ─────────────────────────────────────────────
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS allow_edit boolean NOT NULL DEFAULT false;

-- ── 2. 編集履歴 ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.note_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id    uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT '',
  body       text NOT NULL DEFAULT '',
  edited_by  text,                              -- この版を書いた人
  edited_at  timestamptz NOT NULL,              -- この版が保存された日時
  created_at timestamptz NOT NULL DEFAULT now() -- 履歴として残した日時(=次の保存が行われた日時)
);
CREATE INDEX IF NOT EXISTS idx_note_versions_note ON public.note_versions(note_id, edited_at DESC);

ALTER TABLE public.note_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_note_versions" ON public.note_versions;
CREATE POLICY "allow_all_note_versions" ON public.note_versions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
