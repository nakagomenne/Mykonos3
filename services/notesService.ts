// services/notesService.ts
// ============================================================
// ノート機能のデータ層 (Supabase)
//   - フォルダ / ノート / 既読 / 定型文テンプレート の CRUD
//   - 画像アップロード (Storage: note-images)
//   - 公開範囲の判定ロジック (canViewNote など)
//
// ※ このアプリは Supabase Auth を使わず anon キーで動くため、
//    非公開ノートの制御は「取得時の絞り込み + 表示時の判定」で行う。
// ============================================================

import { supabase } from '../lib/supabaseClient';
import {
  Note, NoteFolder, NoteRead, NoteTemplate, NoteVisibility, NoteSourceSnapshot, User,
} from '../types';

// ────────────────────────────────────────────────────────────
// 共通ヘルパー
// ────────────────────────────────────────────────────────────

/** テーブル未作成(マイグレーション未適用)かどうか */
export function isMissingTableError(error: any): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    String(error.message ?? '').includes('schema cache') ||
    String(error.message ?? '').includes('does not exist')
  );
}

export class NotesUnavailableError extends Error {
  constructor() {
    super('ノート機能のテーブルがまだ作成されていません。Supabase に 20261031_add_notes.sql を適用してください。');
    this.name = 'NotesUnavailableError';
  }
}

function fail(prefix: string, error: any): never {
  if (isMissingTableError(error)) throw new NotesUnavailableError();
  throw new Error(`${prefix}: ${error?.message ?? error}`);
}

