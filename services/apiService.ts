// services/apiService.ts
// ============================================================
// Mykonos3β バックエンドAPIサービス層
// Supabase を使ったすべての CRUD 操作をここで管理します
// ============================================================

import { supabase } from '../lib/supabaseClient';
import { CallRequest, User, AvailabilityStatus, EditHistory } from '../types';

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
    absenceCount: row.absence_count ?? 0,
    prechecker:   row.prechecker ?? null,
    imported:     row.imported ?? false,
    history:      row.history ?? [],
    completedAt:  row.completed_at ?? undefined,
    createdAt:    row.created_at,
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
  if (data.imported     !== undefined) row.imported      = data.imported;
  if (data.history      !== undefined) row.history       = data.history;
  if (data.completedAt  !== undefined) row.completed_at  = data.completedAt;
  return row;
}

// DB行 → User
function rowToUser(row: any): User {
  return {
    name:               row.name,
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
    createdAt:          row.created_at,
  };
}

// User → DB行 (INSERT/UPDATE 用)
function userToRow(data: Partial<User>): Record<string, any> {
  const row: Record<string, any> = {};
  if (data.name               !== undefined) row.name                = data.name;
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
  return row;
}

// ────────────────────────────────────────────────────────────
// CallRequest CRUD
// ────────────────────────────────────────────────────────────

/** 全案件を取得する */
export async function fetchCallRequests(): Promise<CallRequest[]> {
  const { data, error } = await supabase
    .from('call_requests')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`案件の取得に失敗しました: ${error.message}`);
  return (data ?? []).map(rowToCallRequest);
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

/** 案件を更新する */
export async function updateCallRequest(
  id: string,
  updatedData: Partial<Omit<CallRequest, 'id'>>,
  editorName: string
): Promise<CallRequest> {
  // 現在の案件を取得して履歴を計算
  const { data: current, error: fetchError } = await supabase
    .from('call_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw new Error(`案件の取得に失敗しました: ${fetchError.message}`);

  const currentCall = rowToCallRequest(current);

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
export async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`ユーザーの取得に失敗しました: ${error.message}`);
  return (data ?? []).map(rowToUser);
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

/** call_requests テーブルの変更をリアルタイムで購読する */
export function subscribeToCallRequests(callback: (calls: CallRequest[]) => void) {
  const channel = supabase
    .channel('call_requests_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'call_requests' },
      async () => {
        // 変更があったら全件取り直し
        try {
          const calls = await fetchCallRequests();
          callback(calls);
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

/** users テーブルの変更をリアルタイムで購読する */
export function subscribeToUsers(callback: (users: User[]) => void) {
  const channel = supabase
    .channel('users_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      async () => {
        try {
          const users = await fetchUsers();
          callback(users);
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
