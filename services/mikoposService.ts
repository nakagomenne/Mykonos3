// ============================================================
// Mikopos のタイムライン(ポスト・リアクション・返信・投票)
// テーブルがまだ無い(SQL 未実行)ときは MikoposUnavailableError を投げ、
// 呼び出し側は今までの「1人1つのひとこと」の表示のままにする
// ============================================================
import { supabase } from '../lib/supabaseClient';
import { isMissingTableError, uploadNoteImage } from './notesService';

export interface MikoposPoll {
  options: string[];
}

export interface MikoposPost {
  id: string;
  author: string;
  body: string;
  imageUrl: string | null;
  poll: MikoposPoll | null;
  mentions: string[];
  createdAt: string;
}

export interface MikoposReaction {
  postId: string;
  userName: string;
  emoji: string;
  createdAt: string;
}

export interface MikoposReply {
  id: string;
  postId: string;
  author: string;
  body: string;
  /** 返信に付けた画像(なければ null) */
  imageUrl: string | null;
  createdAt: string;
}

export interface MikoposVote {
  postId: string;
  userName: string;
  optionIndex: number;
}

export interface MikoposData {
  posts: MikoposPost[];
  reactions: MikoposReaction[];
  replies: MikoposReply[];
  votes: MikoposVote[];
}

export class MikoposUnavailableError extends Error {
  constructor() {
    super('Mikopos のタイムライン用のテーブルがまだ作成されていません(supabase/migrations/20261125_add_mikopos_timeline.sql を実行してください)');
  }
}

export const MIKOPOS_BODY_MAX = 120;
export const MIKOPOS_REPLY_MAX = 100;
export const MIKOPOS_POLL_MIN = 2;
export const MIKOPOS_POLL_MAX = 4;
export const MIKOPOS_POLL_OPTION_MAX = 30;
/** リアクションは「いいね」の1種類だけ(今までの Mikopos と同じ)。保存するときの印 */
export const MIKOPOS_LIKE = '❤️';
/** 一度に読み込むポストの数(新しいものから) */
const POST_LIMIT = 100;

const fail = (what: string, error: any): never => {
  if (isMissingTableError(error)) throw new MikoposUnavailableError();
  throw new Error(`${what}: ${error?.message ?? error}`);
};

export function rowToPost(row: any): MikoposPost {
  const options = Array.isArray(row.poll?.options) ? row.poll.options.filter((o: any) => typeof o === 'string') : [];
  return {
    id: row.id,
    author: row.author,
    body: row.body ?? '',
    imageUrl: row.image_url ?? null,
    poll: options.length >= MIKOPOS_POLL_MIN ? { options } : null,
    mentions: Array.isArray(row.mentions) ? row.mentions : [],
    createdAt: row.created_at,
  };
}
export const rowToReaction = (row: any): MikoposReaction => ({ postId: row.post_id, userName: row.user_name, emoji: row.emoji, createdAt: row.created_at });
export const rowToReply = (row: any): MikoposReply => ({ id: row.id, postId: row.post_id, author: row.author, body: row.body ?? '', imageUrl: row.image_url ?? null, createdAt: row.created_at });
export const rowToVote = (row: any): MikoposVote => ({ postId: row.post_id, userName: row.user_name, optionIndex: row.option_index });

/** タイムラインをまとめて取得(新しいポストから100件と、それに付いたリアクション・返信・投票) */
export async function fetchMikopos(): Promise<MikoposData> {
  const { data: postRows, error } = await supabase
    .from('mikopos_posts').select('*').order('created_at', { ascending: false }).limit(POST_LIMIT);
  if (error) fail('ポストの取得に失敗しました', error);
  const posts = (postRows ?? []).map(rowToPost);
  if (posts.length === 0) return { posts, reactions: [], replies: [], votes: [] };
  const ids = posts.map(p => p.id);
  const [r1, r2, r3] = await Promise.all([
    supabase.from('mikopos_reactions').select('*').in('post_id', ids),
    supabase.from('mikopos_replies').select('*').in('post_id', ids).order('created_at', { ascending: true }),
    supabase.from('mikopos_poll_votes').select('*').in('post_id', ids),
  ]);
  if (r1.error) fail('リアクションの取得に失敗しました', r1.error);
  if (r2.error) fail('返信の取得に失敗しました', r2.error);
  if (r3.error) fail('投票の取得に失敗しました', r3.error);
  return {
    posts,
    reactions: (r1.data ?? []).map(rowToReaction),
    replies: (r2.data ?? []).map(rowToReply),
    votes: (r3.data ?? []).map(rowToVote),
  };
}

/** 本文から、メンションされた人(@名前)を取り出す。名前は長いものから先に当てる */
export function extractMentions(body: string, userNames: string[]): string[] {
  const found: string[] = [];
  let rest = body;
  for (const name of [...userNames].sort((a, b) => b.length - a.length)) {
    if (!name) continue;
    const token = `@${name}`;
    if (rest.includes(token)) {
      found.push(name);
      rest = rest.split(token).join(' ');
    }
  }
  return found;
}

