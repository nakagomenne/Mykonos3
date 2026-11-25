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
  Note, NoteFolder, NoteRead, NoteTemplate, NoteVersion, NoteVisibility, NoteSourceSnapshot, User,
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

type Viewer = Pick<User, 'name' | 'isAdmin' | 'isSuperAdmin'> & { availableProducts?: string[] };

// ── 商材での公開 ──
// 「特定メンバー」の共有相手(shared_with)には、人の名前のほかに「商材の指定」も入れられる。
// 商材の指定は "@group:回線" の形で入れておき、見るたびに、その人の案内可能商材と照らし合わせる。
// (名前の一覧ではないので、あとから入った人も、その商材が付いていれば自動で見られる)
const GROUP_PREFIX = '@group:';
/** 商材の指定("@group:回線")を作る */
export const groupToken = (product: string): string => `${GROUP_PREFIX}${product}`;
export const isGroupToken = (value: string): boolean => value.startsWith(GROUP_PREFIX);
/** 共有相手のうち、商材の指定(商材名の一覧) */
export const sharedGroups = (sharedWith: string[]): string[] =>
  sharedWith.filter(isGroupToken).map(s => s.slice(GROUP_PREFIX.length));
/** 共有相手のうち、個別に選んだ人の名前 */
export const sharedNames = (sharedWith: string[]): string[] => sharedWith.filter(s => !isGroupToken(s));
/** 共有相手の短い表示(例: 「回線・水 +2名」「3名」) */
export function sharedLabel(sharedWith: string[]): string {
  const groups = sharedGroups(sharedWith);
  const names = sharedNames(sharedWith).length;
  if (groups.length === 0) return `${names}名`;
  return `${groups.join('・')}${names > 0 ? ` +${names}名` : ''}`;
}
/** この人が、共有相手に入っているか(名前で選ばれている / 指定された商材を案内できる) */
function inSharedWith(sharedWith: string[], person: { name: string; availableProducts?: string[] }): boolean {
  if (sharedWith.includes(person.name)) return true;
  const products = person.availableProducts ?? [];
  return products.length > 0 && sharedGroups(sharedWith).some(g => products.includes(g));
}

export const isViewerAdmin = (viewer: Viewer): boolean => !!(viewer.isAdmin || viewer.isSuperAdmin);

interface Shareable {
  owner: string;
  visibility: NoteVisibility;
  sharedWith: string[];
  isAnnouncement?: boolean;
  announcedAt?: string | null;
}

/**
 * アナウンスされたあとに入ってきた人か。
 * あとから入った人は、そのアナウンスを読めるが「未確認」には数えない(入った初日に、過去のアナウンスが未確認で並ばないように)。
 * 名前で個別に選ばれている人は、あとから入った人でも数える(わざわざ足した相手なので)
 */
export function joinedAfterAnnounce(item: Shareable, person: { name: string; createdAt?: string }): boolean {
  if (!item.isAnnouncement || !item.announcedAt || !person.createdAt) return false;
  if (item.visibility === 'members' && item.sharedWith.includes(person.name)) return false;
  const joined = Date.parse(person.createdAt);
  const announced = Date.parse(item.announcedAt);
  return Number.isFinite(joined) && Number.isFinite(announced) && joined > announced;
}

/** viewer がこのノート/フォルダを閲覧できるか */
export function canView(item: Shareable, viewer: Viewer): boolean {
  if (item.owner === viewer.name) return true;
  switch (item.visibility) {
    case 'public':  return true;
    case 'admin':   return isViewerAdmin(viewer);
    case 'members': return inSharedWith(item.sharedWith, viewer);
    default:        return false;
  }
}

