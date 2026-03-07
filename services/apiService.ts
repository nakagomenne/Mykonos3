// services/apiService.ts
// ============================================================
// Mykonos3β バックエンドAPIサービス層
// Supabase を使ったすべての CRUD 操作をここで管理します
// ============================================================

import { supabase } from '../lib/supabaseClient';
import { CallRequest, User, AvailabilityStatus, EditHistory, CommentReply, FeedbackType, FeedbackReport } from '../types';

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
    completedAt:    row.completed_at ?? undefined,
    createdAt:      row.created_at,
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
  if (data.completedAt  !== undefined) row.completed_at  = data.completedAt;
  return row;
}

// DB行 → User
function rowToUser(row: any): User {
  return {
    name:               row.name,
    furigana:           row.furigana ?? undefined,
    isAdmin:            row.is_admin,
    isLinePrechecker:   row.is_line_prechecker,
    isSuperAdmin:       row.is_super_admin,
    password:           row.password,
    profilePicture:     row.profile_picture ?? null,
    availabilityStatus: row.availability_status as AvailabilityStatus,
    nonWorkingDays:     row.non_working_days ?? [],
    availableProducts:  row.available_products ?? [],
    comment:            row.comment ?? '',
    commentUpdatedAt:   row.comment_updated_at ?? undefined,
    statusRevertAt:     row.status_revert_at ?? null,
    createdAt:          row.created_at,
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
  if (data.comment            !== undefined) row.comment             = data.comment;
  if (data.commentUpdatedAt   !== undefined) row.comment_updated_at  = data.commentUpdatedAt;
  if (data.statusRevertAt     !== undefined) row.status_revert_at   = data.statusRevertAt;
  return row;
}

// ────────────────────────────────────────────────────────────
// CallRequest CRUD
// ────────────────────────────────────────────────────────────

// history を除いたカラム一覧（初期ロード高速化）
const CALL_REQUEST_COLUMNS_WITHOUT_HISTORY =
  'id,customer_id,requester,assignee,list_type,rank,date_time,notes,status,absence_count,prechecker,imported,is_strict,is_detailed_time,completed_at,created_at';

/** 全案件を取得する（history 除外で高速化） */
export async function fetchCallRequests(): Promise<CallRequest[]> {
  const { data, error } = await supabase
    .from('call_requests')
    .select(CALL_REQUEST_COLUMNS_WITHOUT_HISTORY)
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
    .select()
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
    .select()
    .single();

  if (error) throw new Error(`案件の更新に失敗しました: ${error.message}`);
  return rowToCallRequest(data);
}

/** 案件を削除する */
export async function deleteCallRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('call_requests')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`案件の削除に失敗しました: ${error.message}`);
}

/** 期限切れの完了済み案件を一括削除する（昨日以前に完了したもの） */
export async function deleteExpiredCompletedCalls(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { error } = await supabase
    .from('call_requests')
    .delete()
    .eq('status', '完了')
    .lt('completed_at', today.toISOString());

  if (error) throw new Error(`期限切れ案件の削除に失敗しました: ${error.message}`);
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
    .select();

  if (error) throw new Error(`一括案件の作成に失敗しました: ${error.message}`);
  return (data ?? []).map(rowToCallRequest);
}

// ────────────────────────────────────────────────────────────
// User CRUD
// ────────────────────────────────────────────────────────────

/** 全ユーザーを取得する */
// profile_picture を除いたカラム一覧（初期ロード高速化）
const USER_COLUMNS_WITHOUT_PICTURE =
  'name,furigana,is_admin,is_line_prechecker,is_super_admin,password,availability_status,non_working_days,available_products,comment,comment_updated_at,status_revert_at,created_at';

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
export async function updateUser(name: string, updatedData: Partial<User>): Promise<User> {
  const row = userToRow(updatedData);

  const { data, error } = await supabase
    .from('users')
    .update(row)
    .eq('name', name)
    .select()
    .single();

  if (error) throw new Error(`ユーザーの更新に失敗しました: ${error.message}`);
  return rowToUser(data);
}

