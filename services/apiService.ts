// services/apiService.ts
// ============================================================
// Mykonos3β バックエンドAPIサービス層
// Supabase を使ったすべての CRUD 操作をここで管理します
// ============================================================

import { supabase } from '../lib/supabaseClient';
import { CallRequest, User, AvailabilityStatus, EditHistory, CommentReply, CommentReaction, FeedbackType, FeedbackReport } from '../types';

// ────────────────────────────────────────────────────────────
// 型変換ヘルパー
//   Supabase の snake_case カラム名 ↔ フロントエンドの camelCase
// ────────────────────────────────────────────────────────────

// DB行 → CallRequest
function rowToCallRequest(row: any): CallRequest {
  return {
    id:           row.id,
    customerId:   row.customer_id,
    requester:    row.requester,
    assignee:     row.assignee,
    listType:     row.list_type,
    rank:         row.rank,
    dateTime:     row.date_time,
    notes:        row.notes,
    status:       row.status,
    absenceCount:   row.absence_count ?? 0,
    prechecker:     row.prechecker ?? null,
    imported:       row.imported ?? false,
    isStrict:       row.is_strict ?? false,
    isDetailedTime: row.is_detailed_time ?? false,
    history:        row.history ?? [],
    completedAt:      row.completed_at ?? undefined,
    applicationNumber: row.application_number ?? '',
    emoji:             row.emoji ?? '',
    createdAt:         row.created_at,
  };
}

// CallRequest → DB行 (INSERT/UPDATE 用)
function callRequestToRow(data: Partial<CallRequest>): Record<string, any> {
  const row: Record<string, any> = {};
  if (data.customerId   !== undefined) row.customer_id   = data.customerId;
  if (data.requester    !== undefined) row.requester     = data.requester;
  if (data.assignee     !== undefined) row.assignee      = data.assignee;
  if (data.listType     !== undefined) row.list_type     = data.listType;
  if (data.rank         !== undefined) row.rank          = data.rank;
  if (data.dateTime     !== undefined) row.date_time     = data.dateTime;
  if (data.notes        !== undefined) row.notes         = data.notes;
  if (data.status       !== undefined) row.status        = data.status;
  if (data.absenceCount !== undefined) row.absence_count = data.absenceCount;
  if (data.prechecker   !== undefined) row.prechecker    = data.prechecker;
  if (data.imported       !== undefined) row.imported         = data.imported;
  if (data.isStrict       !== undefined) row.is_strict        = data.isStrict;
  if (data.isDetailedTime !== undefined) row.is_detailed_time = data.isDetailedTime;
  if (data.history        !== undefined) row.history          = data.history;
  if (data.completedAt        !== undefined) row.completed_at       = data.completedAt;
  if (data.applicationNumber  !== undefined) row.application_number = data.applicationNumber;
  if (data.emoji              !== undefined) row.emoji               = data.emoji;
  if (data.createdAt          !== undefined) row.created_at          = data.createdAt;
  return row;
}

// DB行 → User
function rowToUser(row: any): User {
  return {
    name:                  row.name,
    furigana:              row.furigana ?? undefined,
    isAdmin:               row.is_admin,
    isLinePrechecker:      row.is_line_prechecker,
    isSuperAdmin:          row.is_super_admin,
    password:              row.password,
    profilePicture:        row.profile_picture ?? null,
    availabilityStatus:    row.availability_status as AvailabilityStatus,
    nonWorkingDays:        row.non_working_days ?? [],
    availableProducts:     row.available_products ?? [],
    comment:               row.comment ?? '',
    commentUpdatedAt:      row.comment_updated_at ?? undefined,
    statusRevertAt:        row.status_revert_at ?? null,
    workStart:             row.work_start ?? '11:00',
    workEnd:               row.work_end ?? '20:00',
    autoUnavailableOffset: row.auto_unavailable_offset ?? null,
    createdAt:             row.created_at,
  };
}

