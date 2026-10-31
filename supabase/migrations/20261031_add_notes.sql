-- ============================================================
-- ノート機能 (個人用ノート / 業務周知・ナレッジ蓄積)
--   note_folders   : フォルダ(2階層まで・アプリ側で制限)
--   notes          : ノート本体(本文は HTML)
--   note_reads     : 周知ノートの「確認しました」記録
--   note_templates : 定型文テンプレート(案件の備考用など)
--   Storage        : note-images バケット(ノートに貼り付けた画像)
--
-- 公開範囲 visibility:
--   private : 自分のみ
--   public  : 全員
--   admin   : 管理者のみ
--   members : 特定メンバーのみ(shared_with に名前の配列)
--
-- ※ このアプリは Supabase Auth を使わず anon キーで動くため、
--    他の既存テーブルと同様に RLS は全許可です。
--    非公開の制御はアプリ側(絞り込み)で行います。
-- ============================================================

-- ── 1. フォルダ ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.note_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner       text NOT NULL,
  name        text NOT NULL,
  parent_id   uuid REFERENCES public.note_folders(id) ON DELETE CASCADE,
  visibility  text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public', 'admin', 'members')),
  shared_with text[] NOT NULL DEFAULT '{}',
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_note_folders_owner ON public.note_folders(owner);

-- ── 2. ノート ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner           text NOT NULL,
  folder_id       uuid REFERENCES public.note_folders(id) ON DELETE SET NULL,
  title           text NOT NULL DEFAULT '',
  body            text NOT NULL DEFAULT '',
  visibility      text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public', 'admin', 'members')),
  shared_with     text[] NOT NULL DEFAULT '{}',
  pinned          boolean NOT NULL DEFAULT false,
  tags            text[] NOT NULL DEFAULT '{}',
  is_announcement boolean NOT NULL DEFAULT false,   -- 周知中か
  announced_at    timestamptz,                      -- 最後に周知した日時(再周知で更新)
  source_call_id  uuid,                             -- 案件備考から作成した場合の元案件ID
  source_snapshot jsonb,                            -- 元案件の控え(ランク・日時など)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text
);
CREATE INDEX IF NOT EXISTS idx_notes_owner        ON public.notes(owner);
CREATE INDEX IF NOT EXISTS idx_notes_folder       ON public.notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notes_announcement ON public.notes(is_announcement) WHERE is_announcement;

-- ── 3. 既読(確認しました) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.note_reads (
  note_id   uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_name text NOT NULL,
  read_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (note_id, user_name)
);

-- ── 4. 定型文テンプレート ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.note_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner      text NOT NULL,
  name       text NOT NULL,
  body       text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_note_templates_owner ON public.note_templates(owner);

-- ── 5. RLS (他テーブルと同じ全許可) ─────────────────────────
ALTER TABLE public.note_folders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_reads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_note_folders"   ON public.note_folders;
DROP POLICY IF EXISTS "allow_all_notes"          ON public.notes;
DROP POLICY IF EXISTS "allow_all_note_reads"     ON public.note_reads;
DROP POLICY IF EXISTS "allow_all_note_templates" ON public.note_templates;

CREATE POLICY "allow_all_note_folders"   ON public.note_folders   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notes"          ON public.notes          FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_note_reads"     ON public.note_reads     FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_note_templates" ON public.note_templates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── 6. Realtime (周知通知・一覧の自動更新用) ────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notes', 'note_folders', 'note_reads', 'note_templates'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL; -- すでに登録済み
    END;
  END LOOP;
END $$;

-- ── 7. Storage: ノート画像バケット ──────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('note-images', 'note-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "note_images_select" ON storage.objects;
DROP POLICY IF EXISTS "note_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "note_images_delete" ON storage.objects;

CREATE POLICY "note_images_select" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'note-images');
CREATE POLICY "note_images_insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'note-images');
CREATE POLICY "note_images_delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'note-images');