/** 複数ユーザーを一括 upsert する（AdminMenu の保存用） */
export async function upsertUsers(users: User[]): Promise<User[]> {
  const rows = users.map(u => userToRow(u));

  const { data, error } = await supabase
    .from('users')
    .upsert(rows, { onConflict: 'name' })
    .select();

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
    .select()
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

/** 稼働ステータスを更新し、'一時受付不可'の場合は90分後の復帰時刻を保存する */
export async function updateUserAvailabilityStatusWithRevert(
  name: string,
  status: AvailabilityStatus
): Promise<void> {
  const revertAt = status === '一時受付不可'
    ? new Date(Date.now() + 90 * 60 * 1000).toISOString()
    : null;
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
// AppSettings CRUD
// ────────────────────────────────────────────────────────────

/** アプリ設定を取得する */
export async function fetchAppSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*');

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
// ────────────────────────────────────────────────────────────

/** call_requests テーブルの変更をリアルタイムで購読する（差分更新） */
export function subscribeToCallRequests(
  callback: (updater: (prev: CallRequest[]) => CallRequest[]) => void,
  onInsert?: (newCall: CallRequest) => void
) {
  const channel = supabase
    .channel('call_requests_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'call_requests' },
      async (payload: any) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        try {
          if (eventType === 'INSERT' && newRow) {
            const newCall = rowToCallRequest(newRow);
            if (onInsert) onInsert(newCall);
            // ローカルで即時追加済みの場合は重複しないようIDチェック
            callback(prev => prev.some(c => c.id === newCall.id) ? prev : [...prev, newCall]);
          } else if (eventType === 'UPDATE' && newRow) {
            const updatedCall = rowToCallRequest(newRow);
            callback(prev =>
              prev.map(c => {
                if (c.id !== updatedCall.id) return c;
                // payload.new が部分的な場合（REPLICA IDENTITY DEFAULT）も
                // 既存値を保持しつつ更新されたフィールドだけ上書き
                const merged: typeof c = {
                  id:             c.id,
                  customerId:     updatedCall.customerId     || c.customerId,
                  requester:      updatedCall.requester      || c.requester,
                  assignee:       updatedCall.assignee       || c.assignee,
                  listType:       updatedCall.listType       || c.listType,
                  rank:           updatedCall.rank           || c.rank,
                  dateTime:       updatedCall.dateTime       || c.dateTime,
                  notes:          updatedCall.notes          !== undefined ? updatedCall.notes : c.notes,
                  status:         updatedCall.status         || c.status,
                  absenceCount:   updatedCall.absenceCount   ?? c.absenceCount,
                  prechecker:     updatedCall.prechecker     !== undefined ? updatedCall.prechecker : c.prechecker,
                  imported:       updatedCall.imported       ?? c.imported,
                  isStrict:       updatedCall.isStrict       ?? c.isStrict,
                  isDetailedTime: updatedCall.isDetailedTime ?? c.isDetailedTime,
                  completedAt:    updatedCall.completedAt    !== undefined ? updatedCall.completedAt : c.completedAt,
                  createdAt:      updatedCall.createdAt      || c.createdAt,
                  // history は payload に含まれない場合もあるので既存値を優先
                  history:        updatedCall.history?.length ? updatedCall.history : c.history,
                };
                return merged;
              })
            );
          } else if (eventType === 'DELETE' && oldRow?.id) {
            callback(prev => prev.filter(c => c.id !== oldRow.id));
          }
        } catch (e) {
          console.error('Realtime コールバック中にエラー:', e);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** users テーブルの変更をリアルタイムで購読する（差分更新） */
export function subscribeToUsers(callback: (updater: (prev: User[]) => User[]) => void) {
  const channel = supabase
    .channel('users_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      async (payload: any) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        try {
          if (eventType === 'INSERT' && newRow) {
            const newUser = rowToUser(newRow);
            callback(prev => [...prev, newUser]);
          } else if (eventType === 'UPDATE' && newRow) {
            const updatedUser = rowToUser(newRow);
            callback(prev =>
              prev.map(u => {
                if (u.name !== updatedUser.name) return u;
                // null/undefined フィールドは既存値を保持（部分的 payload 対策）
                return {
                  name:               updatedUser.name,
                  furigana:           updatedUser.furigana           ?? u.furigana,
                  isAdmin:            updatedUser.isAdmin,
                  isLinePrechecker:   updatedUser.isLinePrechecker,
                  isSuperAdmin:       updatedUser.isSuperAdmin,
                  password:           updatedUser.password           || u.password,
                  profilePicture:     updatedUser.profilePicture     ?? u.profilePicture,
                  availabilityStatus: updatedUser.availabilityStatus || u.availabilityStatus,
                  nonWorkingDays:     updatedUser.nonWorkingDays     ?? u.nonWorkingDays,
                  availableProducts:  updatedUser.availableProducts  ?? u.availableProducts,
                  comment:            updatedUser.comment            ?? u.comment,
                  commentUpdatedAt:   updatedUser.commentUpdatedAt   ?? u.commentUpdatedAt,
                  statusRevertAt:     updatedUser.statusRevertAt     !== undefined ? updatedUser.statusRevertAt : u.statusRevertAt,
                  createdAt:          updatedUser.createdAt          || u.createdAt,
                };
              })
            );
          } else if (eventType === 'DELETE' && oldRow?.name) {
            callback(prev => prev.filter(u => u.name !== oldRow.name));
          }
        } catch (e) {
          console.error('Realtime コールバック中にエラー:', e);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

/** app_settings テーブルの変更をリアルタイムで購読する */
export function subscribeToAppSettings(callback: (settings: Record<string, string>) => void) {
  const channel = supabase
    .channel('app_settings_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'app_settings' },
      async () => {
        try {
          const settings = await fetchAppSettings();
          callback(settings);
        } catch (e) {
          console.error('Realtime コールバック中にエラー:', e);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
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

/** フィードバック一覧を取得（SA用） */
export async function fetchFeedbackReports(): Promise<FeedbackReport[]> {
  const { data, error } = await supabase
    .from('feedback_reports')
    .select('*')
    .order('created_at', { ascending: false });
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

/** フィードバックのリアルタイム購読 */
export function subscribeToFeedbackReports(callback: (reports: FeedbackReport[]) => void): () => void {
  const channel = supabase
    .channel('feedback_reports_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'feedback_reports' }, async () => {
      try {
        const reports = await fetchFeedbackReports();
        callback(reports);
      } catch (e) {
        console.error('Feedback realtime error:', e);
      }
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
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

/** 全リプライを取得 */
export async function fetchCommentReplies(): Promise<CommentReply[]> {
  const { data, error } = await supabase
    .from('comment_replies')
    .select('*')
    .order('created_at', { ascending: true });
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
    .select()
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

/** リプライのリアルタイム購読 */
export function subscribeToCommentReplies(callback: (replies: CommentReply[]) => void): () => void {
  const channel = supabase
    .channel('comment_replies_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comment_replies' }, async () => {
      try {
        const replies = await fetchCommentReplies();
        callback(replies);
      } catch (e) {
        console.error('CommentReply realtime error:', e);
      }
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
