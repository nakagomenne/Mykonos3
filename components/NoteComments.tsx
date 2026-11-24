import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Note, User } from '../types';
import {
  NoteComment, NOTE_COMMENT_MAX, NoteCommentsUnavailableError,
  fetchNoteComments, addNoteComment, deleteNoteComment, subscribeToNoteComments, fetchNoteCommentAnchorsAvailable,
} from '../services/notesService';
import { NoteIcon } from './NoteIcons';
import {
  NoteCommentContext, COMMENT_ANCHOR_MAX,
} from './noteCommentAnchors';
import type { CommentAnchor, NewCommentAnchor, NoteCommentBridge } from './noteCommentAnchors';

interface NoteCommentsProps {
  note: Note;
  me: User;
  isDarkMode?: boolean;
  /** コメントを使うか(「自分だけ」のノートと、編集中は false。このときは本文だけを出す) */
  enabled: boolean;
  /** ノートの本文。この中の文字を選んで、その場所にコメントを付けられる */
  children: React.ReactNode;
}

const fmt = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getMonth() + 1}/${dt.getDate()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
};
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 画面に出している小窓 */
type Pop =
  | { kind: 'menu'; x: number; y: number; anchor: NewCommentAnchor }
  | { kind: 'compose'; anchor: NewCommentAnchor }
  | { kind: 'thread'; rootId: string; rect: DOMRect; pinned: boolean };

const POP_WIDTH = 300;

/** 小窓を、目印の近く(下。入りきらなければ上)に出すための位置 */
const popStyle = (rect: { left: number; top: number; bottom: number }): React.CSSProperties => {
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - POP_WIDTH - 8));
  const below = window.innerHeight - rect.bottom;
  return below < 260 && rect.top > below
    ? { position: 'fixed', left, bottom: window.innerHeight - rect.top + 6, width: POP_WIDTH, maxHeight: Math.max(160, rect.top - 16) }
    : { position: 'fixed', left, top: rect.bottom + 6, width: POP_WIDTH, maxHeight: Math.max(160, below - 16) };
};

/**
 * ノートのコメント。
 *   - 本文の文字を選んで右クリック(または出てくる「コメント」ボタン)で、その場所にコメントを付けられる。
 *     付いた場所は ▼本文▼ のように小さな ▼ ではさまれ、マウスを乗せる(スマホはタップ)と中身が出る
 *   - 本文の下には、ノート全体へのコメントも含めて、すべてのコメントが並ぶ
 * 消せるのは、書いた本人と、ノートを作った人。
 * コメント用のテーブルがまだ無い(SQL 未実行)ときは、本文だけを出す
 */