// User → DB行 (INSERT/UPDATE 用)
function userToRow(data: Partial<User>): Record<string, any> {
  const row: Record<string, any> = {};
  if (data.name               !== undefined) row.name                = data.name;
  if (data.furigana           !== undefined) row.furigana            = data.furigana || null;
  if (data.isAdmin            !== undefined) row.is_admin            = data.isAdmin;
  if (data.isLinePrechecker   !== undefined) row.is_line_prechecker  = data.isLinePrechecker;
  if (data.isSuperAdmin       !== undefined) row.is_super_admin      = data.isSuperAdmin;
  if (data.password           !== undefined) row.password            = data.password;
  if (data.profilePicture     !== undefined) row.profile_picture     = data.profilePicture;
  if (data.availabilityStatus !== undefined) row.availability_status = data.availabilityStatus;
  if (data.nonWorkingDays     !== undefined) row.non_working_days    = data.nonWorkingDays;
  if (data.availableProducts  !== undefined) row.available_products  = data.availableProducts;
  if (data.comment                !== undefined) row.comment                  = data.comment;
  if (data.commentUpdatedAt       !== undefined) row.comment_updated_at       = data.commentUpdatedAt;
  if (data.statusRevertAt         !== undefined) row.status_revert_at         = data.statusRevertAt;
  if (data.workStart              !== undefined) row.work_start               = data.workStart;
  if (data.workEnd                !== undefined) row.work_end                 = data.workEnd;
  if (data.autoUnavailableOffset  !== undefined) row.auto_unavailable_offset  = data.autoUnavailableOffset;
  return row;
}

// ────────────────────────────────────────────────────────────
// CallRequest CRUD
// ────────────────────────────────────────────────────────────

// history を除いたカラム一覧（初期ロード高速化・INSERT/UPDATE レスポンス用）
const CALL_REQUEST_COLUMNS_WITHOUT_HISTORY =
  'id,customer_id,requester,assignee,list_type,rank,date_time,notes,status,absence_count,prechecker,imported,is_strict,is_detailed_time,completed_at,application_number,emoji,created_at';

/** 全案件を取得する（history 除外で高速化・論理削除済みを除外） */
export async function fetchCallRequests(): Promise<CallRequest[]> {
  const { data, error } = await supabase
    .from('call_requests')
    .select(CALL_REQUEST_COLUMNS_WITHOUT_HISTORY)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`案件の取得に失敗しました: ${error.message}`);
  return (data ?? []).map(rowToCallRequest);
}

/** 特定案件の history のみを取得する（詳細モーダル用） */
export async function fetchCallHistory(id: string): Promise<CallRequest['history']> {
  const { data, error } = await supabase
    .from('call_requests')
    .select('history')
    .eq('id', id)
    .single();
  if (error) throw new Error(`履歴の取得に失敗しました: ${error.message}`);
  return data?.history ?? [];
}

/** 案件を新規作成する */
export async function createCallRequest(
  callData: Omit<CallRequest, 'id' | 'status' | 'createdAt'>
): Promise<CallRequest> {
  const row = callRequestToRow({
    ...callData,
    status: '追客中',
    prechecker: null,
    imported: false,
    history: [],
  });

  const { data, error } = await supabase
    .from('call_requests')
    .insert([row])
    .select(CALL_REQUEST_COLUMNS_WITHOUT_HISTORY)
    .single();

  if (error) throw new Error(`案件の作成に失敗しました: ${error.message}`);
  return rowToCallRequest(data);
}

/** 案件を更新する（currentCall をフロントから受け取り事前SELECTを廃止） */
export async function updateCallRequest(
  id: string,
  updatedData: Partial<Omit<CallRequest, 'id'>>,
  editorName: string,
  currentCall: CallRequest
): Promise<CallRequest> {

  // 変更差分を計算
  const changes: EditHistory['changes'] = [];
  (Object.keys(updatedData) as Array<keyof typeof updatedData>).forEach(key => {
    const oldVal = (currentCall as any)[key];
    const newVal = (updatedData as any)[key];
    if (oldVal !== newVal) {
      changes.push({ field: key as any, oldValue: oldVal, newValue: newVal });
    }
  });

  let newHistory = currentCall.history ?? [];
  if (changes.length > 0) {
    const entry: EditHistory = {
      editor: editorName,
      timestamp: new Date().toISOString(),
      changes,
    };
    newHistory = [entry, ...newHistory];
  }

  // completedAt の自動セット/クリア
  const patch: Partial<CallRequest> = { ...updatedData, history: newHistory };
  if (updatedData.status === '完了' && !currentCall.completedAt) {
    patch.completedAt = new Date().toISOString();
  } else if (updatedData.status === '追客中' && currentCall.completedAt) {
    patch.completedAt = undefined;
  }

  const row = callRequestToRow(patch);
  // completedAt を null にしたい場合の対応
  if (updatedData.status === '追客中' && currentCall.completedAt) {
    row.completed_at = null;
  }

  const { data, error } = await supabase
    .from('call_requests')
    .update(row)
    .eq('id', id)
    .select(CALL_REQUEST_COLUMNS_WITHOUT_HISTORY)
    .single();

  if (error) throw new Error(`案件の更新に失敗しました: ${error.message}`);
  // history は currentCall の newHistory を使って手動でマージ（SELECT * 廃止によるデータ節約）
  return { ...rowToCallRequest(data), history: newHistory };
}

