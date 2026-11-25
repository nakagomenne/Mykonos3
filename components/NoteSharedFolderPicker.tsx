// ============================================================
// 共有されたフォルダのうち、ふだんフォルダ欄に表示するものを選ぶ画面
//   - チェックを入れた/外した時点で、すぐ保存する(「保存」ボタンは無い)
//   - 選んだ内容は、選んだ本人のフォルダ欄にだけ効く
// ============================================================
import React from 'react';
import { createPortal } from 'react-dom';
import { NoteFolder } from '../types';
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
  shown: Set<string>;
  isDarkMode?: boolean;
  onToggle: (folderId: string, shown: boolean) => void;
  onClose: () => void;
}

const NoteSharedFolderPicker: React.FC<Props> = ({ entries, shown, isDarkMode = false, onToggle, onClose }) => {
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
        className={`${d ? 'bg-[#1a2234] text-slate-200' : 'bg-white text-slate-700'} rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`p-4 border-b ${border} flex items-center justify-between`}>
          <h2 className="text-lg font-bold"><NoteIcon name="folder" /> 表示する共有フォルダを選ぶ</h2>
          <button onClick={onClose} aria-label="閉じる" className="text-slate-400 hover:text-slate-600"><XMarkIcon className="w-6 h-6" /></button>
        </div>
        <div className={`px-4 pt-3 text-xs leading-relaxed ${muted}`}>
          チェックを入れたフォルダが、フォルダ欄の「共有フォルダ」に並びます。あなたの画面だけの設定で、ほかの人の表示は変わりません。
        </div>
        <div className="px-4 pt-2 flex items-center gap-2 text-xs">
          <span className={muted}>表示中 {shownCount} / {entries.length}</span>
          <span className="flex-1" />
          <button
            type="button"
            data-shared-folder-all
            onClick={() => entries.forEach(e => { if (shown.has(e.folder.id) === allShown) onToggle(e.folder.id, !allShown); })}
            className={`px-2.5 py-1 rounded-full border ${border} ${hover}`}
          >{allShown ? 'すべて外す' : 'すべて表示'}</button>
        </div>
        <div className="p-4 pt-2 overflow-y-auto space-y-3">
          {owners.map(owner => (
            <div key={owner}>
              <div className={`text-[11px] font-bold mb-1 ${muted}`}><NoteIcon name="user" /> {owner} さんのフォルダ</div>
              <div className={`rounded-lg border ${border} divide-y ${d ? 'divide-slate-700' : 'divide-slate-200'}`}>
                {entries.filter(e => e.folder.owner === owner).map(e => (
                  <label key={e.folder.id} className={`flex items-start gap-2.5 px-3 py-2 cursor-pointer ${hover}`}>
                    <input
                      type="checkbox"
                      data-shared-folder-check={e.folder.id}
                      checked={shown.has(e.folder.id)}
                      onChange={ev => onToggle(e.folder.id, ev.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0193be] focus:ring-[#0193be]"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">{e.folder.name}</span>
                      <span className={`block text-xs truncate ${muted}`}>
                        ノート {e.noteCount}件{e.childNames.length > 0 ? ` ・ サブフォルダ: ${e.childNames.join('、')}` : ''}
                      </span>
                    </span>
                  </label>
                ))}
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
