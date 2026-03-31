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

  // ボタンサイズ・列数・余白
  const COLS = 10;
  const BTN = 40;   // px（ボタン1つ）
  const GAP = 4;    // gap-1 相当
  const PAD = 12;   // p-3 相当（左右各）
  const PICKER_W = COLS * BTN + (COLS - 1) * GAP + PAD * 2; // ≈ 492px

  // 行数から高さを計算（クリアボタン行 + グリッド行）
  const ROWS = Math.ceil(EMOJI_OPTIONS.length / COLS);
  const GRID_H = ROWS * BTN + (ROWS - 1) * GAP;
  const CLEAR_ROW_H = 32;
  const PICKER_H = CLEAR_ROW_H + GAP + GRID_H + PAD * 2;

  const MARGIN = 8;
  let top = anchorRect.bottom + GAP;
  let left = anchorRect.left;

  // 右端チェック
  if (left + PICKER_W > window.innerWidth - MARGIN) left = window.innerWidth - PICKER_W - MARGIN;
  if (left < MARGIN) left = MARGIN;
  // 下端チェック：下に収まらない場合は上に表示
  if (top + PICKER_H > window.innerHeight - MARGIN) top = anchorRect.top - PICKER_H - GAP;
  // 上にも収まらない場合は画面上端に固定
  if (top < MARGIN) top = MARGIN;

  const bg = isDarkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800';

  return createPortal(
    <div
      ref={pickerRef}
      className={`fixed z-[9999] rounded-xl shadow-2xl border p-3 ${bg}`}
      style={{ top, left, width: PICKER_W }}
      onClick={e => e.stopPropagation()}
    >
      {/* クリアボタン */}
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => { onChange(''); onClose(); }}
          className={`text-xs px-3 py-1 rounded border ${isDarkMode ? 'border-slate-500 hover:bg-slate-700' : 'border-slate-300 hover:bg-slate-100'} transition`}
        >
          クリア
        </button>
        {value && (
          <span className="text-xl leading-none">{value}</span>
        )}
      </div>
      {/* 絵文字グリッド */}
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
      >
        {EMOJI_OPTIONS.map(em => (
          <button
            key={em}
            onClick={() => { onChange(em); onClose(); }}
            className={`text-xl w-10 h-10 flex items-center justify-center rounded-lg transition leading-none
              ${value === em
                ? (isDarkMode ? 'bg-slate-600 ring-2 ring-blue-400' : 'bg-blue-100 ring-2 ring-blue-400')
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