/** PostgREST の .or() フィルタ用に値をクォートする */
function q(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// ────────────────────────────────────────────────────────────
// 公開範囲の判定
// ────────────────────────────────────────────────────────────

type Viewer = Pick<User, 'name' | 'isAdmin' | 'isSuperAdmin'>;

export const isViewerAdmin = (viewer: Viewer): boolean => !!(viewer.isAdmin || viewer.isSuperAdmin);

interface Shareable {
  owner: string;
  visibility: NoteVisibility;
  sharedWith: string[];
}

/** viewer がこのノート/フォルダを閲覧できるか */
export function canView(item: Shareable, viewer: Viewer): boolean {
  if (item.owner === viewer.name) return true;
  switch (item.visibility) {
    case 'public':  return true;
    case 'admin':   return isViewerAdmin(viewer);
    case 'members': return item.sharedWith.includes(viewer.name);
    default:        return false;
  }
}

/** 公開範囲ごとの「読む人」の名前一覧(オーナー本人を除く)。周知の既読確認の対象 */
export function getRecipients(item: Shareable, users: User[]): string[] {
  const names = users.map(u => u.name).filter(n => n !== item.owner);
  switch (item.visibility) {
    case 'public':  return names;
    case 'admin':   return users.filter(u => u.name !== item.owner && (u.isAdmin || u.isSuperAdmin)).map(u => u.name);
    case 'members': return item.sharedWith.filter(n => n !== item.owner && names.includes(n));
    default:        return [];
  }
}

export const VISIBILITY_LABELS: Record<NoteVisibility, string> = {
  private: '非公開',
  public:  '全員',
  admin:   '管理者のみ',
  members: '特定メンバー',
};

// ────────────────────────────────────────────────────────────
// 行 ⇔ 型 の変換
// ────────────────────────────────────────────────────────────

function rowToFolder(row: any): NoteFolder {
  return {
    id:         row.id,
    owner:      row.owner,
    name:       row.name,
    parentId:   row.parent_id ?? null,
    visibility: row.visibility,
    sharedWith: row.shared_with ?? [],
    sortOrder:  row.sort_order ?? 0,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  };
}

export function rowToNote(row: any): Note {
  return {
    id:              row.id,
    owner:           row.owner,
    folderId:        row.folder_id ?? null,
    title:           row.title ?? '',
    body:            row.body ?? '',
    visibility:      row.visibility,
    sharedWith:      row.shared_with ?? [],
    pinned:          row.pinned ?? false,
    tags:            row.tags ?? [],
    isAnnouncement:  row.is_announcement ?? false,
    announcedAt:     row.announced_at ?? null,
    sourceCallId:    row.source_call_id ?? null,
    sourceSnapshot:  row.source_snapshot ?? null,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
    updatedBy:       row.updated_by ?? null,
  };
}

export function rowToFolderPublic(row: any): NoteFolder { return rowToFolder(row); }

function rowToRead(row: any): NoteRead {
  return { noteId: row.note_id, userName: row.user_name, readAt: row.read_at, hidden: row.hidden ?? false };
}

function rowToTemplate(row: any): NoteTemplate {
  return {
    id:         row.id,
    owner:      row.owner,
    name:       row.name,
    body:       row.body ?? '',
    visibility: row.visibility,
    sortOrder:  row.sort_order ?? 0,
    createdAt:  row.created_at,
  };
}

// ────────────────────────────────────────────────────────────
// フォルダ
// ────────────────────────────────────────────────────────────

/** 閲覧可能なフォルダを取得(自分のもの + 公開されているもの) */
export async function fetchFolders(viewer: Viewer): Promise<NoteFolder[]> {
  let query = supabase.from('note_folders').select('*');
  const conds = [`owner.eq.${q(viewer.name)}`, 'visibility.eq.public',
    `and(visibility.eq.members,shared_with.cs.{${q(viewer.name)}})`];
  if (isViewerAdmin(viewer)) conds.push('visibility.eq.admin');
  query = query.or(conds.join(','));
  const { data, error } = await query.order('sort_order', { ascending: true }).order('created_at', { ascending: true });
  if (error) fail('フォルダの取得に失敗しました', error);
  return (data ?? []).map(rowToFolder);
}

export async function createFolder(params: {
  owner: string; name: string; parentId: string | null;
  visibility?: NoteVisibility; sharedWith?: string[]; sortOrder?: number;
}): Promise<NoteFolder> {
  const { data, error } = await supabase
    .from('note_folders')
    .insert({
      owner: params.owner,
      name: params.name,
      parent_id: params.parentId,
      visibility: params.visibility ?? 'private',
      shared_with: params.sharedWith ?? [],
      sort_order: params.sortOrder ?? 0,
    })
    .select('*')
    .single();
  if (error) fail('フォルダの作成に失敗しました', error);
  return rowToFolder(data);
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('note_folders').update({ name, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) fail('フォルダ名の変更に失敗しました', error);
}

/**
 * フォルダの公開範囲を変更し、中のノートと子フォルダにも同じ設定を適用する
 * (「フォルダの設定を引き継ぐ」仕様)
 */
export async function updateFolderVisibility(
  folderId: string, childFolderIds: string[], visibility: NoteVisibility, sharedWith: string[]
): Promise<void> {
  const ids = [folderId, ...childFolderIds];
  const now = new Date().toISOString();
  const { error: e1 } = await supabase
    .from('note_folders')
    .update({ visibility, shared_with: sharedWith, updated_at: now })
    .in('id', ids);
  if (e1) fail('フォルダの公開範囲の変更に失敗しました', e1);
  const { error: e2 } = await supabase
    .from('notes')
    .update({ visibility, shared_with: sharedWith, updated_at: now })
    .in('folder_id', ids);
  if (e2) fail('フォルダ内ノートの公開範囲の変更に失敗しました', e2);
}

/** フォルダ削除。中のノートは「未整理」に移動(DB の ON DELETE SET NULL)、子フォルダは一緒に削除 */
export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from('note_folders').delete().eq('id', id);
  if (error) fail('フォルダの削除に失敗しました', error);
}

// ────────────────────────────────────────────────────────────
// ノート
// ────────────────────────────────────────────────────────────

/** 閲覧可能なノートを取得(自分のもの + 公開されているもの) */
export async function fetchNotes(viewer: Viewer): Promise<Note[]> {
  const conds = [`owner.eq.${q(viewer.name)}`, 'visibility.eq.public',
    `and(visibility.eq.members,shared_with.cs.{${q(viewer.name)}})`];
  if (isViewerAdmin(viewer)) conds.push('visibility.eq.admin');
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .or(conds.join(','))
    .order('updated_at', { ascending: false })
    .limit(2000);
  if (error) fail('ノートの取得に失敗しました', error);
  return (data ?? []).map(rowToNote);
}

export interface NewNoteParams {
  owner: string;
  title?: string;
  body?: string;
  folderId?: string | null;
  visibility?: NoteVisibility;
  sharedWith?: string[];
  pinned?: boolean;
  tags?: string[];
  sourceCallId?: string | null;
  sourceSnapshot?: NoteSourceSnapshot | null;
}

export async function createNote(params: NewNoteParams): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .insert({
      owner: params.owner,
      title: params.title ?? '',
      body: params.body ?? '',
      folder_id: params.folderId ?? null,
      visibility: params.visibility ?? 'private',
      shared_with: params.sharedWith ?? [],
      pinned: params.pinned ?? false,
      tags: params.tags ?? [],
      source_call_id: params.sourceCallId ?? null,
      source_snapshot: params.sourceSnapshot ?? null,
      updated_by: params.owner,
    })
    .select('*')
    .single();
  if (error) fail('ノートの作成に失敗しました', error);
  return rowToNote(data);
}

