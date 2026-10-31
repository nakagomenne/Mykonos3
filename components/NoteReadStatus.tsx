import React, { useState } from 'react';
import { Note, NoteRead, User } from '../types';
import { getRecipients } from '../services/notesService';

interface NoteReadStatusProps {
  note: Note;
  users: User[];
  reads: NoteRead[];
  isDarkMode?: boolean;
}

/** 周知ノートの「誰が確認済み/未確認か」(オーナーと管理者に表示) */
const NoteReadStatus: React.FC<NoteReadStatusProps> = ({ note, users, reads, isDarkMode = false }) => {
  const [open, setOpen] = useState(false);
  const recipients = getRecipients(note, users);
  const readMap = new Map(reads.filter(r => r.noteId === note.id).map(r => [r.userName, r.readAt]));
  const done = recipients.filter(n => readMap.has(n));
  const todo = recipients.filter(n => !readMap.has(n));
  const pct = recipients.length === 0 ? 100 : Math.round((done.length / recipients.length) * 100);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className={`rounded-lg border px-3 py-2 ${isDarkMode ? 'border-slate-600 bg-[#0f1623]' : 'border-slate-200 bg-slate-50'}`}>
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 text-left">
        <span className="text-sm font-bold text-[#0193be] whitespace-nowrap">📣 確認状況</span>
        <span className={`text-sm whitespace-nowrap ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          {done.length} / {recipients.length}人
        </span>
        <span className={`flex-1 h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
          <span className="block h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </span>
        <span className="text-xs text-slate-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs font-bold text-red-500 mb-1">未確認({todo.length})</div>
            {todo.length === 0
              ? <div className="text-xs text-slate-400">全員確認済みです 🎉</div>
              : <ul className="space-y-0.5">{todo.map(n => <li key={n} className={isDarkMode ? 'text-slate-200' : 'text-slate-700'}>{n}</li>)}</ul>}
          </div>
          <div>
            <div className="text-xs font-bold text-emerald-600 mb-1">確認済み({done.length})</div>
            {done.length === 0
              ? <div className="text-xs text-slate-400">まだいません</div>
              : <ul className="space-y-0.5">{done.map(n => (
                  <li key={n} className={isDarkMode ? 'text-slate-200' : 'text-slate-700'}>
                    {n} <span className="text-[11px] text-slate-400">{fmt(readMap.get(n)!)}</span>
                  </li>
                ))}</ul>}
          </div>
        </div>
      )}
    </div>
  );
};

export default NoteReadStatus;