/** 案件を論理削除する（deleted_at を現在時刻にセット） */
export async function deleteCallRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('call_requests')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`案件の削除に失敗しました: ${error.message}`);
}

/** 期限切れの完了済み案件を論理削除する（昨日以前に完了したもの） */
export async function deleteExpiredCompletedCalls(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { error } = await supabase
    .from('call_requests')
    .update({ deleted_at: new Date().toISOString() })
    .eq('status', '完了')
    .lt('completed_at', today.toISOString())
    .is('deleted_at', null);

  if (error) throw new Error(`期限切れ案件の削除に失敗しました: ${error.message}`);
}

/**
 * 古い論理削除済みレコードを物理削除してDBサイズを削減する。
 * - deleted_at が 90日以上前のレコードを対象とする（検索履歴として90日は十分）
 * - 起動時にバックグラウンドで実行（ローディングをブロックしない）
 */
export async function purgeOldDeletedRecords(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { error } = await supabase
    .from('call_requests')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff.toISOString());

  if (error) throw new Error(`古いレコードの物理削除に失敗しました: ${error.message}`);
}

/**
 * 古い feedback_reports を物理削除してDBサイズを削減する。
 * - 既読（is_read=true）かつ 90日以上前のものを対象とする
 */
export async function purgeOldFeedbackReports(): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { error } = await supabase
    .from('feedback_reports')
    .delete()
    .eq('is_read', true)
    .lt('created_at', cutoff.toISOString());

  if (error) throw new Error(`古いフィードバックの削除に失敗しました: ${error.message}`);
}

/**
 * 古い comment_replies を物理削除してDBサイズを削減する。
 * - 30日以上前のリプライを対象とする
 * - 1日1回だけ実行（localStorage で管理）
 */
const REPLIES_PURGE_KEY = 'mykonosPurgeRepliesLastRun';
function shouldRunRepliesToday(): boolean {
  const last = localStorage.getItem(REPLIES_PURGE_KEY);
  if (!last) return true;
  const lastDate = new Date(last).toLocaleDateString('ja-JP');
  const today = new Date().toLocaleDateString('ja-JP');
  return lastDate !== today;
}

export async function purgeOldCommentReplies(): Promise<void> {
  if (!shouldRunRepliesToday()) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const { error } = await supabase
    .from('comment_replies')
    .delete()
    .lt('created_at', cutoff.toISOString());
  if (error) throw new Error(`古いリプライの削除に失敗しました: ${error.message}`);
  localStorage.setItem(REPLIES_PURGE_KEY, new Date().toISOString());
}