export interface NewMikoposPost {
  author: string;
  body: string;
  imageUrl?: string | null;
  pollOptions?: string[];
  mentions?: string[];
}

export async function createMikoposPost(p: NewMikoposPost): Promise<MikoposPost> {
  const options = (p.pollOptions ?? []).map(o => o.trim()).filter(Boolean).slice(0, MIKOPOS_POLL_MAX);
  const { data, error } = await supabase
    .from('mikopos_posts')
    .insert({
      author: p.author,
      body: p.body,
      image_url: p.imageUrl ?? null,
      poll: options.length >= MIKOPOS_POLL_MIN ? { options } : null,
      mentions: p.mentions ?? [],
    })
    .select('*')
    .single();
  if (error) fail('ポストの投稿に失敗しました', error);
  return rowToPost(data);
}

export async function deleteMikoposPost(id: string): Promise<void> {
  const { error } = await supabase.from('mikopos_posts').delete().eq('id', id);
  if (error) fail('ポストの削除に失敗しました', error);
}

export async function addMikoposReaction(postId: string, userName: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('mikopos_reactions')
    .upsert({ post_id: postId, user_name: userName, emoji }, { onConflict: 'post_id,user_name,emoji' });
  if (error) fail('リアクションに失敗しました', error);
}

export async function removeMikoposReaction(postId: string, userName: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('mikopos_reactions').delete().eq('post_id', postId).eq('user_name', userName).eq('emoji', emoji);
  if (error) fail('リアクションの取り消しに失敗しました', error);
}

export async function addMikoposReply(postId: string, author: string, body: string, imageUrl: string | null = null): Promise<MikoposReply> {
  // 画像の欄は、付けたときだけ送る(追加の SQL を実行する前でも、文字だけの返信は送れるように)
  const row: Record<string, unknown> = { post_id: postId, author, body };
  if (imageUrl) row.image_url = imageUrl;
  const { data, error } = await supabase
    .from('mikopos_replies').insert(row).select('*').single();
  if (error && imageUrl && String(error?.message ?? '').includes('image_url')) {
    throw new Error('画像つきの返信を送れませんでした: データベースの更新が必要です(supabase/migrations/20261205_add_mikopos_reply_image.sql を実行してください)');
  }
  if (error) fail('返信に失敗しました', error);
  return rowToReply(data);
}

export async function deleteMikoposReply(id: string): Promise<void> {
  const { error } = await supabase.from('mikopos_replies').delete().eq('id', id);
  if (error) fail('返信の削除に失敗しました', error);
}

/** 投票する(1人1票。別の選択肢を選ぶと入れ替わる) */
export async function voteMikoposPoll(postId: string, userName: string, optionIndex: number): Promise<void> {
  const { error } = await supabase
    .from('mikopos_poll_votes')
    .upsert({ post_id: postId, user_name: userName, option_index: optionIndex, voted_at: new Date().toISOString() }, { onConflict: 'post_id,user_name' });
  if (error) fail('投票に失敗しました', error);
}

const MAX_GIF_BYTES = 5 * 1024 * 1024;

/** ポストに付ける画像を送信して URL を返す(GIF は動きを保ったまま。5MBまで) */
export async function uploadMikoposImage(file: File, owner: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('画像ファイル(GIF を含む)を選んでください');
  if (file.type === 'image/gif' && file.size > MAX_GIF_BYTES) throw new Error('GIF は5MB以下にしてください');
  return uploadNoteImage(file, owner);
}

export type MikoposChange =
  | { table: 'posts'; event: 'INSERT' | 'UPDATE' | 'DELETE'; row: any }
  | { table: 'reactions'; event: 'INSERT' | 'UPDATE' | 'DELETE'; row: any }
  | { table: 'replies'; event: 'INSERT' | 'UPDATE' | 'DELETE'; row: any }
  | { table: 'votes'; event: 'INSERT' | 'UPDATE' | 'DELETE'; row: any };

/** タイムラインの変更(ほかの人の投稿・リアクション・返信・投票)を受け取る */
export function subscribeToMikopos(onChange: (change: MikoposChange) => void): () => void {
  const handler = (table: MikoposChange['table']) => (payload: any) => {
    const event = payload?.eventType;
    if (event !== 'INSERT' && event !== 'UPDATE' && event !== 'DELETE') return;
    onChange({ table, event, row: event === 'DELETE' ? payload.old : payload.new } as MikoposChange);
  };
  const channel = supabase
    .channel(`mykonos_mikopos_${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mikopos_posts' }, handler('posts'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mikopos_reactions' }, handler('reactions'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mikopos_replies' }, handler('replies'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mikopos_poll_votes' }, handler('votes'))
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
