// hooks/useNotes.ts
// ============================================================
// ノート機能の状態管理フック
//   - 取得 / Realtime 反映 / 楽観的更新 + デバウンス保存
//   - 未確認の周知の集計
// App で1回だけ呼び出し、NotesPanel に渡す(ヘッダーのバッジ・周知通知のため
// パネルを閉じていても常に動かす)
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Note, NoteFolder, NoteRead, NoteVisibility, User } from '../types';
import * as svc from '../services/notesService';

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error';

interface UseNotesOptions {
  me: User | null;
  /** 他の人が周知したときに呼ばれる(プッシュ通知用) */
  onAnnounce?: (note: Note) => void;
}

const SAVE_DEBOUNCE_MS = 900;

export function useNotes({ me, onAnnounce }: UseNotesOptions) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [reads, setReads] = useState<NoteRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<NoteSaveState>('idle');

  const meName = me?.name ?? '';
  const meIsAdmin = !!(me?.isAdmin || me?.isSuperAdmin);
  const viewer = useMemo(
    () => (meName ? { name: meName, isAdmin: meIsAdmin, isSuperAdmin: false } : null),
    [meName, meIsAdmin]
  );
  const viewerRef = useRef(viewer);
  useEffect(() => { viewerRef.current = viewer; }, [viewer]);

  const notesRef = useRef<Note[]>([]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const readsRef = useRef<NoteRead[]>([]);
  useEffect(() => { readsRef.current = reads; }, [reads]);
  const onAnnounceRef = useRef(onAnnounce);
  useEffect(() => { onAnnounceRef.current = onAnnounce; }, [onAnnounce]);

  // 保存待ちの変更 / 保存中のノート(自分の編集を Realtime のエコーで上書きしないため)
  const pending = useRef(new Map<string, svc.NotePatch>());
  const timers = useRef(new Map<string, number>());
  const inflight = useRef(new Set<string>());

  // ── 取得 ──────────────────────────────────────────────
  const load = useCallback(async () => {
    const v = viewerRef.current;
    if (!v) return;
    try {
      const [f, n] = await Promise.all([svc.fetchFolders(v), svc.fetchNotes(v)]);
      setFolders(f);
      setNotes(n);
      setUnavailable(false);
      setError(null);
    } catch (e: any) {
      if (e instanceof svc.NotesUnavailableError) setUnavailable(true);
      else setError(e?.message ?? 'ノートの取得に失敗しました');
    }
  }, []);

  const loadFolders = useCallback(async () => {
    const v = viewerRef.current;
    if (!v) return;
    try { setFolders(await svc.fetchFolders(v)); } catch { /* 次回の load で回復 */ }
  }, []);

  const loadReads = useCallback(async () => {
    const ids = notesRef.current.filter(n => n.isAnnouncement).map(n => n.id);
    if (ids.length === 0) { setReads([]); return; }
    try { setReads(await svc.fetchNoteReads(ids)); } catch { /* 既読は補助情報なので無視 */ }
  }, []);

  useEffect(() => {
    if (!viewer) {
      setNotes([]); setFolders([]); setReads([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [viewer, load]);

  // 周知ノートの集合が変わったら既読を取り直す
  const announcedKey = useMemo(
    () => notes.filter(n => n.isAnnouncement).map(n => `${n.id}:${n.announcedAt ?? ''}`).sort().join(','),
    [notes]
  );
  useEffect(() => { void loadReads(); }, [announcedKey, loadReads]);

  // ── Realtime ──────────────────────────────────────────
  useEffect(() => {
    if (!viewer || unavailable) return;
    let readTimer: number | undefined;
    let folderTimer: number | undefined;
    const unsubscribe = svc.subscribeToNotes({
      onNote: (event, row, oldRow) => {
        const v = viewerRef.current;
        if (!v) return;
        if (event === 'DELETE') {
          const id = oldRow?.id;
          if (id) setNotes(prev => prev.filter(n => n.id !== id));
          return;
        }
        if (!row) return;
        const prev = notesRef.current.find(n => n.id === row.id);
        const note = svc.rowToNote(row);
        // 大きい本文は Realtime で省略されることがあるため、前回の値を引き継ぐ
        if (row.body === undefined && prev) note.body = prev.body;
        if (row.source_snapshot === undefined && prev) note.sourceSnapshot = prev.sourceSnapshot;

        if (!svc.canView(note, v)) {
          setNotes(p => p.filter(n => n.id !== note.id));
          return;
        }
        // 他の人の周知を検知(再周知は announced_at が変わる)
        if (
          note.isAnnouncement && note.owner !== v.name && note.announcedAt &&
          note.announcedAt !== prev?.announcedAt
        ) {
          onAnnounceRef.current?.(note);
        }
        // 自分が編集中のノートは、エコーで古い内容に戻さない
        if (pending.current.has(note.id) || inflight.current.has(note.id)) return;
        setNotes(p => (p.some(n => n.id === note.id)
          ? p.map(n => (n.id === note.id ? note : n))
          : [note, ...p]));
      },
      onFolder: () => {
        window.clearTimeout(folderTimer);
        folderTimer = window.setTimeout(() => { void loadFolders(); }, 300);
      },
      onRead: () => {
        window.clearTimeout(readTimer);
        readTimer = window.setTimeout(() => { void loadReads(); }, 300);
      },
    });
    return () => {
      window.clearTimeout(readTimer);
      window.clearTimeout(folderTimer);
      unsubscribe();
    };
  }, [viewer, unavailable, loadFolders, loadReads]);

  // ── 保存(楽観的更新 + デバウンス) ───────────────────────
  const flush = useCallback(async (id: string) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const patch = pending.current.get(id);
    const v = viewerRef.current;
    if (!patch || !v) return;
    pending.current.delete(id);
    inflight.current.add(id);
    try {
      await svc.updateNote(id, patch, v.name);
      setSaveState(pending.current.size > 0 || inflight.current.size > 1 ? 'saving' : 'saved');
      setError(null);
    } catch (e: any) {
      // 失敗した変更は戻して再試行できるようにする
      pending.current.set(id, { ...patch, ...pending.current.get(id) });
      setSaveState('error');
      setError(e?.message ?? 'ノートの保存に失敗しました');
    } finally {
      inflight.current.delete(id);
    }
  }, []);

  const flushAll = useCallback(async () => {
    await Promise.all(Array.from(pending.current.keys()).map(id => flush(id)));
  }, [flush]);

  const editNote = useCallback((id: string, patch: svc.NotePatch, opts?: { immediate?: boolean }) => {
    const v = viewerRef.current;
    if (!v) return;
    setNotes(prev => prev.map(n => {
      if (n.id !== id) return n;
      const next: Note = { ...n, ...patch, updatedAt: new Date().toISOString(), updatedBy: v.name };
      if (patch.visibility === 'private') next.isAnnouncement = false;
      return next;
    }));
    pending.current.set(id, { ...pending.current.get(id), ...patch });
    setSaveState('saving');
    window.clearTimeout(timers.current.get(id));
    if (opts?.immediate) {
      void flush(id);
    } else {
      timers.current.set(id, window.setTimeout(() => { void flush(id); }, SAVE_DEBOUNCE_MS));
    }
  }, [flush]);

  // ページを離れる直前に、保存待ちがあれば送信(ベストエフォート)
  useEffect(() => {
    const handler = () => { void flushAll(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [flushAll]);

  // ── ノート操作 ────────────────────────────────────────
  const addNote = useCallback(async (params: Omit<svc.NewNoteParams, 'owner'>): Promise<Note> => {
    const v = viewerRef.current;
    if (!v) throw new Error('ログインしていません');
    const note = await svc.createNote({ ...params, owner: v.name });
    setNotes(prev => (prev.some(n => n.id === note.id) ? prev : [note, ...prev]));
    return note;
  }, []);

  const removeNote = useCallback(async (id: string) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    pending.current.delete(id);
    await svc.deleteNote(id);
    setNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  const copyToMine = useCallback(async (note: Note): Promise<Note> => {
    const v = viewerRef.current;
    if (!v) throw new Error('ログインしていません');
    const created = await svc.copyNoteToMine(note, v.name);
    setNotes(prev => [created, ...prev]);
    return created;
  }, []);

  const announce = useCallback(async (id: string) => {
    const v = viewerRef.current;
    if (!v) return;
    await flush(id); // 直前の編集内容を保存してから周知
    const updated = await svc.announceNote(id, v.name);
    setReads(prev => prev.filter(r => r.noteId !== id));
    setNotes(prev => prev.map(n => (n.id === id ? { ...updated, body: n.body } : n)));
  }, [flush]);

  const unannounce = useCallback(async (id: string) => {
    const v = viewerRef.current;
    if (!v) return;
    const updated = await svc.unannounceNote(id, v.name);
    setNotes(prev => prev.map(n => (n.id === id ? { ...updated, body: n.body } : n)));
  }, []);

  const markRead = useCallback(async (noteId: string) => {
    const v = viewerRef.current;
    if (!v) return;
    const r = await svc.markNoteRead(noteId, v.name);
    setReads(prev => [...prev.filter(x => !(x.noteId === noteId && x.userName === v.name)), r]);
  }, []);

  /** 確認済みにして、周知の一覧から非表示にする(未確認なら確認も同時に記録) */
  const hideAnnouncement = useCallback(async (noteId: string) => {
    const v = viewerRef.current;
    if (!v) return;
    const already = readsRef.current.some(x => x.noteId === noteId && x.userName === v.name);
    const r = already
      ? await svc.setNoteReadHidden(noteId, v.name, true)
      : await svc.markNoteRead(noteId, v.name, true);
    setReads(prev => [...prev.filter(x => !(x.noteId === noteId && x.userName === v.name)), r]);
  }, []);

  /** 非表示にした周知を、周知の一覧に戻す */
  const unhideAnnouncement = useCallback(async (noteId: string) => {
    const v = viewerRef.current;
    if (!v) return;
    const r = await svc.setNoteReadHidden(noteId, v.name, false);
    setReads(prev => [...prev.filter(x => !(x.noteId === noteId && x.userName === v.name)), r]);
  }, []);

  // ── フォルダ操作 ──────────────────────────────────────
  const addFolder = useCallback(async (params: {
    name: string; parentId: string | null; visibility?: NoteVisibility; sharedWith?: string[];
  }): Promise<NoteFolder> => {
    const v = viewerRef.current;
    if (!v) throw new Error('ログインしていません');
    const folder = await svc.createFolder({ owner: v.name, ...params });
    setFolders(prev => [...prev, folder]);
    return folder;
  }, []);

  const renameFolder = useCallback(async (id: string, name: string) => {
    await svc.renameFolder(id, name);
    setFolders(prev => prev.map(f => (f.id === id ? { ...f, name } : f)));
  }, []);

  const setFolderVisibility = useCallback(async (id: string, visibility: NoteVisibility, sharedWith: string[]) => {
    const childIds = folders.filter(f => f.parentId === id).map(f => f.id);
    await svc.updateFolderVisibility(id, childIds, visibility, sharedWith);
    await load();
  }, [folders, load]);

  const removeFolder = useCallback(async (id: string) => {
    await svc.deleteFolder(id);
    await load();
  }, [load]);

  // ── 集計 ─────────────────────────────────────────────
  const myReadIds = useMemo(
    () => new Set(reads.filter(r => r.userName === meName).map(r => r.noteId)),
    [reads, meName]
  );
  /** 自分が「確認済みにして非表示」にした周知のID */
  const myHiddenIds = useMemo(
    () => new Set(reads.filter(r => r.userName === meName && r.hidden).map(r => r.noteId)),
    [reads, meName]
  );
  /** 自分宛ての、まだ「確認しました」を押していない周知 */
  const unreadAnnouncements = useMemo(
    () => notes.filter(n => n.isAnnouncement && n.owner !== meName && !myReadIds.has(n.id)),
    [notes, meName, myReadIds]
  );

  return {
    notes, folders, reads, loading, unavailable, error, saveState,
    myReadIds, myHiddenIds, unreadAnnouncements,
    reload: load, flushAll, clearError: () => setError(null),
    editNote, addNote, removeNote, copyToMine, announce, unannounce, markRead, hideAnnouncement, unhideAnnouncement,
    addFolder, renameFolder, setFolderVisibility, removeFolder,
  };
}

export type NotesApi = ReturnType<typeof useNotes>;