/** 削除済み案件を顧客IDで検索する（論理削除レコードのみ） */
export async function searchDeletedCallRequests(customerId: string): Promise<CallRequest[]> {
  const { data, error } = await supabase
    .from('call_requests')
    .select(CALL_REQUEST_COLUMNS_WITHOUT_HISTORY)
    .not('deleted_at', 'is', null)
    .ilike('customer_id', `%${customerId}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(`削除済み案件の検索に失敗しました: ${error.message}`);
  return (data ?? []).map(rowToCallRequest);
}

/** 複数の案件を一括作成する（全体タスク用） */
export async function createBulkCallRequests(
  calls: Omit<CallRequest, 'id' | 'status' | 'createdAt'>[]
): Promise<CallRequest[]> {
  const rows = calls.map(c =>
    callRequestToRow({
      ...c,
      status: '追客中',
      prechecker: null,
      imported: false,
      history: [],
    })
  );

  const { data, error } = await supabase
    .from('call_requests')
    .insert(rows)
    .select(CALL_REQUEST_COLUMNS_WITHOUT_HISTORY);

  if (error) throw new Error(`一括案件の作成に失敗しました: ${error.message}`);
  return (data ?? []).map(rowToCallRequest);
}

// ────────────────────────────────────────────────────────────
// User CRUD
// ────────────────────────────────────────────────────────────

/** 全ユーザーを取得する */
// profile_picture を除いたカラム一覧（初期ロード高速化）
const USER_COLUMNS_WITHOUT_PICTURE =
  'name,furigana,is_admin,is_line_prechecker,is_super_admin,password,availability_status,non_working_days,available_products,comment,comment_updated_at,status_revert_at,work_start,work_end,auto_unavailable_offset,created_at';

/** ユーザー一覧を取得する（profile_picture 除外で高速化） */
export async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select(USER_COLUMNS_WITHOUT_PICTURE)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`ユーザーの取得に失敗しました: ${error.message}`);
  return (data ?? []).map(rowToUser);
}

/** profile_picture のみを取得して既存のユーザーリストにマージする（遅延ロード用） */
export async function fetchUserProfilePictures(): Promise<Record<string, string | null>> {
  const { data, error } = await supabase
    .from('users')
    .select('name,profile_picture');
  if (error) throw new Error(`プロフィール画像の取得に失敗しました: ${error.message}`);
  const map: Record<string, string | null> = {};
  (data ?? []).forEach((row: any) => { map[row.name] = row.profile_picture ?? null; });
  return map;
}

/** ユーザーを更新する（name をキーとして使用） */
export async function updateUser(name: string, updatedData: Partial<User>): Promise<void> {
  const row = userToRow(updatedData);

  // .select() を付けないことで profile_picture を含む大きなペイロードを
  // Realtimeに乗せず、ペイロードサイズ超過によるアイコン消失を防ぐ
  const { error } = await supabase
    .from('users')
    .update(row)
    .eq('name', name);

  if (error) throw new Error(`ユーザーの更新に失敗しました: ${error.message}`);
}

/** 複数ユーザーを一括 upsert する（AdminMenu の保存用） */
export async function upsertUsers(users: User[]): Promise<User[]> {
  const rows = users.map(u => userToRow(u));

  const { data, error } = await supabase
    .from('users')
    .upsert(rows, { onConflict: 'name' })
    .select(USER_COLUMNS_WITHOUT_PICTURE);

  if (error) throw new Error(`ユーザーの一括更新に失敗しました: ${error.message}`);
  return (data ?? []).map(rowToUser);
}

/** ユーザーを削除する */
export async function deleteUser(name: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('name', name);

  if (error) throw new Error(`ユーザーの削除に失敗しました: ${error.message}`);
}

/** ユーザーを新規作成する（INSERT） */
export async function insertUser(user: User): Promise<User> {
  const row = userToRow(user);
  const { data, error } = await supabase
    .from('users')
    .insert([row])
    .select(USER_COLUMNS_WITHOUT_PICTURE)
    .single();
  if (error) throw new Error(`ユーザーの作成に失敗しました: ${error.message}`);
  return rowToUser(data);
}

/** ユーザーの稼働ステータスを更新する */
export async function updateUserAvailabilityStatus(
  name: string,
  status: AvailabilityStatus
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ availability_status: status })
    .eq('name', name);

  if (error) throw new Error(`ステータスの更新に失敗しました: ${error.message}`);
}

/** 稼働ステータスを更新し、'一時受付不可'の場合は90分後・'当日受付不可'の場合は翌日JST0:00を復帰時刻として保存する */
export async function updateUserAvailabilityStatusWithRevert(
  name: string,
  status: AvailabilityStatus
): Promise<void> {
  let revertAt: string | null = null;
  if (status === '一時受付不可') {
    revertAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();
  } else if (status === '当日受付不可') {
    // 翌日のJST 0:00（= UTC 15:00）を復帰時刻として設定
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const jstMidnight = new Date(
      Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() + 1, 0, 0, 0, 0)
      - 9 * 60 * 60 * 1000
    );
    revertAt = jstMidnight.toISOString();
  }
  const { error } = await supabase
    .from('users')
    .update({ availability_status: status, status_revert_at: revertAt })
    .eq('name', name);

  if (error) throw new Error(`ステータスの更新に失敗しました: ${error.message}`);
}

/** ユーザーのパスワードを更新する */
export async function updateUserPassword(name: string, newPassword: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ password: newPassword })
    .eq('name', name);

  if (error) throw new Error(`パスワードの更新に失敗しました: ${error.message}`);
}

/** ユーザーの非稼働日を更新する */
export async function updateUserNonWorkingDays(name: string, dates: string[]): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ non_working_days: dates })
    .eq('name', name);

  if (error) throw new Error(`非稼働日の更新に失敗しました: ${error.message}`);
}

/** ユーザーのコメントを更新する */
export async function updateUserComment(name: string, comment: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      comment,
      comment_updated_at: new Date().toISOString(),
    })
    .eq('name', name);

  if (error) throw new Error(`コメントの更新に失敗しました: ${error.message}`);
}

/** プロフィール画像のみを更新する（base64を単独で送信してタイムアウトを避ける） */
export async function updateUserProfilePicture(name: string, profilePicture: string | null): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ profile_picture: profilePicture })
    .eq('name', name);

  if (error) throw new Error(`プロフィール画像の更新に失敗しました: ${error.message}`);
}

// ────────────────────────────────────────────────────────────
// Storage: プロフィール画像アップロード（Base64 → Storage URL）
// ────────────────────────────────────────────────────────────

const STORAGE_BUCKET = 'profile-pictures';

/**
 * Base64データURLをStorageにアップロードしてpublic URLを返す。
 * GIFはアニメーションを維持するためそのまま保存する。
 */
export async function uploadProfilePictureToStorage(
  userName: string,
  base64DataUrl: string
): Promise<string> {
  // "data:image/gif;base64,XXXX" → MIMEタイプとバイナリに分解
  const match = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('不正な画像データです');
  const mimeType = match[1];
  const base64Data = match[2];

  // base64 → Uint8Array
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  // 拡張子を決定
  const ext = mimeType === 'image/gif' ? 'gif'
    : mimeType === 'image/png' ? 'png'
    : mimeType === 'image/webp' ? 'webp'
    : 'jpg';

  const filePath = `${userName}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, bytes, {
      contentType: mimeType,
      upsert: true, // 同名ファイルを上書き
    });

  if (error) throw new Error(`画像のアップロードに失敗しました: ${error.message}`);

  // public URL を取得（キャッシュバスターを付与して即時反映）
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(filePath);

  return `${data.publicUrl}?t=${Date.now()}`;
}

