import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from './icons';
import { NoteIcon } from './NoteIcons';

interface NoteConfirmDialogProps {
  isOpen: boolean;
  noteTitle: string;
  busy?: boolean;
  /** 失敗したときのメッセージ(ダイアログ内に表示する) */
  error?: string | null;
  /** 自分のフォルダ(入れ先の候補)。空、または onPlaceAndHide が無いときは「自分のフォルダに入れて非表示」を出さない */
  folders?: { id: string; name: string; depth: number }[];
  /** 原本を自分のフォルダに入れて、非表示にする */
  onPlaceAndHide?: (folderId: string) => void;
  onCopyAndHide: () => void;
  onHide: () => void;
  onCancel: () => void;
}

/** アナウンスの「確認しました」: 自分のフォルダに入れて非表示 / コピーして非表示 / コピーせず非表示 / キャンセル を選ぶダイアログ */
const NoteConfirmDialog: React.FC<NoteConfirmDialogProps> = ({ isOpen, noteTitle, busy = false, error = null, folders = [], onPlaceAndHide, onCopyAndHide, onHide, onCancel }) => {
  const [folderId, setFolderId] = useState('');
  // 開くたびに、入れ先は選び直す
  useEffect(() => { if (isOpen) setFolderId(''); }, [isOpen]);
  if (!isOpen) return null;
  const canPlace = !!onPlaceAndHide && folders.length > 0;
  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]"
      onClick={busy ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="アナウンスの確認"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">このアナウンスを確認済みにします</h2>
          <button onClick={onCancel} disabled={busy} className="text-slate-500 hover:text-slate-800 transition" aria-label="閉じる">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="p-5 text-slate-600 space-y-3 overflow-y-auto">
          <p className="text-sm">「{noteTitle || '(無題)'}」を確認済みにして、アナウンスの一覧から非表示にします。</p>
          <p className="text-xs text-slate-500">非表示にしたアナウンスは、あとから「アナウンス(お知らせ)」一覧の一番下の「非表示のアナウンス」バーから見られます。</p>
          {error && (
            <div role="alert" className="text-sm rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2"><NoteIcon name="warning" /> {error}</div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            {canPlace && (
              <div data-confirm-place className="w-full rounded-lg border border-[#0193be] bg-[#0193be] text-white px-4 py-2.5">
                <div className="font-bold text-sm">自分のフォルダに入れて非表示</div>
                <div className="text-xs opacity-90">原本をそのまま自分のフォルダに入れ、アナウンスは非表示にします(内容はいつも最新です)</div>
                <div className="mt-2 flex items-center gap-2">
                  <select
                    value={folderId}
                    onChange={e => setFolderId(e.target.value)}
                    disabled={busy}
                    aria-label="入れるフォルダ"
                    className="flex-1 min-w-0 text-sm rounded-md border border-white/60 bg-white text-slate-700 px-2 py-1.5 focus:outline-none"
                  >
                    <option value="">フォルダを選ぶ…</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.depth ? '　└ ' : ''}{f.name}</option>)}
                  </select>
                  <button
                    onClick={() => { if (folderId) onPlaceAndHide!(folderId); }}
                    disabled={busy || !folderId}
                    className="shrink-0 text-sm font-bold rounded-md bg-white text-[#0193be] px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50 transition"
                  >入れる</button>
                </div>
              </div>
            )}
            <button
              onClick={onCopyAndHide}
              disabled={busy}
              className={canPlace
                ? 'w-full text-left rounded-lg border border-slate-300 bg-white text-slate-700 px-4 py-2.5 hover:bg-slate-50 disabled:opacity-50 transition'
                : 'w-full text-left rounded-lg border border-[#0193be] bg-[#0193be] text-white px-4 py-2.5 hover:bg-[#017a9a] disabled:opacity-50 transition'}
            >
              <div className="font-bold text-sm">自分用にコピーして非表示</div>
              <div className={`text-xs ${canPlace ? 'text-slate-500' : 'opacity-90'}`}>「自分のノート」にコピーを作り、アナウンスは非表示にします</div>
            </button>
            <button
              onClick={onHide}
              disabled={busy}
              className="w-full text-left rounded-lg border border-slate-300 bg-white text-slate-700 px-4 py-2.5 hover:bg-slate-50 disabled:opacity-50 transition"
            >
              <div className="font-bold text-sm">コピーせず非表示</div>
              <div className="text-xs text-slate-500">コピーは作らず、アナウンスだけ非表示にします</div>
            </button>
          </div>
        </div>
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end">
          <button
            onClick={onCancel}
            disabled={busy}
            className="bg-white text-slate-700 border border-slate-300 font-bold py-2 px-5 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition"
          >キャンセル</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NoteConfirmDialog;
