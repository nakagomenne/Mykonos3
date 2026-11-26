import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '../types';
import * as svc from '../services/mikoposService';
import type { MikoposData, MikoposPost } from '../services/mikoposService';

/** 通知する出来事 */
export type MikoposNotice =
  | { kind: 'mention'; post: MikoposPost }
  | { kind: 'reply'; post: MikoposPost; from: string; body: string }
  | { kind: 'reaction'; post: MikoposPost; from: string; emoji: string };

interface UseMikoposOptions {
  me: User | null;
  /** 自分がメンションされた / 自分のポストに返信・リアクションが付いたときに呼ばれる(プッシュ通知用) */
  onNotice?: (notice: MikoposNotice) => void;
}

const EMPTY: MikoposData = { posts: [], reactions: [], replies: [], votes: [] };

/**
 * Mikopos のタイムライン。
 * available が false の間(SQL 未実行)は、呼び出し側は今までの「1人1つのひとこと」を表示する
 */
export function useMikopos({ me, onNotice }: UseMikoposOptions) {
  const [data, setData] = useState<MikoposData>(EMPTY);
  const [available, setAvailable] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const meName = me?.name ?? '';
  const meRef = useRef(meName);
  useEffect(() => { meRef.current = meName; }, [meName]);
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const onNoticeRef = useRef(onNotice);
  useEffect(() => { onNoticeRef.current = onNotice; }, [onNotice]);

  const load = useCallback(async () => {
    try {
      const next = await svc.fetchMikopos();
      setData(next);
      setAvailable(true);
    } catch (e) {
      // テーブルが無いときは「使えない」とするだけ。通信の失敗などは、前の内容を残して次の機会に取り直す
      if (e instanceof svc.MikoposUnavailableError) setAvailable(false);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!meName) { setData(EMPTY); setAvailable(false); setLoaded(false); return; }
    void load();
  }, [meName, load]);

  // ── Realtime: 通知を出してから、少し待ってまとめて取り直す ──
  useEffect(() => {
    if (!meName || !available) return;
    let timer: number | undefined;
    const reloadSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void load(); }, 300);
    };
    const unsubscribe = svc.subscribeToMikopos(change => {
      const my = meRef.current;
      try {
        if (change.event === 'INSERT' && change.row) {
          if (change.table === 'posts') {
            const post = svc.rowToPost(change.row);
            if (post.author !== my && post.mentions.includes(my)) onNoticeRef.current?.({ kind: 'mention', post });
          } else if (change.table === 'replies') {
            const reply = svc.rowToReply(change.row);
            const post = dataRef.current.posts.find(p => p.id === reply.postId);
            if (post && post.author === my && reply.author !== my) {
              onNoticeRef.current?.({ kind: 'reply', post, from: reply.author, body: reply.body || (reply.imageUrl ? '(画像)' : '') });
            }
          } else if (change.table === 'reactions') {
            const reaction = svc.rowToReaction(change.row);
            const post = dataRef.current.posts.find(p => p.id === reaction.postId);
            if (post && post.author === my && reaction.userName !== my) {
              onNoticeRef.current?.({ kind: 'reaction', post, from: reaction.userName, emoji: reaction.emoji });
            }
          }
        }
      } catch { /* 通知に失敗しても、一覧の更新は続ける */ }
      reloadSoon();
    });
    return () => { window.clearTimeout(timer); unsubscribe(); };
  }, [meName, available, load]);

  // ── 操作(先に手元の表示を変えて、あとで取り直す) ──
  const post = useCallback(async (p: Omit<svc.NewMikoposPost, 'author'>): Promise<MikoposPost> => {
    const created = await svc.createMikoposPost({ ...p, author: meRef.current });
    setData(prev => (prev.posts.some(x => x.id === created.id) ? prev : { ...prev, posts: [created, ...prev.posts] }));
    return created;
  }, []);

  const removePost = useCallback(async (id: string) => {
    await svc.deleteMikoposPost(id);
    setData(prev => ({
      posts: prev.posts.filter(p => p.id !== id),
      reactions: prev.reactions.filter(r => r.postId !== id),
      replies: prev.replies.filter(r => r.postId !== id),
      votes: prev.votes.filter(v => v.postId !== id),
    }));
  }, []);

  const toggleReaction = useCallback(async (postId: string, emoji: string) => {
    const my = meRef.current;
    const has = dataRef.current.reactions.some(r => r.postId === postId && r.userName === my && r.emoji === emoji);
    if (has) {
      setData(prev => ({ ...prev, reactions: prev.reactions.filter(r => !(r.postId === postId && r.userName === my && r.emoji === emoji)) }));
      await svc.removeMikoposReaction(postId, my, emoji);
    } else {
      setData(prev => ({ ...prev, reactions: [...prev.reactions, { postId, userName: my, emoji, createdAt: new Date().toISOString() }] }));
      await svc.addMikoposReaction(postId, my, emoji);
    }
  }, []);

  const reply = useCallback(async (postId: string, body: string, imageUrl: string | null = null) => {
    const created = await svc.addMikoposReply(postId, meRef.current, body, imageUrl);
    setData(prev => (prev.replies.some(r => r.id === created.id) ? prev : { ...prev, replies: [...prev.replies, created] }));
  }, []);

  const removeReply = useCallback(async (id: string) => {
    await svc.deleteMikoposReply(id);
    setData(prev => ({ ...prev, replies: prev.replies.filter(r => r.id !== id) }));
  }, []);

  const vote = useCallback(async (postId: string, optionIndex: number) => {
    const my = meRef.current;
    setData(prev => ({
      ...prev,
      votes: [...prev.votes.filter(v => !(v.postId === postId && v.userName === my)), { postId, userName: my, optionIndex }],
    }));
    await svc.voteMikoposPoll(postId, my, optionIndex);
  }, []);

  return {
    ...data,
    available,
    loaded,
    reload: load,
    post, removePost, toggleReaction, reply, removeReply, vote,
  };
}

export type MikoposApi = ReturnType<typeof useMikopos>;