/**
 * プロフィール画像を保存する。
 * Storage が使えれば Storage → DB に URL を保存。
 * フォールバックとして Base64 直接保存も残す。
 */
export async function saveProfilePicture(
  userName: string,
  base64DataUrl: string | null
): Promise<void> {
  if (base64DataUrl === null) {
    // 削除：DBをnullに
    await updateUserProfilePicture(userName, null);
    return;
  }
  try {
    const publicUrl = await uploadProfilePictureToStorage(userName, base64DataUrl);
    // DBにはStorage URLを保存（Base64ではなくURL文字列）
    await updateUserProfilePicture(userName, publicUrl);
  } catch (storageErr) {
    console.warn('Storage アップロード失敗、Base64フォールバック:', storageErr);
    // Storage が使えない場合（バケット未作成など）はBase64で保存
    await updateUserProfilePicture(userName, base64DataUrl);
  }
}

// ────────────────────────────────────────────────────────────
// AppSettings CRUD
// ────────────────────────────────────────────────────────────

/** アプリ設定を取得する */
export async function fetchAppSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key,value');

  if (error) throw new Error(`アプリ設定の取得に失敗しました: ${error.message}`);

  const settings: Record<string, string> = {};
  (data ?? []).forEach((row: any) => {
    settings[row.key] = row.value;
  });
  return settings;
}

/** アプリ設定を更新する */
export async function updateAppSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value }, { onConflict: 'key' });

  if (error) throw new Error(`アプリ設定の更新に失敗しました: ${error.message}`);
}

// ────────────────────────────────────────────────────────────
// Realtime Subscriptions
// すべてのテーブル変更を1本のチャンネルで購読（接続数削減）
// ────────────────────────────────────────────────────────────

export interface RealtimeCallbacks {
  onCallsChange: (updater: (prev: CallRequest[]) => CallRequest[]) => void;
  onCallInsert?: (newCall: CallRequest) => void;
  onUsersChange: (updater: (prev: User[]) => User[]) => void;
  onSettingsChange: (settings: Record<string, string>) => void;
  onFeedbackChange: (reports: FeedbackReport[]) => void;
  onRepliesChange: (replies: CommentReply[]) => void;
  onReactionsChange?: (reactions: CommentReaction[]) => void;
}