export type NotePatch = Partial<Pick<Note,
  'title' | 'body' | 'folderId' | 'visibility' | 'sharedWith' | 'pinned' | 'tags'>>;

export async function updateNote(id: string, patch: NotePatch, editor: string): Promise<Note> {
  const row: Record<string, any> = { updated_at: new Date().toISOString(), updated_by: editor };
  if (patch.title      !== undefined) row.title       = patch.title;
  if (patch.body       !== undefined) row.body        = patch.body;
  if (patch.folderId   !== undefined) row.folder_id   = patch.folderId;
  if (patch.visibility !== undefined) row.visibility  = patch.visibility;
  if (patch.sharedWith !== undefined) row.shared_with = patch.sharedWith;
  if (patch.pinned     !== undefined) row.pinned      = patch.pinned;
  if (patch.tags       !== undefined) row.tags        = patch.tags;
  // 非公開に戻したら周知も解除
  if (patch.visibility === 'private') { row.is_announcement = false; }
  const { data, error } = await supabase.from('notes').update(row).eq('id', id).select('*').single();
  if (error) fail('ノートの保存に失敗しました', error);
  return rowToNote(data);
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) fail('ノートの削除に失敗しました', error);
}

/** 他人のノートを自分用にコピー(非公開・未整理で作成) */
export async function copyNoteToMine(note: Note, me: string): Promise<Note> {
  return createNote({
    owner: me,
    title: `${note.title || '無題'}(コピー)`,
    body: note.body,
    folderId: null,
    visibility: 'private',
    tags: note.tags,
  });
}

// ────────────────────────────────────────────────────────────
// 周知 / 既読確認
// ────────────────────────────────────────────────────────────

/** 周知する(再周知の場合は既読をリセットして全員に再確認してもらう) */
export async function announceNote(noteId: string, editor: string): Promise<Note> {
  const { error: delErr } = await supabase.from('note_reads').delete().eq('note_id', noteId);
  if (delErr && !isMissingTableError(delErr)) fail('既読のリセットに失敗しました', delErr);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('notes')
    .update({ is_announcement: true, announced_at: now, updated_at: now, updated_by: editor })
    .eq('id', noteId)
    .select('*')
    .single();
  if (error) fail('周知に失敗しました', error);
  return rowToNote(data);
}

export async function unannounceNote(noteId: string, editor: string): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .update({ is_announcement: false, updated_at: new Date().toISOString(), updated_by: editor })
    .eq('id', noteId)
    .select('*')
    .single();
  if (error) fail('周知の解除に失敗しました', error);
  return rowToNote(data);
}

/** 閲覧可能な周知ノートの既読情報を取得 */
export async function fetchNoteReads(noteIds: string[]): Promise<NoteRead[]> {
  if (noteIds.length === 0) return [];
  const { data, error } = await supabase.from('note_reads').select('*').in('note_id', noteIds);
  if (error) fail('既読情報の取得に失敗しました', error);
  return (data ?? []).map(rowToRead);
}

/** note_reads.hidden 列が未作成のときは、実行すべきSQLを案内する */
function failHidden(prefix: string, error: any): never {
  if (String(error?.message ?? '').includes('hidden')) {
    throw new Error(`${prefix}: データベースの更新が必要です(supabase/migrations/20261101_add_note_reads_hidden.sql を実行してください)`);
  }
  return fail(prefix, error);
}

/** 「確認しました」を記録する。hidden=true なら、同時に周知の一覧から非表示にする */
export async function markNoteRead(noteId: string, userName: string, hidden = false): Promise<NoteRead> {
  const row: Record<string, unknown> = { note_id: noteId, user_name: userName, read_at: new Date().toISOString() };
  if (hidden) row.hidden = true;   // 非表示にしない場合は hidden 列に触れない(未適用のDBでも確認だけは通る)
  const { data, error } = await supabase
    .from('note_reads')
    .upsert(row)
    .select('*')
    .single();
  if (error) failHidden('確認の記録に失敗しました', error);
  return rowToRead(data);
}