/** 公開範囲ごとの「読む人」の名前一覧(オーナー本人を除く)。アナウンスの既読確認の対象 */
export function getRecipients(item: Shareable, users: User[]): string[] {
  // ボット(人が使わないメンバー)は、読んでもらう相手に数えない
  // アナウンスのあとに入ってきた人も、数えない(joinedAfterAnnounce を参照)
  const people = users.filter(u => !u.isBot && u.name !== item.owner && !joinedAfterAnnounce(item, u));
  switch (item.visibility) {
    case 'public':  return people.map(u => u.name);
    case 'admin':   return people.filter(u => u.isAdmin || u.isSuperAdmin).map(u => u.name);
    case 'members': return people.filter(u => inSharedWith(item.sharedWith, u)).map(u => u.name);
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
    allowEdit:       row.allow_edit ?? false,
    announceImportant: row.announce_important ?? false,
    announceDue:     row.announce_due ?? null,
  };
}

/** viewer がこのノートの本文を編集できるか(オーナー、または共同編集がオンで見られる人) */
export function canEditNote(note: Note, viewer: Viewer): boolean {
  if (note.owner === viewer.name) return true;
  return note.allowEdit && canView(note, viewer);
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
  // 自分が案内できる商材で公開されているもの
  (viewer.availableProducts ?? []).forEach(p => conds.push(`and(visibility.eq.members,shared_with.cs.{${q(groupToken(p))}})`));
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
 * フォルダの公開範囲を変更する(サブフォルダにも同じ設定を適用する)。
 * 中のノートの公開範囲は変えない(ノートごとの設定のまま)。
 * フォルダの公開範囲は、そのフォルダで新しく作るノートの「最初の設定」として使われる
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
}

/**
 * フォルダ(サブフォルダを含む)に入っている、自分のノートの公開範囲を、まとめて同じ設定にする。
 * 更新日時は変えない(一覧の並び順を動かさないため)
 */