/** 全テーブルの変更を1本のチャンネルで購読する */
export function subscribeToAll(callbacks: RealtimeCallbacks): () => void {
  // チャンネル名にタイムスタンプを付与して複数インスタンスの競合を防止
  const channelName = `mykonos_all_changes_${Date.now()}`;
  const channel = supabase
    .channel(channelName)

    // ── call_requests ──────────────────────────────────────
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'call_requests' },
      async (payload: any) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        try {
          if (eventType === 'INSERT' && newRow) {
            const newCall = rowToCallRequest(newRow);
            if (callbacks.onCallInsert) callbacks.onCallInsert(newCall);
            callbacks.onCallsChange(prev =>
              prev.some(c => c.id === newCall.id) ? prev : [...prev, newCall]
            );
          } else if (eventType === 'UPDATE' && newRow) {
            const updatedCall = rowToCallRequest(newRow);
            callbacks.onCallsChange(prev =>
              prev.map(c => {
                if (c.id !== updatedCall.id) return c;
                return {
                  id:                c.id,
                  customerId:        updatedCall.customerId        || c.customerId,
                  requester:         updatedCall.requester         || c.requester,
                  assignee:          updatedCall.assignee          || c.assignee,
                  listType:          updatedCall.listType          || c.listType,
                  rank:              updatedCall.rank              || c.rank,
                  dateTime:          updatedCall.dateTime          || c.dateTime,
                  notes:             updatedCall.notes             !== undefined ? updatedCall.notes : c.notes,
                  status:            updatedCall.status            || c.status,
                  absenceCount:      updatedCall.absenceCount      ?? c.absenceCount,
                  prechecker:        updatedCall.prechecker        !== undefined ? updatedCall.prechecker : c.prechecker,
                  imported:          updatedCall.imported          ?? c.imported,
                  isStrict:          updatedCall.isStrict          ?? c.isStrict,
                  isDetailedTime:    updatedCall.isDetailedTime    ?? c.isDetailedTime,
                  completedAt:       updatedCall.completedAt       !== undefined ? updatedCall.completedAt : c.completedAt,
                  applicationNumber: updatedCall.applicationNumber !== undefined ? updatedCall.applicationNumber : c.applicationNumber,
                  emoji:             updatedCall.emoji             !== undefined ? updatedCall.emoji : c.emoji,
                  createdAt:         updatedCall.createdAt         || c.createdAt,
                  history:           updatedCall.history?.length   ? updatedCall.history : c.history,
                };
              })
            );
          } else if (eventType === 'DELETE' && oldRow?.id) {
            callbacks.onCallsChange(prev => prev.filter(c => c.id !== oldRow.id));
          }
        } catch (e) {
          console.error('[Realtime] call_requests エラー:', e);
        }
      }
    )

    // ── users ───────────────────────────────────────────────
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      async (payload: any) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        try {
          if (eventType === 'INSERT' && newRow) {
            callbacks.onUsersChange(prev => [...prev, rowToUser(newRow)]);
          } else if (eventType === 'UPDATE' && newRow) {
            const name = newRow.name;
            if (!name) return;
            callbacks.onUsersChange(prev =>
              prev.map(u => {
                if (u.name !== name) return u;
                const pick = <T>(newVal: T | undefined, oldVal: T): T =>
                  newVal !== undefined ? newVal : oldVal;
                return {
                  name:                 u.name,
                  furigana:             pick(newRow.furigana,                u.furigana),
                  isAdmin:              pick(newRow.is_admin,                u.isAdmin),
                  isLinePrechecker:     pick(newRow.is_line_prechecker,      u.isLinePrechecker),
                  isSuperAdmin:         pick(newRow.is_super_admin,          u.isSuperAdmin),
                  password:             pick(newRow.password,                u.password),
                  // profile_picture はペイロードサイズ超過で欠落しやすいため既存値を優先
                  profilePicture:       newRow.profile_picture !== undefined && newRow.profile_picture !== null
                                          ? newRow.profile_picture
                                          : (newRow.profile_picture === null && u.profilePicture === null)
                                            ? null
                                            : u.profilePicture,
                  availabilityStatus:   pick(newRow.availability_status,    u.availabilityStatus) || u.availabilityStatus,
                  nonWorkingDays:       pick(newRow.non_working_days,        u.nonWorkingDays),
                  availableProducts:    pick(newRow.available_products,      u.availableProducts),
                  comment:              pick(newRow.comment,                 u.comment),
                  commentUpdatedAt:     pick(newRow.comment_updated_at,      u.commentUpdatedAt),
                  statusRevertAt:       pick(newRow.status_revert_at,        u.statusRevertAt),
                  workStart:            pick(newRow.work_start,              u.workStart),
                  workEnd:              pick(newRow.work_end,                u.workEnd),
                  autoUnavailableOffset: pick(newRow.auto_unavailable_offset, u.autoUnavailableOffset),
                  createdAt:            u.createdAt,
                };
              })
            );
          } else if (eventType === 'DELETE' && oldRow?.name) {
            callbacks.onUsersChange(prev => prev.filter(u => u.name !== oldRow.name));
          }
        } catch (e) {
          console.error('[Realtime] users エラー:', e);
        }
      }
    )

    // ── app_settings ────────────────────────────────────────
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_settings' },
      async () => {
        try {
          const settings = await fetchAppSettings();
          callbacks.onSettingsChange(settings);
        } catch (e) {
          console.error('[Realtime] app_settings エラー:', e);
        }
      }
    )

    // ── feedback_reports ────────────────────────────────────
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'feedback_reports' },
      async () => {
        try {
          const reports = await fetchFeedbackReports();
          callbacks.onFeedbackChange(reports);
        } catch (e) {
          console.error('[Realtime] feedback_reports エラー:', e);
        }
      }
    )

    // ── comment_replies ─────────────────────────────────────
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comment_replies' },
      async () => {
        try {
          const replies = await fetchCommentReplies();
          callbacks.onRepliesChange(replies);
        } catch (e) {
          console.error('[Realtime] comment_replies エラー:', e);
        }
      }
    )

    // ── comment_reactions ───────────────────────────────────
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'comment_reactions' },
      async () => {
        try {
          const reactions = await fetchCommentReactions();
          callbacks.onReactionsChange?.(reactions);
        } catch (e) {
          console.error('[Realtime] comment_reactions エラー:', e);
        }
      }
    )

    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.info('[Realtime] チャンネル接続成功 ✅');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[Realtime] チャンネルエラー ❌', err);
      } else if (status === 'TIMED_OUT') {
        console.warn('[Realtime] 接続タイムアウト ⚠️');
      } else if (status === 'CLOSED') {
        console.warn('[Realtime] チャンネルクローズ 🔒');
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

// 後方互換ラッパー（既存の個別購読関数を呼んでいる箇所がある場合のフォールバック）
export function subscribeToCallRequests(
  callback: (updater: (prev: CallRequest[]) => CallRequest[]) => void,
  onInsert?: (newCall: CallRequest) => void
) {
  return subscribeToAll({
    onCallsChange:    callback,
    onCallInsert:     onInsert,
    onUsersChange:    () => {},
    onSettingsChange: () => {},
    onFeedbackChange: () => {},
    onRepliesChange:  () => {},
  });
}
export function subscribeToUsers(callback: (updater: (prev: User[]) => User[]) => void) {
  return subscribeToAll({
    onCallsChange:    () => {},
    onUsersChange:    callback,
    onSettingsChange: () => {},
    onFeedbackChange: () => {},
    onRepliesChange:  () => {},
  });
}
export function subscribeToAppSettings(callback: (settings: Record<string, string>) => void) {
  return subscribeToAll({
    onCallsChange:    () => {},
    onUsersChange:    () => {},
    onSettingsChange: callback,
    onFeedbackChange: () => {},
    onRepliesChange:  () => {},
  });
}

// ────────────────────────────────────────────────────────────
// Feedback Reports CRUD
// ────────────────────────────────────────────────────────────

function rowToFeedback(row: any): FeedbackReport {
  return {
    id:        row.id,
    type:      row.type as FeedbackType,
    title:     row.title,
    body:      row.body ?? '',
    reporter:  row.reporter,
    createdAt: row.created_at,
    isRead:    row.is_read ?? false,
  };
}

// feedback_reports の必要カラム（id,type,title,body,reporter,created_at,is_read）
const FEEDBACK_COLUMNS = 'id,type,title,body,reporter,created_at,is_read';

/** フィードバック一覧を取得（SA用・最新200件） */
export async function fetchFeedbackReports(): Promise<FeedbackReport[]> {
  const { data, error } = await supabase
    .from('feedback_reports')
    .select(FEEDBACK_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(`フィードバックの取得に失敗しました: ${error.message}`);
  return (data ?? []).map(rowToFeedback);
}

/** フィードバックを送信 */
export async function submitFeedbackReport(
  params: { type: FeedbackType; title: string; body: string; reporter: string }
): Promise<void> {
  const { type, title, body, reporter } = params;
  const { error } = await supabase
    .from('feedback_reports')
    .insert({ type, title, body, reporter });
  if (error) throw new Error(`フィードバックの送信に失敗しました: ${error.message}`);
}

/** フィードバックを既読にする */
export async function markFeedbackRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('feedback_reports')
    .update({ is_read: true })
    .eq('id', id);
  if (error) throw new Error(`既読更新に失敗しました: ${error.message}`);
}

/** フィードバックを削除 */
export async function deleteFeedbackReport(id: string): Promise<void> {
  const { error } = await supabase
    .from('feedback_reports')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`フィードバックの削除に失敗しました: ${error.message}`);
}

