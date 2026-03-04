import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Rank } from '../types';
import { RANK_STYLES } from '../constants';

interface RankSelectorProps {
  value: Rank | '';
  options: Rank[];
  onChange: (rank: Rank) => void;
  required?: boolean;
  label?: string;
  mainColorClassLight?: string;
}

const RankSelector: React.FC<RankSelectorProps> = ({
  value,
  options,
  onChange,
  required = false,
  label,
  mainColorClassLight = 'text-[#0193be]/80',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 外クリックで閉じる
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const selectedStyle = value
    ? (RANK_STYLES[value as Rank] || { backgroundColor: '#f1f5f9', color: '#1e293b' })
    : { backgroundColor: '#f1f5f9', color: '#94a3b8' };

  const handleButtonClick = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dropdownHeight = Math.min(options.length * 36 + 16, 280);
      let top = rect.bottom + 4;
      if (top + dropdownHeight > window.innerHeight) {
        top = rect.top - dropdownHeight - 4;
      }
      if (top < 4) top = 4;
      let left = rect.left;
      const width = Math.max(rect.width, 120);
      if (left + width > window.innerWidth) {
        left = window.innerWidth - width - 8;
      }
      setDropdownPosition({ top, left, width });
    }
    setIsOpen(prev => !prev);
  };

  return (
    <div>
      {label && (
        <label className={`block text-sm font-medium ${mainColorClassLight} mb-1`}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {/* hidden input for form required validation */}
      {required && <input type="hidden" value={value} required={required} />}
      <button
        ref={buttonRef}
        type="button"
        onClick={handleButtonClick}
        style={{
          backgroundColor: selectedStyle.backgroundColor,
          color: selectedStyle.color,
          border: (selectedStyle as any).border || '1px solid transparent',
        }}
        className="w-full text-center px-3 py-2 text-sm font-bold rounded-md shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#0193be] focus:ring-offset-1"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        {value || '--'}
      </button>

      {isOpen && dropdownPosition && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[200] bg-white rounded-md shadow-xl border border-slate-200 max-h-72 overflow-auto animate-wipe-in-down"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
            minWidth: '120px',
          }}
        >
          <ul className="p-1.5 space-y-1" role="listbox">
            {options.map(opt => {
              const style = RANK_STYLES[opt] || { backgroundColor: '#f1f5f9', color: '#1e293b' };
              return (
                <li key={opt} role="option" aria-selected={value === opt}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    style={{
                      backgroundColor: style.backgroundColor,
                      color: style.color,
                      border: (style as any).border || '1px solid transparent',
                    }}
                    className={`w-full text-center px-2 py-1.5 text-xs font-bold rounded-md transition-transform duration-150 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-1 ring-blue-400 ${value === opt ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`}
                  >
                    {opt}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body
      )}
    </div>
  );
};

export default RankSelector;
