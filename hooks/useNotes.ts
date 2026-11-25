// hooks/useNotes.ts
// ============================================================
// ノート機能の状態管理フック
//   - 取得 / Realtime 反映 / 楽観的更新 + デバウンス保存
//   - 未確認のアナウンスの集計
// App で1回だけ呼び出し、NotesPanel に渡す(ヘッダーのバッジ・アナウンス通知のため
// パネルを閉じていても常に動かす)
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Note, NoteFolder, NoteRead, NoteVisibility, User } from '../types';
import * as svc from '../services/notesService';

export type NoteSaveState = 'idle' | 'saving' | 'saved' | 'error';

interface UseNotesOptions {
  me: User | null;
  /** メンバーの一覧(自分の案内可能商材と、入った日を知るため。商材で公開されたノートの判定に使う) */
  users?: User[];
  /** 他の人がアナウンスしたときに呼ばれる(プッシュ通知用) */
  onAnnounce?: (note: Note, isReminder?: boolean) => void;
  /** 自分が作った・編集した・コメントしたノートに、他の人がコメントしたときに呼ばれる(プッシュ通知用) */
  onComment?: (note: Note, comment: svc.NoteComment) => void;
}

const SAVE_DEBOUNCE_MS = 900;

export function useNotes({ me, users, onAnnounce, onComment }: UseNotesOptions) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const [reads, setReads] = useState<NoteRead[]>([]);
  /** 確認済みの情報を1回は読み込み終えたか(読み込み前に「未確認」と誤って出さないため) */
  const [readsLoaded, setReadsLoaded] = useState(false);
  /** ノートの一覧を1回は読み込み終えたか */
  const notesLoadedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<NoteSaveState>('idle');

  const meName = me?.name ?? '';
  const meIsAdmin = !!(me?.isAdmin || me?.isSuperAdmin);
  // 自分の最新の登録内容(案内可能商材・入った日)。メンバーの一覧にまだ無いときは、ログイン時の内容を使う
  const meData = useMemo(() => users?.find(u => u.name === meName) ?? me, [users, meName, me]);
  const meProductsKey = [...(meData?.availableProducts ?? [])].sort().join('\n');
  const meCreatedAt = meData?.createdAt;
  const viewer = useMemo(
    () => (meName ? { name: meName, isAdmin: meIsAdmin, isSuperAdmin: false, availableProducts: meProductsKey ? meProductsKey.split('\n') : [] } : null),
    [meName, meIsAdmin, meProductsKey]
  );
  const viewerRef = useRef(viewer);
  useEffect(() => { viewerRef.current = viewer; }, [viewer]);

  const notesRef = useRef<Note[]>([]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const readsRef = useRef<NoteRead[]>([]);
  useEffect(() => { readsRef.current = reads; }, [reads]);
  const onAnnounceRef = useRef(onAnnounce);
  useEffect(() => { onAnnounceRef.current = onAnnounce; }, [onAnnounce]);
  const onCommentRef = useRef(onComment);
  useEffect(() => { onCommentRef.current = onComment; }, [onComment]);

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
      notesLoadedRef.current = true;
      // アナウンスが1件も無ければ、確認済みの情報を取りに行く必要がないので「読み込み済み」にする
      if (!n.some(x => x.isAnnouncement)) setReadsLoaded(true);
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
    if (ids.length === 0) {
      setReads([]);
      // ノートの一覧がまだ届いていないときは「読み込み済み」にしない(未確認を誤って出さないため)
      if (notesLoadedRef.current) setReadsLoaded(true);
      return;
    }
    try { setReads(await svc.fetchNoteReads(ids)); } catch { /* 既読は補助情報なので無視 */ }
    setReadsLoaded(true);
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

  // アナウンスノートの集合が変わったら既読を取り直す
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
        // 他の人のアナウンスを検知(再アナウンスは announced_at が変わる)
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

  /** 「保存」ボタン用: 変更をまとめて保存する(完了を待ち、失敗したら例外を投げる。自動保存はしない) */
  const saveNote = useCallback(async (id: string, patch: svc.NotePatch) => {
    const v = viewerRef.current;
    if (!v) return;
    await flush(id); // ピン留めなど、先に送信待ちの変更があれば先に送る
    inflight.current.add(id);
    try {
      // タイトル・本文を書き換えるときは、保存前の内容を履歴に残す(前の版に戻せるように)
      const prev = notesRef.current.find(n => n.id === id);
      const contentChanged = !!prev && (
        (patch.title !== undefined && patch.title !== prev.title) ||
        (patch.body !== undefined && patch.body !== prev.body));
      if (prev && contentChanged && (prev.title || prev.body)) await svc.saveNoteVersion(prev);
      const updated = await svc.updateNote(id, patch, v.name);
      setNotes(prev => prev.map(n => (n.id === id ? updated : n)));
      setSaveState('saved');
      setError(null);
    } finally {
      inflight.current.delete(id);
    }
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

  const announce = useCallback(async (id: string, opts: svc.AnnounceOptions = {}) => {
    const v = viewerRef.current;
    if (!v) return;
    await flush(id); // 直前の編集内容を保存してからアナウンス
    const updated = await svc.announceNote(id, v.name, opts);
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

  /** 確認済みにして、アナウンスの一覧から非表示にする(未確認なら確認も同時に記録) */
  const hideAnnouncement = useCallback(async (noteId: string) => {
    const v = viewerRef.current;
    if (!v) return;
    const already = readsRef.current.some(x => x.noteId === noteId && x.userName === v.name);
    const r = already
      ? await svc.setNoteReadHidden(noteId, v.name, true)
      : await svc.markNoteRead(noteId, v.name, true);
    setReads(prev => [...prev.filter(x => !(x.noteId === noteId && x.userName === v.name)), r]);
  }, []);

  /** 非表示にしたアナウンスを、アナウンスの一覧に戻す */
  const unhideAnnouncement = useCallback(async (noteId: string) => {
    const v = viewerRef.current;
    if (!v) return;
    const r = await svc.setNoteReadHidden(noteId, v.name, false);
    setReads(prev => [...prev.filter(x => !(x.noteId === noteId && x.userName === v.name)), r]);
  }, []);

  // ── フォルダ操作 ──────────────────────────────────────
  const addFolder = useCallback(async (params: {
    name: string; parentId: string | null; visibility?: NoteVisibility; sharedWith?: string[]; contributors?: string[];
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

  /** フォルダ(サブフォルダを含む)の中の自分のノートの公開範囲を、まとめて同じ設定にする */
  const setNotesVisibilityInFolder = useCallback(async (id: string, visibility: NoteVisibility, sharedWith: string[]) => {
    const v = viewerRef.current;
    if (!v) throw new Error('ログインしていません');
    const childIds = folders.filter(f => f.parentId === id && f.owner === v.name).map(f => f.id);
    await svc.updateNotesVisibilityInFolders([id, ...childIds], v.name, visibility, sharedWith);
    await load();
  }, [folders, load]);

  const removeFolder = useCallback(async (id: string) => {
    await svc.deleteFolder(id);
    await load();
  }, [load]);

  // ── 共同フォルダ(持ち主のほかに、ノートを入れられる人を決める) ──
  /** 「ノートを入れられる人」の欄があるか(SQL 未実行なら false。このときは、設定の欄を出さない) */
  const [contributorsAvailable, setContributorsAvailable] = useState(false);
  useEffect(() => {
    if (!viewer || unavailable) { setContributorsAvailable(false); return; }
    let cancelled = false;
    void svc.fetchFolderContributorsAvailable().then(ok => { if (!cancelled) setContributorsAvailable(ok); });
    return () => { cancelled = true; };
  }, [viewer, unavailable]);
  /** フォルダ(サブフォルダにも同じ設定)の「ノートを入れられる人」を変える */
  const setFolderContributors = useCallback(async (id: string, contributors: string[]) => {
    const childIds = folders.filter(f => f.parentId === id).map(f => f.id);
    await svc.updateFolderContributors([id, ...childIds], contributors);
    await load();
  }, [folders, load]);
  /** 自分のフォルダに入っている、ほかの人のノートを、フォルダから外す */
  const ejectNote = useCallback(async (noteId: string) => {
    await svc.removeNoteFromFolder(noteId);
    setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, folderId: null } : n)));
  }, []);

  // ── 共有されたノートを、自分のフォルダに入れる(人ごとの置き場所。原本は動かさない) ──
  const [placements, setPlacements] = useState<Record<string, string>>({});
  /** 置き場所を保存するテーブルがあるか(SQL 未実行なら false。このときは、入れる欄を出さない) */
  const [placementsAvailable, setPlacementsAvailable] = useState(false);
  const loadPlacements = useCallback(async () => {
    const name = viewerRef.current?.name;
    if (!name) return;
    try {
      const map = await svc.fetchNotePlacements(name);
      if (viewerRef.current?.name !== name) return;
      setPlacementsAvailable(map !== null);
      setPlacements(map ?? {});
    } catch { /* 通信の失敗は、前の内容を残す */ }
  }, []);
  useEffect(() => {
    if (!viewer || unavailable) { setPlacements({}); setPlacementsAvailable(false); return; }
    void loadPlacements();
  }, [viewer, unavailable, loadPlacements]);
  const placeNote = useCallback(async (noteId: string, folderId: string | null) => {
    const name = viewerRef.current?.name;
    if (!name) return;
    setPlacements(prev => {
      const next = { ...prev };
      if (folderId) next[noteId] = folderId; else delete next[noteId];
      return next;
    });
    try {
      await svc.setNotePlacement(noteId, name, folderId);
    } catch (e) {
      await loadPlacements();
      throw e;
    }
  }, [loadPlacements]);

  // ── 共有されたフォルダのうち、ふだん表示するもの(人ごと) ──
  //    保存先のテーブルがあればアカウントごと、無ければ(SQL 未実行)このブラウザにだけ覚える
  //    値は置き場所('shared' = シェアノート / 'mine' = マイノート)。入っていないフォルダは、表示しない。
  //    ブラウザにも毎回覚えておく(テーブルや、置き場所の欄がまだ無いときに使う)
  const [shownFolders, setShownFolders] = useState<Map<string, svc.SharedFolderPlace>>(() => new Map());
  const shownFoldersInDb = useRef(false);
  const shownFoldersKey = (name: string) => `mikonote_shown_shared_folders:${name}`;
  /** ブラウザに覚えた内容(前の形式 = IDの一覧 は、すべてシェアノート扱い) */
  const readLocalShown = (name: string): Map<string, svc.SharedFolderPlace> => {
    const map = new Map<string, svc.SharedFolderPlace>();
    try {
      const raw = JSON.parse(localStorage.getItem(shownFoldersKey(name)) ?? 'null');
      if (Array.isArray(raw)) raw.forEach(id => { if (typeof id === 'string') map.set(id, 'shared'); });
      else if (raw && typeof raw === 'object') Object.entries(raw).forEach(([id, p]) => map.set(id, p === 'mine' ? 'mine' : 'shared'));
    } catch { /* 読めなければ、何も選んでいない扱い */ }
    return map;
  };
  const loadShownFolders = useCallback(async () => {
    const name = viewerRef.current?.name;
    if (!name) return;
    try {
      const rows = await svc.fetchShownSharedFolders(name);
      if (viewerRef.current?.name !== name) return;
      shownFoldersInDb.current = rows !== null;
      const local = readLocalShown(name);
      if (rows === null) { setShownFolders(local); return; }
      // 置き場所の欄がまだ無いフォルダは、ブラウザに覚えた置き場所を使う(無ければシェアノート)
      setShownFolders(new Map(Object.entries(rows).map(([id, place]) => [id, place ?? local.get(id) ?? 'shared'])));
    } catch { /* 通信の失敗は、前の内容を残す */ }
  }, []);
  useEffect(() => {
    if (!viewer || unavailable) { setShownFolders(new Map()); return; }
    void loadShownFolders();
  }, [viewer, unavailable, loadShownFolders]);
  /** 共有フォルダを表示する(place = 置き場所) / 表示しない(place = null) */
  const showSharedFolder = useCallback(async (folderId: string, place: svc.SharedFolderPlace | null) => {
    const name = viewerRef.current?.name;
    if (!name) return;
    setShownFolders(prev => {
      const next = new Map(prev);
      if (place) next.set(folderId, place); else next.delete(folderId);
      try { localStorage.setItem(shownFoldersKey(name), JSON.stringify(Object.fromEntries(next))); } catch { /* 覚えられなくても、この場の切り替えはできる */ }
      return next;
    });
    if (!shownFoldersInDb.current) return;
    try {
      await svc.setSharedFolderShown(folderId, name, place);
    } catch (e) {
      await loadShownFolders();
      throw e;
    }
  }, [loadShownFolders]);

  // ── ノートとフォルダを、自分の好きな順に並べる(人ごと) ──
  //    保存先のテーブルがあればアカウントごと、無ければ(SQL 未実行)このブラウザにだけ覚える
  const [orders, setOrders] = useState<svc.NoteUserOrders>({ notes: [], folders: [] });
  const ordersRef = useRef(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);
  const ordersInDb = useRef(false);
  const ordersKey = (name: string) => `mikonote_orders:${name}`;
  const loadOrders = useCallback(async () => {
    const name = viewerRef.current?.name;
    if (!name) return;
    try {
      const fromDb = await svc.fetchUserOrders(name);
      if (viewerRef.current?.name !== name) return;
      ordersInDb.current = fromDb !== null;
      if (fromDb !== null) { setOrders(fromDb); return; }
      let local: any = null;
      try { local = JSON.parse(localStorage.getItem(ordersKey(name)) ?? 'null'); } catch { /* 読めなければ、並べていない扱い */ }
      const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
      setOrders({ notes: ids(local?.notes), folders: ids(local?.folders) });
    } catch { /* 通信の失敗は、前の内容を残す */ }
  }, []);
  useEffect(() => {
    if (!viewer || unavailable) { setOrders({ notes: [], folders: [] }); return; }
    void loadOrders();
  }, [viewer, unavailable, loadOrders]);
  /** 並べた順を保存する(kind: ノート / フォルダ。ids: 並べた順のIDの一覧) */
  const saveOrder = useCallback(async (kind: 'notes' | 'folders', ids: string[]) => {
    const name = viewerRef.current?.name;
    if (!name) return;
    const next = { ...ordersRef.current, [kind]: ids };
    ordersRef.current = next;
    setOrders(next);
    if (!ordersInDb.current) {
      try { localStorage.setItem(ordersKey(name), JSON.stringify(next)); } catch { /* 覚えられなくても、この場の並び替えはできる */ }
      return;
    }
    try {
      await svc.saveUserOrders(name, next);
    } catch (e) {
      await loadOrders();
      throw e;
    }
  }, [loadOrders]);

  // ── コメントの数と、まだ見ていないコメント ───────────────
  const [commentMeta, setCommentMeta] = useState<svc.NoteCommentMeta[]>([]);
  /** 自分が各ノートのコメントを最後に見た日時 */
  const [commentSeen, setCommentSeen] = useState<Record<string, string>>({});
  /** 「どこまで見たか」を覚えるテーブルがあるか(SQL 未実行なら false。このときは「まだ見ていない」の印を出さない) */
  const [commentSeenAvailable, setCommentSeenAvailable] = useState(false);
  /** 「どこまで見たか」を1回は読み込み終えたか(読み込み前に、全部を「まだ見ていない」と出さないため) */
  const [commentSeenLoaded, setCommentSeenLoaded] = useState(false);
  /** 自分が編集したことのあるノート */
  const [editedNoteIds, setEditedNoteIds] = useState<Set<string>>(new Set());
  const commentMetaRef = useRef<svc.NoteCommentMeta[]>([]);
  useEffect(() => { commentMetaRef.current = commentMeta; }, [commentMeta]);
  const commentSeenAvailableRef = useRef(false);
  useEffect(() => { commentSeenAvailableRef.current = commentSeenAvailable; }, [commentSeenAvailable]);

  const loadCommentMeta = useCallback(async () => {
    try { setCommentMeta(await svc.fetchNoteCommentMeta()); } catch { /* 件数は補助情報なので、取れなくても続ける */ }
  }, []);
  useEffect(() => {
    if (!viewer || unavailable) {
      setCommentMeta([]); setCommentSeen({}); setCommentSeenAvailable(false); setCommentSeenLoaded(false); setEditedNoteIds(new Set());
      return;
    }
    const name = viewer.name;
    let stopped = false;
    void loadCommentMeta();
    svc.fetchNoteCommentSeen(name)
      .then(map => { if (stopped) return; setCommentSeenAvailable(map !== null); setCommentSeen(map ?? {}); setCommentSeenLoaded(true); })
      .catch(() => {});
    svc.fetchMyEditedNoteIds(name).then(ids => { if (!stopped) setEditedNoteIds(ids); }).catch(() => {});
    return () => { stopped = true; };
  }, [viewer, unavailable, loadCommentMeta]);

  /**
   * ノートごとのコメントの数 / 自分が「気にかける」ノート / まだ見ていないコメントの数。
   * 気にかけるノート = 自分が作った・自分が編集した・自分がコメントしたノート(通知と「まだ見ていない」の印の対象)
   */
  const commentInfo = useMemo(() => {
    const counts: Record<string, number> = {};
    const commented = new Set<string>();
    for (const m of commentMeta) {
      counts[m.noteId] = (counts[m.noteId] ?? 0) + 1;
      if (m.author === meName) commented.add(m.noteId);
    }
    const watching = new Set<string>();
    for (const n of notes) {
      if (n.owner === meName || n.updatedBy === meName || commented.has(n.id) || editedNoteIds.has(n.id)) watching.add(n.id);
    }
    const unseen: Record<string, number> = {};
    if (commentSeenAvailable && commentSeenLoaded) {
      for (const m of commentMeta) {
        if (m.author === meName || !watching.has(m.noteId)) continue;
        const seen = commentSeen[m.noteId];
        if (!seen || Date.parse(m.createdAt) > Date.parse(seen)) unseen[m.noteId] = (unseen[m.noteId] ?? 0) + 1;
      }
    }
    return { counts, watching, unseen };
  }, [commentMeta, commentSeen, commentSeenAvailable, commentSeenLoaded, editedNoteIds, notes, meName]);
  const watchingRef = useRef(commentInfo.watching);
  useEffect(() => { watchingRef.current = commentInfo.watching; }, [commentInfo]);

  /** このノートのコメントを「ここまで見た」と記録する(latest: いま画面に出ている一番新しいコメントの日時) */
  const markCommentsSeen = useCallback(async (noteId: string, latest?: string) => {
    const name = viewerRef.current?.name;
    if (!name || !commentSeenAvailableRef.current) return;
    // 端末の時計が少し遅れていても、いま見えているコメントは「見た」ことにする
    let t = Date.now();
    const l = latest ? Date.parse(latest) : NaN;
    if (!Number.isNaN(l)) t = Math.max(t, l);
    for (const m of commentMetaRef.current) {
      if (m.noteId !== noteId) continue;
      const c = Date.parse(m.createdAt);
      if (!Number.isNaN(c)) t = Math.max(t, c);
    }
    const iso = new Date(t).toISOString();
    setCommentSeen(prev => ({ ...prev, [noteId]: iso }));
    try { await svc.markNoteCommentsSeen(noteId, name, iso); } catch { /* 記録できなくても、表示は続ける */ }
  }, []);

  // ── コメントの通知 ─────────────────────────────────────
  useEffect(() => {
    if (!viewer || unavailable) return;
    let metaTimer: number | undefined;
    const unsubscribe = svc.subscribeToNoteComments((event, row) => {
      // 件数と「まだ見ていない」の印を、少し待ってから取り直す
      window.clearTimeout(metaTimer);
      metaTimer = window.setTimeout(() => { void loadCommentMeta(); }, 400);
      if (event !== 'INSERT' || !row) return;
      const v = viewerRef.current;
      if (!v) return;
      const comment = svc.rowToNoteComment(row);
      if (comment.author === v.name) return;
      // 自分が見られるノートのときだけ
      const note = notesRef.current.find(n => n.id === comment.noteId);
      if (!note) return;
      // 自分が作った・編集した・コメントしたノートなら知らせる
      if (note.owner === v.name || watchingRef.current.has(note.id)) { onCommentRef.current?.(note, comment); return; }
      // 手元の情報が古いかもしれないので、自分もコメントしたノートかどうかは取り直して確かめる
      svc.fetchNoteComments(comment.noteId)
        .then(list => { if (list.some(c => c.author === v.name)) onCommentRef.current?.(note, comment); })
        .catch(() => {});
    });
    return () => { window.clearTimeout(metaTimer); unsubscribe(); };
  }, [viewer, unavailable, loadCommentMeta]);

  // ── アナウンスの再通知 ─────────────────────────────────
  const remindRef = useRef<{ send: (noteId: string) => Promise<void> } | null>(null);
  useEffect(() => {
    if (!viewer || unavailable) return;
    const sub = svc.subscribeToAnnounceReminders(noteId => {
      const v = viewerRef.current;
      if (!v) return;
      // 自分が見られて、まだ確認していないアナウンスのときだけ知らせる
      const note = notesRef.current.find(n => n.id === noteId);
      if (!note || !note.isAnnouncement || note.owner === v.name) return;
      if (readsRef.current.some(r => r.noteId === noteId && r.userName === v.name)) return;
      onAnnounceRef.current?.(note, true);
    });
    remindRef.current = sub;
    return () => { remindRef.current = null; sub.unsubscribe(); };
  }, [viewer, unavailable]);

  /** まだ確認していない人にだけ、もう一度通知する(確認状況はリセットしない) */
  const remindUnread = useCallback(async (id: string) => {
    if (!remindRef.current) throw new Error('再通知を送れませんでした。少し待ってから、もう一度お試しください');
    await remindRef.current.send(id);
  }, []);

  // ── 集計 ─────────────────────────────────────────────
  const myReadIds = useMemo(
    () => new Set(reads.filter(r => r.userName === meName).map(r => r.noteId)),
    [reads, meName]
  );
  /** 自分が「確認済みにして非表示」にしたアナウンスのID */
  const myHiddenIds = useMemo(
    () => new Set(reads.filter(r => r.userName === meName && r.hidden).map(r => r.noteId)),
    [reads, meName]
  );
  /** 自分宛ての、まだ「確認しました」を押していないアナウンス */
  const unreadAnnouncements = useMemo(
    // 自分が入る前に出たアナウンスは、読めるが「未確認」には数えない
    () => notes.filter(n => n.isAnnouncement && n.owner !== meName && !myReadIds.has(n.id)
      && !svc.joinedAfterAnnounce(n, { name: meName, createdAt: meCreatedAt })),
    [notes, meName, myReadIds, meCreatedAt]
  );

  return {
    notes, folders, reads, loading, unavailable, error, saveState,
    myReadIds, myHiddenIds, unreadAnnouncements, readsLoaded,
    reload: load, flushAll, clearError: () => setError(null),
    editNote, saveNote, addNote, removeNote, copyToMine, announce, unannounce, remindUnread, markRead, hideAnnouncement, unhideAnnouncement,
    addFolder, renameFolder, setFolderVisibility, setNotesVisibilityInFolder, removeFolder,
    contributorsAvailable, setFolderContributors, ejectNote,
    placements, placementsAvailable, placeNote,
    shownFolders, showSharedFolder,
    orders, saveOrder,
    commentInfo, commentSeen, commentSeenAvailable, commentSeenLoaded, markCommentsSeen, reloadCommentMeta: loadCommentMeta,
  };
}

export type NotesApi = ReturnType<typeof useNotes>;