export async function updateNotesVisibilityInFolders(
  folderIds: string[], owner: string, visibility: NoteVisibility, sharedWith: string[]
): Promise<void> {
  if (folderIds.length === 0) return;
  const { error } = await supabase
    .from('notes')
    .update({ visibility, shared_with: sharedWith })
    .eq('owner', owner)
    .in('folder_id', folderIds);
  if (error) fail('ノートの公開範囲の変更に失敗しました', error);
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
  // 自分が案内できる商材で公開されているもの
  (viewer.availableProducts ?? []).forEach(p => conds.push(`and(visibility.eq.members,shared_with.cs.{${q(groupToken(p))}})`));
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
  'title' | 'body' | 'folderId' | 'visibility' | 'sharedWith' | 'pinned' | 'tags' | 'allowEdit'>>;

/** 共同編集・編集履歴用のDB更新(20261123_add_note_versions_and_coedit.sql)がまだのときの案内 */
const NOTE_EXT_SQL_HINT =
  'データベースの更新が必要です(supabase/migrations/20261123_add_note_versions_and_coedit.sql を実行してください)';

export async function updateNote(id: string, patch: NotePatch, editor: string): Promise<Note> {
  const row: Record<string, any> = { updated_at: new Date().toISOString(), updated_by: editor };
  if (patch.title      !== undefined) row.title       = patch.title;
  if (patch.body       !== undefined) row.body        = patch.body;
  if (patch.folderId   !== undefined) row.folder_id   = patch.folderId;
  if (patch.visibility !== undefined) row.visibility  = patch.visibility;
  if (patch.sharedWith !== undefined) row.shared_with = patch.sharedWith;
  if (patch.pinned     !== undefined) row.pinned      = patch.pinned;
  if (patch.tags       !== undefined) row.tags        = patch.tags;
  if (patch.allowEdit  !== undefined) row.allow_edit  = patch.allowEdit;
  // 非公開に戻したらアナウンスも解除
  if (patch.visibility === 'private') { row.is_announcement = false; }
  const { data, error } = await supabase.from('notes').update(row).eq('id', id).select('*').single();
  if (error) {
    if (patch.allowEdit !== undefined && String(error?.message ?? '').includes('allow_edit')) {
      throw new Error(`共同編集の設定を保存できませんでした: ${NOTE_EXT_SQL_HINT}`);
    }
    fail('ノートの保存に失敗しました', error);
  }
  return rowToNote(data);
}

// ────────────────────────────────────────────────────────────
// 編集履歴
// ────────────────────────────────────────────────────────────

/** 1ノートにつき残す履歴の件数(これより古いものは保存のたびに整理する) */
export const NOTE_VERSION_LIMIT = 30;

function rowToVersion(row: any): NoteVersion {
  return {
    id:       row.id,
    noteId:   row.note_id,
    title:    row.title ?? '',
    body:     row.body ?? '',
    editedBy: row.edited_by ?? null,
    editedAt: row.edited_at,
  };
}

/**
 * 保存前の内容を履歴に1件残す(タイトル・本文を書き換える直前に呼ぶ)。
 * 履歴はおまけの保険なので、失敗しても(テーブル未作成を含む)ノートの保存は止めない。
 */
export async function saveNoteVersion(prev: Note): Promise<void> {
  try {
    const { error } = await supabase.from('note_versions').insert({
      note_id: prev.id,
      title: prev.title,
      body: prev.body,
      edited_by: prev.updatedBy ?? prev.owner,
      edited_at: prev.updatedAt,
    });
    if (error) return;
    // 古い履歴を整理(新しいものから NOTE_VERSION_LIMIT 件だけ残す)
    const { data: old } = await supabase
      .from('note_versions')
      .select('id')
      .eq('note_id', prev.id)
      .order('edited_at', { ascending: false })
      .range(NOTE_VERSION_LIMIT, NOTE_VERSION_LIMIT + 199);
    const ids = (old ?? []).map((r: any) => r.id);
    if (ids.length > 0) await supabase.from('note_versions').delete().in('id', ids);
  } catch { /* 履歴を残せなくても保存は続ける */ }
}

/** ノートの編集履歴を新しい順に取得 */
export async function fetchNoteVersions(noteId: string): Promise<NoteVersion[]> {
  const { data, error } = await supabase
    .from('note_versions')
    .select('*')
    .eq('note_id', noteId)
    .order('edited_at', { ascending: false })
    .limit(NOTE_VERSION_LIMIT);
  if (error) {
    if (isMissingTableError(error)) throw new Error(`履歴はまだ使えません: ${NOTE_EXT_SQL_HINT}`);
    throw new Error(`履歴の取得に失敗しました: ${error.message}`);
  }
  return (data ?? []).map(rowToVersion);
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
// アナウンス / 既読確認
// ────────────────────────────────────────────────────────────

/** アナウンスする(再アナウンスの場合は既読をリセットして全員に再確認してもらう) */
/** アナウンスのオプション(重要 / 確認の期限) */
export interface AnnounceOptions {
  important?: boolean;
  /** YYYY-MM-DD。期限なしは null */
  due?: string | null;
}

const ANNOUNCE_OPT_SQL_HINT =
  'データベースの更新が必要です(supabase/migrations/20261124_add_note_announce_options.sql を実行してください)';

/** 期限が過ぎているか(期限の日の間はまだ過ぎていない) */
export function isAnnounceOverdue(due: string | null | undefined): boolean {
  if (!due) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return due < today;
}

/** 期限を「11/25」の形にする */
export function formatAnnounceDue(due: string): string {
  const [, m, d] = due.split('-');
  return `${Number(m)}/${Number(d)}`;
}

export async function announceNote(noteId: string, editor: string, opts: AnnounceOptions = {}): Promise<Note> {
  const { error: delErr } = await supabase.from('note_reads').delete().eq('note_id', noteId);
  if (delErr && !isMissingTableError(delErr)) fail('既読のリセットに失敗しました', delErr);
  const now = new Date().toISOString();
  const base = { is_announcement: true, announced_at: now, updated_at: now, updated_by: editor };
  const extras = { announce_important: !!opts.important, announce_due: opts.due || null };
  let { data, error } = await supabase
    .from('notes').update({ ...base, ...extras }).eq('id', noteId).select('*').single();
  if (error && /announce_important|announce_due/.test(String(error?.message ?? ''))) {
    // 「重要」「期限」の項目がまだデータベースに無い場合
    if (opts.important || opts.due) {
      throw new Error(`「重要」「期限」を付けられませんでした: ${ANNOUNCE_OPT_SQL_HINT}`);
    }
    ({ data, error } = await supabase.from('notes').update(base).eq('id', noteId).select('*').single());
  }
  if (error) fail('アナウンスに失敗しました', error);
  return rowToNote(data);
}

export async function unannounceNote(noteId: string, editor: string): Promise<Note> {
  const { data, error } = await supabase
    .from('notes')
    .update({ is_announcement: false, updated_at: new Date().toISOString(), updated_by: editor })
    .eq('id', noteId)
    .select('*')
    .single();
  if (error) fail('アナウンスの解除に失敗しました', error);
  return rowToNote(data);
}

/** 閲覧可能なアナウンスノートの既読情報を取得 */
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

/** 「確認しました」を記録する。hidden=true なら、同時にアナウンスの一覧から非表示にする */
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

/** 既に確認済みのアナウンスの「非表示」だけを切り替える(確認日時は変えない) */
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
// 添付ファイル (画像以外。PDF・Excel など。画像と同じバケットの files/ 以下に置く)
// ────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** 音声(通話の録音など)は長くなりやすいので、ほかのファイルより大きくまで受け付ける */
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const AUDIO_EXTS = new Set(['mp3', 'm4a', 'wav', 'aac', 'ogg', 'oga', 'opus', 'flac', 'weba', 'amr', 'wma']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'm4v', 'avi', 'wmv', 'mkv', 'webm', 'mpg', 'mpeg', '3gp']);
/** 開くと動いてしまう種類のファイルは添付させない */
const BLOCKED_FILE_EXTS = new Set([
  'exe', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'js', 'jse', 'wsf', 'lnk', 'jar',
  'html', 'htm', 'xhtml', 'svg', 'hta', 'dll', 'apk', 'sh',
]);

/** 添付ファイルを Storage にアップロードして、元のファイル名でダウンロードできる URL を返す */
export async function uploadNoteFile(file: File): Promise<{ url: string; name: string; kind: 'audio' | 'file' }> {
  const name = file.name || 'file';
  const ext = (name.includes('.') ? name.split('.').pop() ?? '' : '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!ext) throw new Error('拡張子のないファイルは添付できません');
  if (BLOCKED_FILE_EXTS.has(ext)) throw new Error(`「.${ext}」のファイルは添付できません`);
  const isVideo = file.type.startsWith('video/') || VIDEO_EXTS.has(ext);
  const isAudio = !isVideo && (file.type.startsWith('audio/') || AUDIO_EXTS.has(ext));
  if (isAudio && file.size > MAX_AUDIO_BYTES) throw new Error('音声ファイルは50MB以下にしてください');
  if (isVideo && file.size > MAX_FILE_BYTES) {
    throw new Error('動画は20MBを超えると添付できません。Google ドライブや YouTube に置いて、「動画リンク」から貼ってください(ノートの中で再生できます)');
  }
  if (!isAudio && file.size > MAX_FILE_BYTES) throw new Error('添付ファイルは20MB以下にしてください');
  const id = (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Storage のキーに日本語などは使わない(元のファイル名はダウンロード時の名前として URL に付ける)
  const path = `${new Date().toISOString().slice(0, 7)}/files/${id}.${ext}`;
  const { error } = await supabase.storage
    .from(NOTE_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error(`ファイルのアップロードに失敗しました: ${error.message}`);
  const url = supabase.storage.from(NOTE_IMAGE_BUCKET).getPublicUrl(path, { download: name }).data.publicUrl;
  return { url, name, kind: isAudio ? 'audio' : 'file' };
}

// ────────────────────────────────────────────────────────────
// アナウンスの再通知(まだ確認していない人にだけ、もう一度知らせる)
// DB は書き換えず、いま Mykonos を開いている人へ合図だけを送る
// ────────────────────────────────────────────────────────────

export function subscribeToAnnounceReminders(onRemind: (noteId: string) => void): {
  send: (noteId: string) => Promise<void>;
  unsubscribe: () => void;
} {
  const channel = supabase
    .channel('mykonos_note_remind')
    .on('broadcast', { event: 'remind' }, (msg: any) => {
      const id = msg?.payload?.noteId;
      if (typeof id === 'string') onRemind(id);
    })
    .subscribe();
  return {
    send: async (noteId: string) => {
      const res = await channel.send({ type: 'broadcast', event: 'remind', payload: { noteId } });
      if (res !== 'ok') throw new Error('再通知を送れませんでした。少し待ってから、もう一度お試しください');
    },
    unsubscribe: () => { void supabase.removeChannel(channel); },
  };
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

// ────────────────────────────────────────────────────────────
// コメント
// ────────────────────────────────────────────────────────────

export interface NoteComment {
  id: string;
  noteId: string;
  author: string;
  body: string;
  createdAt: string;
  /** 本文の「ここ」に付けたコメントのとき、その文字(ノート全体へのコメントは null) */
  anchorText: string | null;
  /** その直前・直後の文字(同じ文字が何回も出るときに、場所を見分けるため) */
  anchorPrefix: string | null;
  anchorSuffix: string | null;
  /** 返信のとき、もとのコメントのID */
  parentId: string | null;
}

export const NOTE_COMMENT_MAX = 500;

/** コメント用のテーブルがまだ無い(SQL 未実行)。このときは、コメント欄を出さない */
export class NoteCommentsUnavailableError extends Error {
  constructor() {
    super('ノートのコメント用のテーブルがまだ作成されていません(supabase/migrations/20261126_add_note_comments.sql を実行してください)');
    this.name = 'NoteCommentsUnavailableError';
  }
}

const failComment = (prefix: string, error: any): never => {
  if (isMissingTableError(error)) throw new NoteCommentsUnavailableError();
  throw new Error(`${prefix}: ${error?.message ?? error}`);
};

export const rowToNoteComment = (row: any): NoteComment => ({
  id: row.id, noteId: row.note_id, author: row.author, body: row.body ?? '', createdAt: row.created_at,
  anchorText: row.anchor_text || null, anchorPrefix: row.anchor_prefix ?? null, anchorSuffix: row.anchor_suffix ?? null,
  parentId: row.parent_id ?? null,
});

const NOTE_COMMENT_ANCHOR_SQL_HINT = 'データベースの更新が必要です(supabase/migrations/20261128_add_note_comment_anchors.sql を実行してください)';

let anchorsAvailableCache: boolean | null = null;
/**
 * 「本文の場所に付けるコメント」と「返信」が使えるか(追加の SQL を実行済みか)。
 * 使えると分かったら覚えておく(使えないあいだは、SQL を実行したあとに気づけるよう毎回確かめる)
 */
export async function fetchNoteCommentAnchorsAvailable(): Promise<boolean> {
  if (anchorsAvailableCache) return true;
  try {
    const { error } = await supabase.from('note_comments').select('id,anchor_text,anchor_prefix,anchor_suffix,parent_id').limit(1);
    anchorsAvailableCache = !error;
  } catch {
    anchorsAvailableCache = false;
  }
  return !!anchorsAvailableCache;
}

/** ノートのコメントを、古いものから順に取得 */
export async function fetchNoteComments(noteId: string): Promise<NoteComment[]> {
  const { data, error } = await supabase
    .from('note_comments').select('*').eq('note_id', noteId).order('created_at', { ascending: true });
  if (error) failComment('コメントの取得に失敗しました', error);
  return (data ?? []).map(rowToNoteComment);
}

export async function addNoteComment(
  noteId: string, author: string, body: string,
  extra: { anchor?: { text: string; prefix: string; suffix: string }; parentId?: string } = {}
): Promise<NoteComment> {
  // 場所・返信の欄は、使うときだけ送る(追加の SQL を実行する前でも、ふつうのコメントは送れるように)
  const row: Record<string, unknown> = { note_id: noteId, author, body };
  if (extra.anchor) {
    row.anchor_text = extra.anchor.text;
    row.anchor_prefix = extra.anchor.prefix;
    row.anchor_suffix = extra.anchor.suffix;
  }
  if (extra.parentId) row.parent_id = extra.parentId;
  const { data, error } = await supabase.from('note_comments').insert(row).select('*').single();
  if (error && (extra.anchor || extra.parentId) && (error.code === 'PGRST204' || error.code === '42703')) {
    throw new Error(NOTE_COMMENT_ANCHOR_SQL_HINT);
  }
  if (error) failComment('コメントの送信に失敗しました', error);
  return rowToNoteComment(data);
}

export async function deleteNoteComment(id: string): Promise<void> {
  const { error } = await supabase.from('note_comments').delete().eq('id', id);
  if (error) failComment('コメントの削除に失敗しました', error);
}

/** コメントの追加・削除を受け取る(ノートの本体とは別のチャンネル。テーブルが無くても、ほかに影響しない) */
export function subscribeToNoteComments(
  onChange: (event: 'INSERT' | 'UPDATE' | 'DELETE', row: any) => void
): () => void {
  const channel = supabase
    .channel(`mykonos_note_comments_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'note_comments' },
      (p: any) => onChange(p.eventType, p.eventType === 'DELETE' ? p.old : p.new))
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

// ────────────────────────────────────────────────────────────
// 共有されたノートを、自分のフォルダに入れる(人ごとの置き場所)
// ────────────────────────────────────────────────────────────

/**
 * 自分が「自分のフォルダに入れた」共有ノートの一覧(ノートID → フォルダID)。
 * テーブルがまだ無い(SQL 未実行)ときは null を返す(このときは、入れる欄を出さない)
 */
export async function fetchNotePlacements(userName: string): Promise<Record<string, string> | null> {
  const { data, error } = await supabase.from('note_placements').select('*').eq('user_name', userName);
  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(`フォルダ分けの取得に失敗しました: ${error?.message ?? error}`);
  }
  const map: Record<string, string> = {};
  for (const row of data ?? []) if (row.note_id && row.folder_id) map[row.note_id] = row.folder_id;
  return map;
}

/** 共有されたノートを自分のフォルダに入れる(folderId が null なら、フォルダから出す)。原本の置き場所は変えない */
export async function setNotePlacement(noteId: string, userName: string, folderId: string | null): Promise<void> {
  const res = folderId
    ? await supabase.from('note_placements')
        .upsert({ note_id: noteId, user_name: userName, folder_id: folderId }, { onConflict: 'note_id,user_name' })
    : await supabase.from('note_placements').delete().eq('note_id', noteId).eq('user_name', userName);
  if (res.error) {
    if (isMissingTableError(res.error)) throw new Error('データベースの更新が必要です(supabase/migrations/20261127_add_note_placements.sql を実行してください)');
    throw new Error(`フォルダに入れられませんでした: ${res.error?.message ?? res.error}`);
  }
}

// ────────────────────────────────────────────────────────────
// 共有されたフォルダのうち、ふだん表示するもの(人ごと)
// ────────────────────────────────────────────────────────────

/** 共有フォルダを並べる場所: 'shared' = シェアノート / 'mine' = マイノート(自分のフォルダの並び) */
export type SharedFolderPlace = 'shared' | 'mine';

/**
 * 自分が「表示する」と選んだ共有フォルダ(フォルダID → 置き場所)。
 * 置き場所の欄がまだ無い(SQL 未実行)フォルダは、値が null になる(このときは、ブラウザに覚えた置き場所を使う)。
 * テーブルがまだ無い(SQL 未実行)ときは null を返す(このときは、すべてブラウザに覚える)
 */
export async function fetchShownSharedFolders(userName: string): Promise<Record<string, SharedFolderPlace | null> | null> {
  const { data, error } = await supabase.from('note_folder_shows').select('*').eq('user_name', userName);
  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(`共有フォルダの表示設定の取得に失敗しました: ${error?.message ?? error}`);
  }
  const map: Record<string, SharedFolderPlace | null> = {};
  for (const row of data ?? []) {
    if (row.folder_id) map[row.folder_id] = row.place === 'mine' ? 'mine' : row.place === 'shared' ? 'shared' : null;
  }
  return map;
}

/** 共有フォルダを、自分のフォルダ欄に表示する(place = 置き場所) / 表示しない(place = null) */
export async function setSharedFolderShown(folderId: string, userName: string, place: SharedFolderPlace | null): Promise<void> {
  if (!place) {
    const res = await supabase.from('note_folder_shows').delete().eq('folder_id', folderId).eq('user_name', userName);
    if (res.error) throw new Error(`共有フォルダの表示設定を保存できませんでした: ${res.error?.message ?? res.error}`);
    return;
  }
  let res = await supabase.from('note_folder_shows')
    .upsert({ folder_id: folderId, user_name: userName, place }, { onConflict: 'folder_id,user_name' });
  // 置き場所の欄がまだ無い(SQL 未実行)ときは、「表示する」だけを保存する(置き場所は、ブラウザに覚える)
  if (res.error && String(res.error?.message ?? '').includes('place')) {
    res = await supabase.from('note_folder_shows')
      .upsert({ folder_id: folderId, user_name: userName }, { onConflict: 'folder_id,user_name' });
  }
  if (res.error) throw new Error(`共有フォルダの表示設定を保存できませんでした: ${res.error?.message ?? res.error}`);
}

// ────────────────────────────────────────────────────────────
// コメントの数と、「どこまで見たか」(人ごと)
// ────────────────────────────────────────────────────────────

/** 一覧に件数や「まだ見ていない」の印を出すための、コメントの最小限の情報 */
export interface NoteCommentMeta {
  noteId: string;
  author: string;
  createdAt: string;
}

/** すべてのコメントの最小限の情報(新しいものから5000件まで)。テーブルが無いときは空 */
export async function fetchNoteCommentMeta(): Promise<NoteCommentMeta[]> {
  const { data, error } = await supabase
    .from('note_comments').select('note_id,author,created_at').order('created_at', { ascending: false }).limit(5000);
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(`コメントの件数の取得に失敗しました: ${error?.message ?? error}`);
  }
  return (data ?? []).map((r: any) => ({ noteId: r.note_id, author: r.author, createdAt: r.created_at }));
}

/**
 * 自分が各ノートのコメントを最後に見た日時(ノートID → 日時)。
 * テーブルがまだ無い(SQL 未実行)ときは null(このときは「まだ見ていない」の印を出さない)
 */
export async function fetchNoteCommentSeen(userName: string): Promise<Record<string, string> | null> {
  const { data, error } = await supabase.from('note_comment_seen').select('*').eq('user_name', userName);
  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(`コメントの確認状況の取得に失敗しました: ${error?.message ?? error}`);
  }
  const map: Record<string, string> = {};
  for (const row of data ?? []) if (row.note_id && row.seen_at) map[row.note_id] = row.seen_at;
  return map;
}

/** このノートのコメントを「ここまで見た」と記録する */
export async function markNoteCommentsSeen(noteId: string, userName: string, seenAt: string): Promise<void> {
  const { error } = await supabase
    .from('note_comment_seen')
    .upsert({ note_id: noteId, user_name: userName, seen_at: seenAt }, { onConflict: 'note_id,user_name' });
  if (error && !isMissingTableError(error)) throw new Error(`コメントの確認状況を保存できませんでした: ${error?.message ?? error}`);
}

/** 自分が編集したことのあるノート(編集履歴に自分の版が残っているもの)。取れないときは空 */
export async function fetchMyEditedNoteIds(userName: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('note_versions').select('note_id').eq('edited_by', userName).limit(5000);
  if (error) return new Set();
  return new Set((data ?? []).map((r: any) => r.note_id).filter(Boolean));
}