/** フィードバックのリアルタイム購読（subscribeToAll に統合済み・後方互換ラッパー） */
export function subscribeToFeedbackReports(callback: (reports: FeedbackReport[]) => void): () => void {
  return subscribeToAll({
    onCallsChange:    () => {},
    onUsersChange:    () => {},
    onSettingsChange: () => {},
    onFeedbackChange: callback,
    onRepliesChange:  () => {},
  });
}

// ============================================================
// コメントリプライ (comment_replies)
// ============================================================

function rowToReply(row: any): CommentReply {
  return {
    id:        row.id,
    userName:  row.user_name,
    author:    row.author,
    body:      row.body,
    createdAt: row.created_at,
  };
}

// comment_replies の必要カラム（id,user_name,author,body,created_at）
const REPLY_COLUMNS = 'id,user_name,author,body,created_at';

/** 全リプライを取得（最新500件・古いものは自動クリーンアップ対象） */
export async function fetchCommentReplies(): Promise<CommentReply[]> {
  const { data, error } = await supabase
    .from('comment_replies')
    .select(REPLY_COLUMNS)
    .order('created_at', { ascending: true })
    .limit(500);
  // テーブルが未作成の場合は空配列を返す（graceful fallback）
  if (error) {
    if (error.message?.includes('schema cache') || error.code === 'PGRST205') return [];
    throw new Error(`リプライの取得に失敗しました: ${error.message}`);
  }
  return (data ?? []).map(rowToReply);
}

