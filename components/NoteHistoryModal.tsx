import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Note, NoteVersion } from '../types';
import { fetchNoteVersions, NOTE_VERSION_LIMIT } from '../services/notesService';
import NoteEditor from './NoteEditor';
import { highlightNoteChanges, NOTE_DIFF_COLOR } from './noteDiff';
import { NoteIcon } from './NoteIcons';
import { XMarkIcon } from './icons';

interface NoteHistoryModalProps {
  note: Note;
  isDarkMode?: boolean;
  /** 前の版に戻せるか(ノートを編集できる人だけ)。false のときは、見るだけ */
  canRestore?: boolean;
  /** 選んだ版の内容でノートを書き換える(今の内容は履歴に残る) */
  onRestore: (version: NoteVersion) => Promise<void>;
  onClose: () => void;
}

/** 一覧の先頭に出す「今の内容」の印(履歴の版ではないので、戻す対象にはならない) */
const CURRENT_ID = '__current__';

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** ノートの編集履歴を見て、前の版に戻すためのダイアログ */
const NoteHistoryModal: React.FC<NoteHistoryModalProps> = ({ note, isDarkMode = false, canRestore = true, onRestore, onClose }) => {
  const d = isDarkMode;
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  /** 1つ前の版から変わった文字に色をつけるか */
  const [showDiff, setShowDiff] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchNoteVersions(note.id)
      .then(v => { if (!cancelled) { setVersions(v); setSelectedId(v.length > 0 ? CURRENT_ID : null); } })
      .catch((e: any) => { if (!cancelled) { setVersions([]); setError(e?.message ?? '履歴の取得に失敗しました'); } });
    return () => { cancelled = true; };
  }, [note.id]);

  /** 一覧に並べるもの: 今の内容 + 履歴の版(新しい順)。それぞれ、1つ下(1つ前)と見比べる */
  const entries = useMemo<NoteVersion[]>(() => {
    if (!versions || versions.length === 0) return [];
    const current: NoteVersion = {
      id: CURRENT_ID, noteId: note.id, title: note.title, body: note.body,
      editedBy: note.updatedBy ?? note.owner, editedAt: note.updatedAt,
    };
    return [current, ...versions];
  }, [versions, note]);
  const selectedIndex = entries.findIndex(v => v.id === selectedId);
  const selected = selectedIndex >= 0 ? entries[selectedIndex] : null;
  const isCurrent = selected?.id === CURRENT_ID;
  /** 見比べる相手(1つ前の版)。いちばん古い版には無い */
  const baseline = selectedIndex >= 0 ? entries[selectedIndex + 1] ?? null : null;
  const diff = useMemo(
    () => (selected && baseline && showDiff ? highlightNoteChanges(baseline.body, selected.body) : null),
    [selected, baseline, showDiff]);
  const titleChanged = !!selected && !!baseline && selected.title !== baseline.title;
  const border = d ? 'border-slate-700' : 'border-slate-200';
  const muted = d ? 'text-slate-400' : 'text-slate-500';
  const hoverRow = d ? 'hover:bg-slate-700/60' : 'hover:bg-slate-100';

  const restore = async () => {
    if (!canRestore || !selected || isCurrent) return;
    setBusy(true);
    setError(null);
    try {
      await onRestore(selected);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? '前の版に戻せませんでした');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[90]" onClick={onClose}>
      <div
        className={`${d ? 'bg-[#1a2234] text-slate-200' : 'bg-white text-slate-700'} rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`p-4 border-b ${border} flex items-center justify-between gap-2`}>
          <h2 className="text-lg font-bold truncate"><NoteIcon name="clock" /> 編集履歴<span className={`ml-2 text-sm font-normal ${muted}`}>「{note.title || '(無題)'}」</span></h2>
          <button onClick={onClose} aria-label="閉じる"><XMarkIcon className="w-6 h-6" /></button>
        </div>

        {error && (
          <div className="px-4 py-2 text-sm bg-red-50 text-red-700 border-b border-red-200"><NoteIcon name="warning" /> {error}</div>
        )}

        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* 版の一覧 */}
          <div className={`md:w-64 flex-shrink-0 max-h-40 md:max-h-none overflow-y-auto border-b md:border-b-0 md:border-r ${border}`}>
            {versions === null ? (
              <div className={`p-4 text-sm ${muted}`}>読み込み中…</div>
            ) : versions.length === 0 ? (
              <div className={`p-4 text-sm leading-relaxed ${muted}`}>
                {error ? '履歴を表示できません。' : '履歴はまだありません。このノートが編集されて「保存」されるたびに、保存前の内容がここに残ります。'}
              </div>
            ) : entries.map(v => (
              <button
                key={v.id}
                onClick={() => { setSelectedId(v.id); setConfirming(false); }}
                className={`w-full text-left px-3 py-2 border-b ${border} text-sm transition ${v.id === selectedId ? (d ? 'bg-[#0193be]/25' : 'bg-[#0193be]/10 font-semibold') : hoverRow}`}
              >
                <div>{v.id === CURRENT_ID ? <><span className="font-bold">今の内容</span><span className={`ml-1.5 text-xs ${muted}`}>{fmt(v.editedAt)}</span></> : fmt(v.editedAt)}</div>
                <div className={`text-xs ${muted}`}><NoteIcon name="user" /> {v.editedBy || '不明'}</div>
              </button>
            ))}
          </div>

          {/* 選んだ版の内容 */}
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 space-y-3">
            {selected ? (
              <>
                <div className={`text-xs ${muted}`}>{fmt(selected.editedAt)} に {selected.editedBy || '不明'} さんが保存した内容{isCurrent ? '(今のノート)' : ''}</div>
                <div data-note-diff-info className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${muted}`}>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={showDiff} onChange={e => setShowDiff(e.target.checked)} className="w-3.5 h-3.5 accent-[#0193be]" />
                    変更されたところに色をつける
                  </label>
                  {showDiff && (!baseline ? (
                    <span>これより前の版が残っていないため、変更されたところは表示できません</span>
                  ) : diff && (diff.added > 0 || diff.removed > 0 || diff.codeChanged || titleChanged) ? (
                    <span>
                      <span className="px-1 rounded-sm" style={{ backgroundColor: NOTE_DIFF_COLOR, color: '#1e293b' }}>この色</span>
                      {' '}= 1つ前の版から追加・変更された文字({diff.added}文字){diff.removed > 0 ? ` / 削除された文字: ${diff.removed}文字` : ''}{diff.codeChanged ? ' / コードの枠の中にも変更があります(色はつきません)' : ''}
                    </span>
                  ) : (
                    <span>1つ前の版から、文字の変更はありません(書式・画像・添付だけの変更かもしれません)</span>
                  ))}
                </div>
                <div
                  className={`rounded-lg border ${border} ${d ? 'bg-[#141b2b]' : 'bg-slate-50'} px-3 py-2 text-xl font-bold`}
                >
                  <span data-note-diff-title style={showDiff && titleChanged ? { backgroundColor: NOTE_DIFF_COLOR, color: '#1e293b' } : undefined} className={showDiff && titleChanged ? 'px-1 rounded-sm' : ''}>{selected.title || '(無題)'}</span>
                  {showDiff && titleChanged && baseline && (
                    <div className={`mt-1 text-xs font-normal ${muted}`}>前のタイトル: {baseline.title || '(無題)'}</div>
                  )}
                </div>
                <div className={`rounded-lg border ${border} ${d ? 'bg-[#141b2b]' : 'bg-slate-50'} p-4 min-h-[8rem]`}>
                  {selected.body
                    ? <NoteEditor key={`${selected.id}:${diff ? 'd' : 'p'}`} value={diff ? diff.html : selected.body} editable={false} isDarkMode={d} />
                    : <div className={`text-sm ${muted}`}>(本文なし)</div>}
                </div>
              </>
            ) : versions && versions.length > 0 ? (
              <div className={`text-sm ${muted}`}>左の一覧から、見たい版を選んでください。</div>
            ) : null}
          </div>
        </div>

        <div className={`p-3 border-t ${border} flex flex-wrap items-center justify-end gap-2`}>
          <span className={`flex-1 min-w-[200px] text-xs ${muted}`}>
            {confirming
              ? 'この版の内容でノートを書き換えます。今の内容は履歴に残るので、あとでまた戻せます。'
              : `新しいものから${NOTE_VERSION_LIMIT}件まで残ります。${canRestore ? '' : '(前の版に戻せるのは、このノートを編集できる人だけです)'}`}
          </span>
          {confirming ? (
            <>
              <button onClick={() => setConfirming(false)} disabled={busy} className={`px-4 py-2 rounded-md text-sm border ${border} ${hoverRow} disabled:opacity-50`}>やめる</button>
              <button onClick={restore} disabled={busy} className="px-5 py-2 rounded-md text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50">{busy ? '戻しています…' : 'この版に戻す'}</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className={`px-4 py-2 rounded-md text-sm border ${border} ${hoverRow}`}>閉じる</button>
              {canRestore && <button data-note-history-restore onClick={() => setConfirming(true)} disabled={!selected || isCurrent} title={isCurrent ? '今の内容です。戻したい版を左から選んでください' : undefined} className="px-5 py-2 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50">この版に戻す…</button>}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NoteHistoryModal;
