import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NoteTemplate } from '../types';
import { fetchTemplates } from '../services/notesService';
import NoteTemplatesModal from './NoteTemplatesModal';

interface NoteTemplatePickerProps {
  userName: string;
  /** 選んだ定型文を受け取る(プレーンテキスト) */
  onPick: (body: string) => void;
  isDarkMode?: boolean;
  className?: string;
}

/** 案件の備考欄などに置く「定型文」ボタン(クリックで一覧→挿入、末尾に管理画面への入口) */
const NoteTemplatePicker: React.FC<NoteTemplatePickerProps> = ({ userName, onPick, isDarkMode = false, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<NoteTemplate[] | null>(null);
  const [managing, setManaging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { setTemplates(await fetchTemplates(userName)); } catch { setTemplates([]); }
  }, [userName]);

  useEffect(() => {
    if (open && templates === null) void load();
  }, [open, templates, load]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!userName) return null;

  return (
    <div className={`relative inline-block ${className}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`text-xs px-2 py-0.5 rounded-full border transition ${
          isDarkMode ? 'border-slate-500 text-slate-300 hover:bg-slate-700' : 'border-slate-300 text-slate-500 hover:bg-slate-100'
        }`}
        title="定型文を挿入"
      >📋 定型文</button>
      {open && (
        <div className={`absolute right-0 top-full mt-1 z-30 w-64 max-h-64 overflow-y-auto rounded-lg border shadow-xl ${isDarkMode ? 'bg-[#1a2234] border-slate-600' : 'bg-white border-slate-200'}`}>
          {templates === null ? (
            <div className="px-3 py-2 text-xs text-slate-400">読み込み中…</div>
          ) : templates.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">定型文はまだありません</div>
          ) : templates.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => { onPick(t.body); setOpen(false); }}
              className={`block w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${isDarkMode ? 'text-slate-200 hover:bg-slate-700 border-slate-700' : 'text-slate-700 hover:bg-slate-50 border-slate-100'}`}
              title={t.body}
            >
              <div className="font-medium truncate">{t.visibility === 'public' ? '🌐 ' : ''}{t.name}</div>
              <div className="text-[11px] text-slate-400 truncate">{t.body.replace(/\s+/g, ' ')}</div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setOpen(false); setManaging(true); }}
            className="block w-full text-left px-3 py-2 text-xs font-bold text-[#0193be] hover:bg-[#0193be]/10"
          >⚙ 定型文を管理…</button>
        </div>
      )}
      {managing && (
        <NoteTemplatesModal
          userName={userName}
          isDarkMode={isDarkMode}
          onClose={() => setManaging(false)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
};

export default NoteTemplatePicker;