/** リプライを投稿 */
export async function addCommentReply(
  params: { userName: string; author: string; body: string }
): Promise<CommentReply> {
  const { data, error } = await supabase
    .from('comment_replies')
    .insert({ user_name: params.userName, author: params.author, body: params.body })
    .select(REPLY_COLUMNS)
    .single();
  if (error) throw new Error(`リプライの投稿に失敗しました: ${error.message}`);
  return rowToReply(data);
}

/** 特定ユーザーへのリプライをすべて削除（コメント削除時に呼ぶ） */
export async function deleteRepliesByUserName(userName: string): Promise<void> {
  const { error } = await supabase
    .from('comment_replies')
    .delete()
    .eq('user_name', userName);
  if (error) throw new Error(`リプライの削除に失敗しました: ${error.message}`);
}

/** リプライのリアルタイム購読（subscribeToAll に統合済み・後方互換ラッパー） */
export function subscribeToCommentReplies(callback: (replies: CommentReply[]) => void): () => void {
  return subscribeToAll({
    onCallsChange:    () => {},
    onUsersChange:    () => {},
    onSettingsChange: () => {},
    onFeedbackChange: () => {},
    onRepliesChange:  callback,
  });
}

// ============================================================
// コメントリアクション (comment_reactions)
// ============================================================

function rowToReaction(row: any): CommentReaction {
  return {
    id:        row.id,
    userName:  row.user_name,
    reactor:   row.reactor,
    emoji:     row.emoji,
    createdAt: row.created_at,
  };
}

const REACTION_COLUMNS = 'id,user_name,reactor,emoji,created_at';

/** 全リアクションを取得 */
export async function fetchCommentReactions(): Promise<CommentReaction[]> {
  const { data, error } = await supabase
    .from('comment_reactions')
    .select(REACTION_COLUMNS)
    .order('created_at', { ascending: true });
  // テーブルが未作成の場合は空配列を返す（graceful fallback）
  if (error) {
    if (error.message?.includes('schema cache') || error.code === 'PGRST205' || error.message?.includes('does not exist')) return [];
    throw new Error(`リアクションの取得に失敗しました: ${error.message}`);
  }
  return (data ?? []).map(rowToReaction);
}

/** リアクションをトグル（同じ絵文字が既存なら削除、なければ追加） */
export async function toggleCommentReaction(
  params: { userName: string; reactor: string; emoji: string }
): Promise<{ action: 'added' | 'removed'; reaction?: CommentReaction }> {
  // 既存を検索
  const { data: existing, error: fetchErr } = await supabase
    .from('comment_reactions')
    .select(REACTION_COLUMNS)
    .eq('user_name', params.userName)
    .eq('reactor', params.reactor)
    .eq('emoji', params.emoji)
    .maybeSingle();

  if (fetchErr && !fetchErr.message?.includes('does not exist')) {
    throw new Error(`リアクション確認に失敗しました: ${fetchErr.message}`);
  }

  if (existing) {
    // 既存 → 削除
    const { error: delErr } = await supabase
      .from('comment_reactions')
      .delete()
      .eq('id', existing.id);
    if (delErr) throw new Error(`リアクションの削除に失敗しました: ${delErr.message}`);
    return { action: 'removed' };
  } else {
    // 未存在 → 追加
    const { data, error: insErr } = await supabase
      .from('comment_reactions')
      .insert({ user_name: params.userName, reactor: params.reactor, emoji: params.emoji })
      .select(REACTION_COLUMNS)
      .single();
    if (insErr) throw new Error(`リアクションの追加に失敗しました: ${insErr.message}`);
    return { action: 'added', reaction: rowToReaction(data) };
  }
}

/** 特定ユーザーへのリアクションをすべて削除（コメント削除時に呼ぶ） */
export async function deleteReactionsByUserName(userName: string): Promise<void> {
  const { error } = await supabase
    .from('comment_reactions')
    .delete()
    .eq('user_name', userName);
  if (error && !error.message?.includes('does not exist')) {
    throw new Error(`リアクションの削除に失敗しました: ${error.message}`);
  }
}
