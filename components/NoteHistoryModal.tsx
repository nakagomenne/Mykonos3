import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Note, NoteVersion } from '../types';
import { fetchNoteVersions, NOTE_VERSION_LIMIT } from '../services/notesService';
import NoteEditor from './NoteEditor';
import { NoteIcon } from './NoteIcons';
import { XMarkIcon } from './icons';

interface NoteHistoryModalProps {
  note: Note;
  isDarkMode?: boolean;
  /** 選んだ版の内容でノートを書き換える(今の内容は履歴に残る) */
  onRestore: (version: NoteVersion) => Promise<void>;
  onClose: () => void;
}

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** ノートの編集履歴を見て、前の版に戻すためのダイアログ */
const NoteHistoryModal: React.FC<NoteHistoryModalProps> = ({ note, isDarkMode = false, onRestore, onClose }) => {
  const d = isDarkMode;
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchNoteVersions(note.id)
      .then(v => { if (!cancelled) { setVersions(v); setSelectedId(v[0]?.id ?? null); } })
      .catch((e: any) => { if (!cancelled) { setVersions([]); setError(e?.message ?? '履歴の取得に失敗しました'); } });
    return () => { cancelled = true; };
  }, [note.id]);

  const selected = versions?.find(v => v.id === selectedId) ?? null;
  const border = d ? 'border-slate-700' : 'border-slate-200';
  const muted = d ? 'text-slate-400' : 'text-slate-500';
  const hoverRow = d ? 'hover:bg-slate-700/60' : 'hover:bg-slate-100';

  const restore = async () => {
    if (!selected) return;
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
                {error ? '履歴を表示できません。' : '履歴はまだありません。このノートを編集して「保存」するたびに、保存前の内容がここに残ります。'}
              </div>
            ) : versions.map(v => (
              <button
                key={v.id}
                onClick={() => { setSelectedId(v.id); setConfirming(false); }}
                className={`w-full text-left px-3 py-2 border-b ${border} text-sm transition ${v.id === selectedId ? (d ? 'bg-[#0193be]/25' : 'bg-[#0193be]/10 font-semibold') : hoverRow}`}
              >
                <div>{fmt(v.editedAt)}</div>
                <div className={`text-xs ${muted}`}><NoteIcon name="user" /> {v.editedBy || '不明'}</div>
              </button>
            ))}
          </div>

          {/* 選んだ版の内容 */}
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 space-y-3">
            {selected ? (
              <>
                <div className={`text-xs ${muted}`}>{fmt(selected.editedAt)} に {selected.editedBy || '不明'} さんが保存した内容</div>
                <div className={`rounded-lg border ${border} ${d ? 'bg-[#141b2b]' : 'bg-slate-50'} px-3 py-2 text-xl font-bold`}>{selected.title || '(無題)'}</div>
                <div className={`rounded-lg border ${border} ${d ? 'bg-[#141b2b]' : 'bg-slate-50'} p-4 min-h-[8rem]`}>
                  {selected.body
                    ? <NoteEditor key={selected.id} value={selected.body} editable={false} isDarkMode={d} />
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
              : `新しいものから${NOTE_VERSION_LIMIT}件まで残ります。`}
          </span>
          {confirming ? (
            <>
              <button onClick={() => setConfirming(false)} disabled={busy} className={`px-4 py-2 rounded-md text-sm border ${border} ${hoverRow} disabled:opacity-50`}>やめる</button>
              <button onClick={restore} disabled={busy} className="px-5 py-2 rounded-md text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50">{busy ? '戻しています…' : 'この版に戻す'}</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className={`px-4 py-2 rounded-md text-sm border ${border} ${hoverRow}`}>閉じる</button>
              <button onClick={() => setConfirming(true)} disabled={!selected} className="px-5 py-2 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50">この版に戻す…</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NoteHistoryModal;
