import React from 'react';
import { NoteVisibility, User } from '../types';
import { VISIBILITY_ICONS, VISIBILITY_LABELS } from '../services/notesService';

interface NoteVisibilityPickerProps {
  visibility: NoteVisibility;
  sharedWith: string[];
  /** 共有相手の候補(オーナー本人は除外して表示) */
  users: User[];
  owner: string;
  onChange: (visibility: NoteVisibility, sharedWith: string[]) => void;
  isDarkMode?: boolean;
  disabled?: boolean;
}

const OPTIONS: { value: NoteVisibility; desc: string }[] = [
  { value: 'private', desc: '自分だけが見られます' },
  { value: 'public',  desc: 'ログインしている全員が見られます' },
  { value: 'admin',   desc: '管理者だけが見られます' },
  { value: 'members', desc: '選んだメンバーだけが見られます' },
];

const NoteVisibilityPicker: React.FC<NoteVisibilityPickerProps> = ({
  visibility, sharedWith, users, owner, onChange, isDarkMode = false, disabled = false,
}) => {
  const candidates = users.filter(u => u.name !== owner);
  const [filter, setFilter] = React.useState('');
  const shown = candidates.filter(u => !filter || u.name.includes(filter) || (u.furigana ?? '').includes(filter));

  const toggle = (name: string) => {
    const next = sharedWith.includes(name) ? sharedWith.filter(n => n !== name) : [...sharedWith, name];
    onChange('members', next);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {OPTIONS.map(o => {
          const active = visibility === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(o.value, o.value === 'members' ? sharedWith : [])}
              className={`text-left px-3 py-2 rounded-lg border text-sm transition ${
                active
                  ? 'border-[#0193be] bg-[#0193be]/10 ring-1 ring-[#0193be]'
                  : (isDarkMode ? 'border-slate-600 hover:bg-slate-700' : 'border-slate-200 hover:bg-slate-50')
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`font-bold ${active ? 'text-[#0193be]' : (isDarkMode ? 'text-slate-200' : 'text-slate-700')}`}>
                {VISIBILITY_ICONS[o.value]} {VISIBILITY_LABELS[o.value]}
              </div>
              <div className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{o.desc}</div>
            </button>
          );
        })}
      </div>

      {visibility === 'members' && (
        <div className={`rounded-lg border p-2 ${isDarkMode ? 'border-slate-600 bg-[#0f1623]' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <span className={`text-xs font-bold ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
              共有するメンバー({sharedWith.length}人)
            </span>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="名前で絞り込み"
              disabled={disabled}
              className={`text-xs px-2 py-1 rounded border w-32 ${isDarkMode ? 'bg-[#1a2234] border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-700'}`}
            />
          </div>
          <div className="max-h-40 overflow-y-auto grid grid-cols-2 gap-x-2 gap-y-0.5">
            {shown.map(u => (
              <label key={u.name} className={`flex items-center gap-1.5 text-sm px-1.5 py-0.5 rounded cursor-pointer ${isDarkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-white'}`}>
                <input
                  type="checkbox"
                  checked={sharedWith.includes(u.name)}
                  onChange={() => toggle(u.name)}
                  disabled={disabled}
                  className="accent-[#0193be]"
                />
                <span className="truncate">{u.name}</span>
              </label>
            ))}
            {shown.length === 0 && <span className="text-xs text-slate-400 col-span-2 py-1">該当するメンバーがいません</span>}
          </div>
          {sharedWith.length === 0 && (
            <p className="text-[11px] text-amber-600 mt-1.5">メンバーを選ぶまでは、自分以外には見えません。</p>
          )}
        </div>
      )}
    </div>
  );
};

export default NoteVisibilityPicker;
