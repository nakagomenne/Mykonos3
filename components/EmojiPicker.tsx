import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EMOJI_OPTIONS } from '../constants';

interface EmojiPickerProps {
  /** 現在選択中の絵文字（空文字=未選択） */
  value: string;
  onChange: (emoji: string) => void;
  onClose: () => void;
  /** ピッカーを表示する基準となる要素の DOMRect */
  anchorRect: DOMRect;
  isDarkMode?: boolean;
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({ value, onChange, onClose, anchorRect, isDarkMode = false }) => {
  const pickerRef = useRef<HTMLDivElement>(null);

  // クリック外・Escape で閉じる
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  // ウィンドウ端にはみ出さないよう位置を調整
  const PICKER_W = 256;
  const PICKER_H = 200;
  const GAP = 4;
  let top = anchorRect.bottom + GAP;
  let left = anchorRect.left;

  if (left + PICKER_W > window.innerWidth - 8) left = window.innerWidth - PICKER_W - 8;
  if (left < 8) left = 8;
  if (top + PICKER_H > window.innerHeight - 8) top = anchorRect.top - PICKER_H - GAP;

  const bg = isDarkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800';

  return createPortal(
    <div
      ref={pickerRef}
      className={`fixed z-[9999] rounded-lg shadow-xl border p-2 ${bg}`}
      style={{ top, left, width: PICKER_W }}
      onClick={e => e.stopPropagation()}
    >
      {/* クリアボタン */}
      <div className="mb-1.5 flex items-center gap-1">
        <button
          onClick={() => { onChange(''); onClose(); }}
          className={`text-xs px-2 py-0.5 rounded border ${isDarkMode ? 'border-slate-500 hover:bg-slate-700' : 'border-slate-300 hover:bg-slate-100'} transition`}
        >
          クリア
        </button>
        {value && (
          <span className="text-base leading-none">{value}</span>
        )}
      </div>
      {/* 絵文字グリッド */}
      <div className="grid grid-cols-8 gap-0.5 max-h-40 overflow-y-auto">
        {EMOJI_OPTIONS.map(em => (
          <button
            key={em}
            onClick={() => { onChange(em); onClose(); }}
            className={`text-lg w-7 h-7 flex items-center justify-center rounded transition leading-none
              ${value === em
                ? (isDarkMode ? 'bg-slate-600 ring-1 ring-blue-400' : 'bg-blue-100 ring-1 ring-blue-400')
                : (isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100')
              }`}
            title={em}
          >
            {em}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
};

export default EmojiPicker;
