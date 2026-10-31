import React from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from './icons';

interface NoteConfirmDialogProps {
  isOpen: boolean;
  noteTitle: string;
  busy?: boolean;
  onCopyAndHide: () => void;
  onHide: () => void;
  onCancel: () => void;
}

/** 周知の「確認しました」: コピーして非表示 / コピーせず非表示 / キャンセル を選ぶダイアログ */
const NoteConfirmDialog: React.FC<NoteConfirmDialogProps> = ({ isOpen, noteTitle, busy = false, onCopyAndHide, onHide, onCancel }) => {
  if (!isOpen) return null;
  return createPortal(
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[60]"
      onClick={busy ? undefined : onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="周知の確認"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">この周知を確認済みにします</h2>
          <button onClick={onCancel} disabled={busy} className="text-slate-500 hover:text-slate-800 transition" aria-label="閉じる">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="p-5 text-slate-600 space-y-3 overflow-y-auto">
          <p className="text-sm">「{noteTitle || '(無題)'}」を確認済みにして、周知の一覧から非表示にします。</p>
          <p className="text-xs text-slate-500">非表示にした周知は、あとから「非表示の周知一覧」で見られます。</p>
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={onCopyAndHide}
              disabled={busy}
              className="w-full text-left rounded-lg border border-[#0193be] bg-[#0193be] text-white px-4 py-2.5 hover:bg-[#017a9a] disabled:opacity-50 transition"
            >
              <div className="font-bold text-sm">自分用にコピーして非表示</div>
              <div className="text-xs opacity-90">「自分のノート」にコピーを作り、周知は非表示にします</div>
            </button>
            <button
              onClick={onHide}
              disabled={busy}
              className="w-full text-left rounded-lg border border-slate-300 bg-white text-slate-700 px-4 py-2.5 hover:bg-slate-50 disabled:opacity-50 transition"
            >
              <div className="font-bold text-sm">コピーせず非表示</div>
              <div className="text-xs text-slate-500">コピーは作らず、周知だけ非表示にします</div>
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