const NoteComments: React.FC<NoteCommentsProps> = ({ note, me, isDarkMode = false, enabled, children }) => {
  const d = isDarkMode;
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  /** 「場所に付けるコメント」と「返信」が使えるか(追加の SQL を実行済みか) */
  const [anchorsAvailable, setAnchorsAvailable] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** 「削除」を1回押したコメント(もう一度押すと消す) */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  /** 下の一覧で、返信を書いているコメント */
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [pop, setPop] = useState<Pop | null>(null);
  const [popText, setPopText] = useState('');
  /** 文字を選んだときに出す「コメント」ボタン */
  const [selBtn, setSelBtn] = useState<NewCommentAnchor | null>(null);
  /** 本文の中に場所が見つかったコメント */
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);
  const bodyRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const editorApiRef = useRef<{ anchorFromSelection: () => NewCommentAnchor | null } | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const popRefState = useRef<Pop | null>(null);
  useEffect(() => { popRefState.current = pop; }, [pop]);
  const popTextRef = useRef('');
  useEffect(() => { popTextRef.current = popText; }, [popText]);

  const load = useCallback(async () => {
    try {
      const list = await fetchNoteComments(note.id);
      if (!aliveRef.current) return;
      setComments(list);
      setAvailable(true);
    } catch (e) {
      if (!aliveRef.current) return;
      // テーブルが無いときは欄ごと出さない。通信の失敗は、前の内容を残す
      if (e instanceof NoteCommentsUnavailableError) setAvailable(false);
    } finally {
      if (aliveRef.current) setLoaded(true);
    }
  }, [note.id]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    fetchNoteCommentAnchorsAvailable().then(ok => { if (aliveRef.current) setAnchorsAvailable(ok); });
  }, [enabled, load]);

  // ほかの人のコメント・削除を、その場で反映する
  useEffect(() => {
    if (!enabled || !available) return;
    let timer: number | undefined;
    const unsubscribe = subscribeToNoteComments((event, row) => {
      // 削除は、どのノートのコメントか分からないことがあるので、取り直して確かめる
      if (event !== 'DELETE' && row?.note_id !== note.id) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void load(); }, 300);
    });
    return () => { window.clearTimeout(timer); unsubscribe(); };
  }, [enabled, available, note.id, load]);

  const ready = enabled && available && loaded;
  const canAnchor = ready && anchorsAvailable;

  const roots = useMemo(() => comments.filter(c => !c.parentId), [comments]);
  const repliesOf = useCallback((id: string) => comments.filter(c => c.parentId === id), [comments]);

  // ── 本文とつなぐ(▼ を出す場所を渡す / 選んだ範囲を受け取る) ──
  const anchors = useMemo<CommentAnchor[]>(
    () => roots.filter(c => c.anchorText).map(c => ({ id: c.id, text: c.anchorText!, prefix: c.anchorPrefix ?? '', suffix: c.anchorSuffix ?? '' })),
    [roots]);
  const bridge = useMemo<NoteCommentBridge>(() => ({
    anchors,
    setEditorApi: api => { editorApiRef.current = api; },
    onResolved: ids => setResolvedIds(prev => (prev.size === ids.length && ids.every(i => prev.has(i)) ? prev : new Set(ids))),
  }), [anchors]);

  const closePop = useCallback(() => { window.clearTimeout(hideTimer.current); setPop(null); setPopText(''); }, []);
  const scheduleHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const p = popRefState.current;
      // 開いたままにしたもの・返信を書きかけのものは、勝手に閉じない
      if (p?.kind === 'thread' && !p.pinned && !popTextRef.current.trim()) setPop(null);
    }, 280);
  }, []);
  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  // 小窓の外を押したら閉じる / Esc で閉じる / 選ぶのをやめたら「コメント」ボタンを消す
  useEffect(() => {
    if (!canAnchor) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (popRef.current?.contains(t) || t.closest('[data-note-cmt-ui]')) return;
      if (t.closest('[data-cmt]')) return;
      if (popRefState.current) closePop();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && popRefState.current) closePop(); };
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setSelBtn(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('selectionchange', onSel);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('selectionchange', onSel);
    };
  }, [canAnchor, closePop]);

  const run = async (fn: () => Promise<void>, failMessage: string) => {
    setBusy(true);
    setError('');
    try { await fn(); }
    catch (e: any) { if (aliveRef.current) setError(e?.message ?? failMessage); }
    finally { if (aliveRef.current) setBusy(false); }
  };
  const addLocal = (created: NoteComment) => setComments(prev => (prev.some(c => c.id === created.id) ? prev : [...prev, created]));

  const send = () => {
    const body = text.trim();
    if (!body || text.length > NOTE_COMMENT_MAX || busy) return;
    void run(async () => {
      const created = await addNoteComment(note.id, me.name, body);
      if (!aliveRef.current) return;
      addLocal(created);
      setText('');
    }, 'コメントを送れませんでした');
  };

  const sendReply = (parentId: string, value: string, done: () => void) => {
    const body = value.trim();
    if (!body || value.length > NOTE_COMMENT_MAX || busy) return;
    void run(async () => {
      const created = await addNoteComment(note.id, me.name, body, { parentId });
      if (!aliveRef.current) return;
      addLocal(created);
      done();
    }, '返信を送れませんでした');
  };

  const sendAnchored = (anchor: NewCommentAnchor) => {
    const body = popText.trim();
    if (!body || popText.length > NOTE_COMMENT_MAX || anchor.text.length > COMMENT_ANCHOR_MAX || busy) return;
    void run(async () => {
      const created = await addNoteComment(note.id, me.name, body, { anchor: { text: anchor.text, prefix: anchor.prefix, suffix: anchor.suffix } });
      if (!aliveRef.current) return;
      addLocal(created);
      closePop();
      window.getSelection()?.removeAllRanges();
    }, 'コメントを送れませんでした');
  };

  const remove = (id: string) => {
    void run(async () => {
      await deleteNoteComment(id);
      if (!aliveRef.current) return;
      // もとのコメントを消すと、返信も一緒に消える
      setComments(prev => prev.filter(c => c.id !== id && c.parentId !== id));
      setConfirmId(null);
      if (popRefState.current?.kind === 'thread' && popRefState.current.rootId === id) closePop();
    }, 'コメントを削除できませんでした');
  };

  // ── 本文の上での操作 ──
  const currentAnchor = () => (canAnchor ? editorApiRef.current?.anchorFromSelection() ?? null : null);

  const onBodyContextMenu = (e: React.MouseEvent) => {
    const anchor = currentAnchor();
    if (!anchor) return;   // 何も選んでいないときは、いつもの右クリックメニューのまま
    e.preventDefault();
    setSelBtn(null);
    setPopText('');
    setPop({ kind: 'menu', x: e.clientX, y: e.clientY, anchor });
  };
  const onBodyPointerUp = () => {
    if (!canAnchor) return;
    // 選び終わってから調べる
    window.setTimeout(() => {
      if (!aliveRef.current || popRefState.current?.kind === 'menu' || popRefState.current?.kind === 'compose') return;
      setSelBtn(currentAnchor());
    }, 0);
  };
  const onBodyOver = (e: React.MouseEvent) => {
    if (!canAnchor) return;
    const el = (e.target as HTMLElement).closest?.('[data-cmt]') as HTMLElement | null;
    if (!el) return;
    const p = popRefState.current;
    if (p && (p.kind !== 'thread' || p.pinned || popTextRef.current.trim())) return;
    window.clearTimeout(hideTimer.current);
    const rootId = el.dataset.cmt!;
    if (p?.kind === 'thread' && p.rootId === rootId) return;
    setPopText('');
    setPop({ kind: 'thread', rootId, rect: el.getBoundingClientRect(), pinned: false });
  };
  const onBodyOut = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest?.('[data-cmt]')) scheduleHide();
  };
  const onBodyClick = (e: React.MouseEvent) => {
    if (!canAnchor) return;
    const el = (e.target as HTMLElement).closest?.('[data-cmt]') as HTMLElement | null;
    if (!el) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;   // 文字を選んでいる最中は、開かない
    window.clearTimeout(hideTimer.current);
    if (popRefState.current?.kind !== 'thread' || popRefState.current.rootId !== el.dataset.cmt) setPopText('');
    setPop({ kind: 'thread', rootId: el.dataset.cmt!, rect: el.getBoundingClientRect(), pinned: true });
  };

  const copySelection = () => {
    const s = window.getSelection()?.toString() ?? '';
    const fallback = () => { try { document.execCommand('copy'); } catch { /* コピーできなくても、ほかの操作は続けられる */ } };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(s).catch(fallback); else fallback();
    closePop();
  };

  const border = d ? 'border-slate-700' : 'border-slate-200';
  const muted = d ? 'text-slate-400' : 'text-slate-500';
  const popCls = `z-[70] rounded-lg border shadow-xl text-sm ${d ? 'bg-[#1a2234] border-slate-600 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`;
  const inputCls = `flex-1 min-w-0 text-sm rounded-md border px-3 py-1.5 resize-none focus:outline-none focus:border-[#0193be] ${d ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder-slate-500' : 'bg-white border-slate-300 placeholder-slate-400'}`;
  const sendCls = 'shrink-0 text-sm px-3 py-1.5 rounded-md font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-40 whitespace-nowrap';

  /** コメント1件(名前・日時・本文・削除) */
  const item = (c: NoteComment, small = false) => {
    const canDelete = c.author === me.name || note.owner === me.name;
    return (
      <div>
        <div className="flex items-baseline gap-2">
          <span className={`${small ? 'text-xs' : 'text-sm'} font-bold`}>{c.author}</span>
          {c.author === note.owner && <span className={`text-[10px] px-1.5 rounded-full border ${border} ${muted}`}>作成者</span>}
          <span className={`text-xs ${muted}`}>{fmt(c.createdAt)}</span>
          <span className="flex-1" />
          {canDelete && (confirmId === c.id ? (
            <span className="text-xs whitespace-nowrap">
              <span className={muted}>削除しますか?</span>
              <button onClick={() => remove(c.id)} disabled={busy} className="ml-2 text-red-500 font-bold hover:underline disabled:opacity-50">削除する</button>
              <button onClick={() => setConfirmId(null)} disabled={busy} className={`ml-2 ${muted} hover:underline`}>やめる</button>
            </span>
          ) : (
            <button onClick={() => setConfirmId(c.id)} className={`text-xs ${muted} hover:text-red-500`}>削除</button>
          ))}
        </div>
        <div className={`${small ? 'text-[13px]' : 'text-sm'} whitespace-pre-wrap break-words mt-0.5`}>{c.body}</div>
      </div>
    );
  };

  const threadRoot = pop?.kind === 'thread' ? roots.find(c => c.id === pop.rootId) ?? null : null;
  const over = text.length > NOTE_COMMENT_MAX;

  return (
    <>
      <NoteCommentContext.Provider value={canAnchor ? bridge : null}>
        <div
          ref={bodyRef}
          onContextMenu={onBodyContextMenu}
          onMouseUp={onBodyPointerUp}
          onTouchEnd={onBodyPointerUp}
          onMouseOver={onBodyOver}
          onMouseOut={onBodyOut}
          onClick={onBodyClick}
        >
          {children}
        </div>
      </NoteCommentContext.Provider>

      {ready && (
        <section data-note-comments className={`px-5 py-3 border-t ${border}`}>
          <div className={`text-xs font-bold mb-2 ${muted}`}>
            <NoteIcon name="users" /> コメント{comments.length > 0 ? ` ${comments.length}件` : ''}
            {anchorsAvailable && <span className="ml-2 font-normal">本文の文字を選んで右クリックすると、その場所にコメントを付けられます</span>}
          </div>

          {roots.length > 0 && (
            <ul className="mb-3">
              {roots.map((c, i) => (
                <li key={c.id} className={`py-2 ${i > 0 ? `border-t ${border}` : ''}`}>
                  {c.anchorText && (
                    <div className={`text-xs mb-1 pl-2 border-l-2 ${d ? 'border-slate-600' : 'border-slate-300'} ${muted}`}>
                      <span className="note-cmt-mark" aria-hidden="true">▼</span>{clip(c.anchorText, 60)}<span className="note-cmt-mark" aria-hidden="true">▼</span>
                      {!resolvedIds.has(c.id) && <span className="ml-2 text-amber-600">元の箇所が見つかりません(本文が書き換えられました)</span>}
                    </div>
                  )}
                  {item(c)}
                  {repliesOf(c.id).length > 0 && (
                    <div className={`mt-2 ml-4 pl-3 border-l ${border} space-y-2`}>
                      {repliesOf(c.id).map(r => <div key={r.id}>{item(r, true)}</div>)}
                    </div>
                  )}
                  {anchorsAvailable && (replyTo === c.id ? (
                    <div className="mt-2 ml-4 flex items-end gap-2">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); sendReply(c.id, replyText, () => { setReplyTo(null); setReplyText(''); }); } }}
                        rows={1}
                        autoFocus
                        placeholder="返信を書く"
                        aria-label="返信を書く"
                        className={inputCls}
                      />
                      <button onClick={() => sendReply(c.id, replyText, () => { setReplyTo(null); setReplyText(''); })} disabled={busy || !replyText.trim() || replyText.length > NOTE_COMMENT_MAX} className={sendCls}>返信</button>
                      <button onClick={() => { setReplyTo(null); setReplyText(''); }} className={`shrink-0 text-xs ${muted} hover:underline`}>やめる</button>
                    </div>
                  ) : (
                    <button onClick={() => { setReplyTo(c.id); setReplyText(''); }} className={`mt-1 text-xs ${muted} hover:text-[#0193be]`}>返信する</button>
                  ))}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
              }}
              rows={text.includes('\n') || text.length > 60 ? 3 : 1}
              placeholder="ノート全体へのコメントを書く"
              aria-label="コメントを書く"
              className={inputCls}
            />
            <button
              onClick={send}
              disabled={busy || !text.trim() || over}
              title="コメントを送る(Ctrl + Enter でも送れます)"
              className={`${sendCls} !px-4`}
            >{busy ? '送信中…' : '送信'}</button>
          </div>
          {(over || error) && (
            <div className="mt-1 text-xs text-red-500">
              {over ? `コメントは${NOTE_COMMENT_MAX}文字までです(いま ${text.length}文字)` : error}
            </div>
          )}
        </section>
      )}

      {/* 文字を選んだときに出る「コメント」ボタン(右クリックできない端末でも付けられるように) */}
      {canAnchor && selBtn && !pop && createPortal(
        <button
          data-note-cmt-ui
          data-note-cmt-selbtn
          onMouseDown={e => e.preventDefault()}
          onClick={() => { setPopText(''); setPop({ kind: 'compose', anchor: selBtn }); setSelBtn(null); }}
          style={{ position: 'fixed', left: Math.max(8, Math.min(selBtn.rect.right - 40, window.innerWidth - 110)), top: Math.min(selBtn.rect.bottom + 6, window.innerHeight - 40) }}
          className="z-[70] text-xs font-bold px-2.5 py-1.5 rounded-full text-white bg-[#0193be] hover:bg-[#017a9c] shadow-lg whitespace-nowrap"
        >💬 コメント</button>,
        document.body
      )}

      {canAnchor && pop?.kind === 'menu' && createPortal(
        <div
          ref={popRef}
          data-note-cmt-menu
          style={{ position: 'fixed', left: Math.min(pop.x, window.innerWidth - 190), top: Math.min(pop.y, window.innerHeight - 90), width: 180 }}
          className={`${popCls} py-1`}
          onContextMenu={e => e.preventDefault()}
        >
          <button onMouseDown={e => e.preventDefault()} onClick={() => { setPopText(''); setPop({ kind: 'compose', anchor: pop.anchor }); }} className={`w-full text-left px-3 py-2 ${d ? 'hover:bg-slate-700/60' : 'hover:bg-slate-100'}`}>💬 コメントを追加</button>
          <button onMouseDown={e => e.preventDefault()} onClick={copySelection} className={`w-full text-left px-3 py-2 ${d ? 'hover:bg-slate-700/60' : 'hover:bg-slate-100'}`}>コピー</button>
        </div>,
        document.body
      )}

      {canAnchor && pop?.kind === 'compose' && createPortal(
        <div ref={popRef} data-note-cmt-compose style={popStyle(pop.anchor.rect)} className={`${popCls} p-3 flex flex-col gap-2`}>
          <div className={`text-xs pl-2 border-l-2 ${d ? 'border-slate-600' : 'border-slate-300'} ${muted}`}>
            <span className="note-cmt-mark" aria-hidden="true">▼</span>{clip(pop.anchor.text, 60)}<span className="note-cmt-mark" aria-hidden="true">▼</span>
          </div>
          {pop.anchor.text.length > COMMENT_ANCHOR_MAX ? (
            <div className="text-xs text-red-500">選ぶ範囲は{COMMENT_ANCHOR_MAX}文字までにしてください(いま {pop.anchor.text.length}文字)</div>
          ) : (
            <textarea
              value={popText}
              onChange={e => setPopText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); sendAnchored(pop.anchor); } }}
              rows={3}
              autoFocus
              placeholder="この場所へのコメントを書く"
              aria-label="この場所へのコメントを書く"
              className={inputCls}
            />
          )}
          {(popText.length > NOTE_COMMENT_MAX || error) && (
            <div className="text-xs text-red-500">{popText.length > NOTE_COMMENT_MAX ? `コメントは${NOTE_COMMENT_MAX}文字までです` : error}</div>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={closePop} className={`text-xs px-3 py-1.5 rounded-md border ${border} ${d ? 'hover:bg-slate-700/60' : 'hover:bg-slate-100'}`}>やめる</button>
            <button onClick={() => sendAnchored(pop.anchor)} disabled={busy || !popText.trim() || popText.length > NOTE_COMMENT_MAX || pop.anchor.text.length > COMMENT_ANCHOR_MAX} className={sendCls}>{busy ? '送信中…' : '送信'}</button>
          </div>
        </div>,
        document.body
      )}

      {canAnchor && pop?.kind === 'thread' && threadRoot && createPortal(
        <div
          ref={popRef}
          data-note-cmt-thread
          style={popStyle(pop.rect)}
          className={`${popCls} flex flex-col`}
          onMouseEnter={() => window.clearTimeout(hideTimer.current)}
          onMouseLeave={scheduleHide}
        >
          <div className="p-3 space-y-2 overflow-y-auto min-h-0">
            {item(threadRoot, true)}
            {repliesOf(threadRoot.id).map(r => (
              <div key={r.id} className={`pt-2 border-t ${border}`}>{item(r, true)}</div>
            ))}
          </div>
          <div className={`p-2 border-t ${border} flex items-end gap-2`}>
            <textarea
              value={popText}
              onChange={e => setPopText(e.target.value)}
              onFocus={() => setPop(p => (p?.kind === 'thread' ? { ...p, pinned: true } : p))}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); sendReply(threadRoot.id, popText, () => setPopText('')); } }}
              rows={1}
              placeholder="返信を書く"
              aria-label="返信を書く"
              className={inputCls}
            />
            <button onClick={() => sendReply(threadRoot.id, popText, () => setPopText(''))} disabled={busy || !popText.trim() || popText.length > NOTE_COMMENT_MAX} className={sendCls}>返信</button>
          </div>
          {error && <div className="px-3 pb-2 text-xs text-red-500">{error}</div>}
        </div>,
        document.body
      )}
    </>
  );
};

export default NoteComments;
