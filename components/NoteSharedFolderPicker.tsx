// ============================================================
// 共有されたフォルダを、フォルダ欄のどこに表示するかを選ぶ画面
//   - フォルダごとに「表示しない / シェアノート / マイノート」から選ぶ
//   - 選んだ時点で、すぐ保存する(「保存」ボタンは無い)
//   - 選んだ内容は、選んだ本人のフォルダ欄にだけ効く
// ============================================================
import React from 'react';
import { createPortal } from 'react-dom';
import { NoteFolder } from '../types';
import type { SharedFolderPlace } from '../services/notesService';
import { XMarkIcon } from './icons';
import { NoteIcon } from './NoteIcons';

export interface SharedFolderEntry {
  folder: NoteFolder;
  /** 一緒に表示されるサブフォルダの名前 */
  childNames: string[];
  /** 自分が見られるノートの数(サブフォルダの分も含む) */
  noteCount: number;
}

interface Props {
  entries: SharedFolderEntry[];
  /** 表示しているフォルダと、その置き場所(入っていないフォルダは、表示しない) */
  shown: Map<string, SharedFolderPlace>;
  isDarkMode?: boolean;
  /** place が null なら、表示しない */
  onChange: (folderId: string, place: SharedFolderPlace | null) => void;
  onClose: () => void;
}

const CHOICES: { value: SharedFolderPlace | null; label: string; title: string }[] = [
  { value: null, label: '表示しない', title: 'フォルダ欄に出しません' },
  { value: 'shared', label: 'シェアノート', title: '「シェアノート」の「共有されたノート」の下に並べます' },
  { value: 'mine', label: 'マイノート', title: '「マイノート」の、自分のフォルダの並びの下に並べます' },
];

const NoteSharedFolderPicker: React.FC<Props> = ({ entries, shown, isDarkMode = false, onChange, onClose }) => {
  const d = isDarkMode;
  const border = d ? 'border-slate-700' : 'border-slate-200';
  const muted = d ? 'text-slate-400' : 'text-slate-500';
  const hover = d ? 'hover:bg-slate-700/60' : 'hover:bg-slate-100';

  // 共有してくれた人ごとにまとめる
  const owners = [...new Set(entries.map(e => e.folder.owner))].sort((a, b) => a.localeCompare(b, 'ja'));
  const shownCount = entries.filter(e => shown.has(e.folder.id)).length;
  const allShown = entries.length > 0 && shownCount === entries.length;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[90]" onClick={onClose}>
      <div
        data-shared-folder-picker
        className={`${d ? 'bg-[#1a2234] text-slate-200' : 'bg-white text-slate-700'} rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`p-4 border-b ${border} flex items-center justify-between`}>
          <h2 className="text-lg font-bold"><NoteIcon name="folder-open" /> 共有フォルダの表示</h2>
          <button onClick={onClose} aria-label="閉じる" className="text-slate-400 hover:text-slate-600"><XMarkIcon className="w-6 h-6" /></button>
        </div>
        <div className={`px-4 pt-3 text-xs leading-relaxed ${muted}`}>
          フォルダごとに、フォルダ欄のどこに並べるかを選びます。あなたの画面だけの設定で、ほかの人の表示は変わりません。
        </div>
        <div className="px-4 pt-2 flex items-center gap-2 text-xs">
          <span className={muted}>表示中 {shownCount} / {entries.length}</span>
          <span className="flex-1" />
          <button
            type="button"
            data-shared-folder-all
            title={allShown ? 'すべてのフォルダを、表示しないにします' : 'まだ表示していないフォルダを、シェアノートに並べます'}
            onClick={() => entries.forEach(e => {
              if (allShown) onChange(e.folder.id, null);
              else if (!shown.has(e.folder.id)) onChange(e.folder.id, 'shared');
            })}
            className={`px-2.5 py-1 rounded-full border ${border} ${hover}`}
          >{allShown ? 'すべて外す' : 'すべて表示'}</button>
        </div>
        <div className="p-4 pt-2 overflow-y-auto space-y-3">
          {owners.map(owner => (
            <div key={owner}>
              <div className={`text-[11px] font-bold mb-1 ${muted}`}><NoteIcon name="user" /> {owner} さんのフォルダ</div>
              <div className={`rounded-lg border ${border} divide-y ${d ? 'divide-slate-700' : 'divide-slate-200'}`}>
                {entries.filter(e => e.folder.owner === owner).map(e => {
                  const current = shown.get(e.folder.id) ?? null;
                  return (
                    <div key={e.folder.id} data-shared-folder-row={e.folder.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
                      <span className="flex-1 min-w-[8rem]">
                        <span className="block text-sm font-semibold truncate">{e.folder.name}</span>
                        <span className={`block text-xs truncate ${muted}`}>
                          ノート {e.noteCount}件{e.childNames.length > 0 ? ` ・ サブフォルダ: ${e.childNames.join('、')}` : ''}
                        </span>
                      </span>
                      <span role="group" aria-label={`「${e.folder.name}」の表示場所`} className={`inline-flex rounded-lg border ${border} overflow-hidden text-xs flex-shrink-0`}>
                        {CHOICES.map((c, i) => {
                          const on = current === c.value;
                          return (
                            <button
                              key={c.label}
                              type="button"
                              data-shared-folder-place={c.value ?? 'none'}
                              aria-pressed={on}
                              title={c.title}
                              onClick={() => { if (!on) onChange(e.folder.id, c.value); }}
                              className={`px-2.5 py-1.5 whitespace-nowrap transition ${i > 0 ? `border-l ${border}` : ''} ${
                                on
                                  ? (c.value === null ? (d ? 'bg-slate-600 text-white font-bold' : 'bg-slate-200 text-slate-700 font-bold') : 'bg-[#0193be] text-white font-bold')
                                  : hover}`}
                            >{c.label}</button>
                          );
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {entries.length === 0 && <div className={`text-sm ${muted}`}>共有されているフォルダは、まだありません。</div>}
        </div>
        <div className={`p-3 border-t ${border} flex justify-end`}>
          <button onClick={onClose} className="px-5 py-2 rounded-lg bg-[#0193be] text-white text-sm font-bold">閉じる</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NoteSharedFolderPicker;
