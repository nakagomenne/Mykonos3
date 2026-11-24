import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Note, User } from '../types';
import {
  NoteComment, NOTE_COMMENT_MAX, NoteCommentsUnavailableError,
  fetchNoteComments, addNoteComment, deleteNoteComment, subscribeToNoteComments,
} from '../services/notesService';
import { NoteIcon } from './NoteIcons';

interface NoteCommentsProps {
  note: Note;
  me: User;
  isDarkMode?: boolean;
}

const fmt = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getMonth() + 1}/${dt.getDate()} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
};

/**
 * ノートの下に出すコメント欄。ノートを見られる人なら、だれでも書ける。
 * 消せるのは、書いた本人と、ノートを作った人。
 * コメント用のテーブルがまだ無い(SQL 未実行)ときは、何も出さない
 */
const NoteComments: React.FC<NoteCommentsProps> = ({ note, me, isDarkMode = false }) => {
  const d = isDarkMode;
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [available, setAvailable] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** 「削除」を1回押したコメント(もう一度押すと消す) */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

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

  useEffect(() => { void load(); }, [load]);

  // ほかの人のコメント・削除を、その場で反映する
  useEffect(() => {
    if (!available) return;
    let timer: number | undefined;
    const unsubscribe = subscribeToNoteComments((event, row) => {
      // 削除は、どのノートのコメントか分からないことがあるので、取り直して確かめる
      if (event !== 'DELETE' && row?.note_id !== note.id) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void load(); }, 300);
    });
    return () => { window.clearTimeout(timer); unsubscribe(); };
  }, [available, note.id, load]);

  if (!available || !loaded) return null;

  const trimmed = text.trim();
  const over = text.length > NOTE_COMMENT_MAX;
  const canSend = !!trimmed && !over && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError('');
    try {
      const created = await addNoteComment(note.id, me.name, trimmed);
      if (!aliveRef.current) return;
      setComments(prev => (prev.some(c => c.id === created.id) ? prev : [...prev, created]));
      setText('');
    } catch (e: any) {
      if (aliveRef.current) setError(e?.message ?? 'コメントを送れませんでした');
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await deleteNoteComment(id);
      if (!aliveRef.current) return;
      setComments(prev => prev.filter(c => c.id !== id));
    } catch (e: any) {
      if (aliveRef.current) setError(e?.message ?? 'コメントを削除できませんでした');
    } finally {
      if (aliveRef.current) { setBusy(false); setConfirmId(null); }
    }
  };

  const border = d ? 'border-slate-700' : 'border-slate-200';
  const muted = d ? 'text-slate-400' : 'text-slate-500';

  return (
    <section data-note-comments className={`px-5 py-3 border-t ${border}`}>
      <div className={`text-xs font-bold mb-2 ${muted}`}>
        <NoteIcon name="users" /> コメント{comments.length > 0 ? ` ${comments.length}件` : ''}
      </div>

      {comments.length > 0 && (
        <ul className="mb-3">
          {comments.map((c, i) => {
            const canDelete = c.author === me.name || note.owner === me.name;
            return (
              <li key={c.id} className={`py-2 ${i > 0 ? `border-t ${border}` : ''}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold">{c.author}</span>
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
                <div className="text-sm whitespace-pre-wrap break-words mt-0.5">{c.body}</div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
          }}
          rows={text.includes('\n') || text.length > 60 ? 3 : 1}
          placeholder="コメントを書く"
          aria-label="コメントを書く"
          className={`flex-1 min-w-0 text-sm rounded-md border px-3 py-1.5 resize-none focus:outline-none focus:border-[#0193be] ${d ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder-slate-500' : 'bg-white border-slate-300 placeholder-slate-400'}`}
        />
        <button
          onClick={() => void send()}
          disabled={!canSend}
          title="コメントを送る(Ctrl + Enter でも送れます)"
          className="shrink-0 text-sm px-4 py-1.5 rounded-md font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-40 whitespace-nowrap"
        >{busy ? '送信中…' : '送信'}</button>
      </div>
      {(over || error) && (
        <div className="mt-1 text-xs text-red-500">
          {over ? `コメントは${NOTE_COMMENT_MAX}文字までです(いま ${text.length}文字)` : error}
        </div>
      )}
    </section>
  );
};

export default NoteComments;