/** 既に確認済みの周知の「非表示」だけを切り替える(確認日時は変えない) */
export async function setNoteReadHidden(noteId: string, userName: string, hidden: boolean): Promise<NoteRead> {
  const { data, error } = await supabase
    .from('note_reads')
    .update({ hidden })
    .eq('note_id', noteId)
    .eq('user_name', userName)
    .select('*')
    .single();
  if (error) failHidden('非表示の切り替えに失敗しました', error);
  return rowToRead(data);
}

// ────────────────────────────────────────────────────────────
// 定型文テンプレート
// ────────────────────────────────────────────────────────────

/** 自分の定型文 + 公開されている定型文 */
export async function fetchTemplates(userName: string): Promise<NoteTemplate[]> {
  const { data, error } = await supabase
    .from('note_templates')
    .select('*')
    .or(`owner.eq.${q(userName)},visibility.eq.public`)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    // 定型文ピッカーは各フォームに埋め込まれるため、未作成時は黙って空を返す
    if (isMissingTableError(error)) return [];
    fail('定型文の取得に失敗しました', error);
  }
  return (data ?? []).map(rowToTemplate);
}

export async function saveTemplate(params: {
  id?: string; owner: string; name: string; body: string; visibility: 'private' | 'public';
}): Promise<NoteTemplate> {
  const row = {
    owner: params.owner, name: params.name, body: params.body,
    visibility: params.visibility, updated_at: new Date().toISOString(),
  };
  const query = params.id
    ? supabase.from('note_templates').update(row).eq('id', params.id)
    : supabase.from('note_templates').insert(row);
  const { data, error } = await query.select('*').single();
  if (error) fail('定型文の保存に失敗しました', error);
  return rowToTemplate(data);
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('note_templates').delete().eq('id', id);
  if (error) fail('定型文の削除に失敗しました', error);
}

// ────────────────────────────────────────────────────────────
// 画像アップロード (Storage: note-images)
// ────────────────────────────────────────────────────────────

const NOTE_IMAGE_BUCKET = 'note-images';
const MAX_IMAGE_EDGE = 1600;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** 画像を最大辺 1600px に縮小(GIF はアニメ維持のためそのまま) */
async function shrinkImage(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  if (file.type === 'image/gif') return { blob: file, ext: 'gif', type: 'image/gif' };
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('画像を読み込めませんでした'));
      el.src = bitmapUrl;
    });
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      return { blob: file, ext, type: file.type || 'image/jpeg' };
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像の変換に失敗しました');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const keepPng = file.type === 'image/png';
    const type = keepPng ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('画像の変換に失敗しました'))), type, 0.85));
    return { blob, ext: keepPng ? 'png' : 'jpg', type };
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

/** 画像を Storage にアップロードして公開 URL を返す */
export async function uploadNoteImage(file: File, owner: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイルを選択してください');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('画像サイズは8MB以下にしてください');
  const { blob, ext, type } = await shrinkImage(file);
  const id = (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Storage のキーに日本語などは使わず、所有者フォルダは付けずに UUID だけにする
  const path = `${new Date().toISOString().slice(0, 7)}/${id}.${ext}`;
  const { error } = await supabase.storage
    .from(NOTE_IMAGE_BUCKET)
    .upload(path, blob, { contentType: type, upsert: false });
  if (error) {
    throw new Error(
      `画像のアップロードに失敗しました: ${error.message}\n` +
      '(Supabase に note-images バケットが作成されているか確認してください)'
    );
  }
  void owner;
  return supabase.storage.from(NOTE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ────────────────────────────────────────────────────────────
// Realtime
// ────────────────────────────────────────────────────────────

export interface NotesRealtimeCallbacks {
  onNote?: (event: 'INSERT' | 'UPDATE' | 'DELETE', row: any, oldRow: any) => void;
  onFolder?: (event: 'INSERT' | 'UPDATE' | 'DELETE', row: any, oldRow: any) => void;
  onRead?: (event: 'INSERT' | 'UPDATE' | 'DELETE', row: any, oldRow: any) => void;
}

export function subscribeToNotes(cb: NotesRealtimeCallbacks): () => void {
  const channel = supabase
    .channel(`mykonos_notes_${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' },
      (p: any) => cb.onNote?.(p.eventType, p.new, p.old))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'note_folders' },
      (p: any) => cb.onFolder?.(p.eventType, p.new, p.old))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'note_reads' },
      (p: any) => cb.onRead?.(p.eventType, p.new, p.old))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
