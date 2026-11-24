import React from 'react';
import { NoteVisibility, User } from '../types';
import { VISIBILITY_LABELS } from '../services/notesService';
import { VisibilityIcon } from './NoteIcons';

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

/** 案内可能商材の並び順(管理者メニューと同じ) */
const PRODUCT_ORDER = ['回線', '水', '保険'];

const NoteVisibilityPicker: React.FC<NoteVisibilityPickerProps> = ({
  visibility, sharedWith, users, owner, onChange, isDarkMode = false, disabled = false,
}) => {
  const candidates = users.filter(u => u.name !== owner);
  const [filter, setFilter] = React.useState('');
  const shown = candidates.filter(u => !filter || u.name.includes(filter) || (u.furigana ?? '').includes(filter));

  /** まとめて選ぶのに使った商材(手で1人ずつ変えたら、印は消す) */
  const [presets, setPresets] = React.useState<Set<string>>(new Set());
  /** メンバーに登録されている案内可能商材(だれにも登録されていない商材は出さない) */
  const products = React.useMemo(() => {
    const all = new Set<string>();
    candidates.forEach(u => (u.availableProducts ?? []).forEach(p => all.add(p)));
    return [...all].sort((a, b) => {
      const ia = PRODUCT_ORDER.indexOf(a), ib = PRODUCT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b, 'ja');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, owner]);

  const toggle = (name: string) => {
    const next = sharedWith.includes(name) ? sharedWith.filter(n => n !== name) : [...sharedWith, name];
    setPresets(new Set());
    onChange('members', next);
  };

  /**
   * 案内可能商材でまとめて選ぶ(管理者メニューの全体タスクと同じ動き)。
   * 選んだ商材を「すべて」案内できるメンバーに入れ替える。全部外すと、だれも選んでいない状態に戻る
   */
  const togglePreset = (product: string) => {
    const next = new Set(presets);
    if (next.has(product)) next.delete(product); else next.add(product);
    setPresets(next);
    const names = next.size === 0
      ? []
      : candidates.filter(u => [...next].every(p => (u.availableProducts ?? []).includes(p))).map(u => u.name);
    onChange('members', names);
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
                <VisibilityIcon visibility={o.value} /> {VISIBILITY_LABELS[o.value]}
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
          {products.length > 0 && (
            <div data-note-presets className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>案内可能商材でまとめて選ぶ</span>
              {products.map(p => {
                const on = presets.has(p);
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={disabled}
                    onClick={() => togglePreset(p)}
                    aria-pressed={on}
                    title={`「${p}」を案内できるメンバーをまとめて選びます(複数押すと、すべてを案内できるメンバーだけになります)`}
                    className={`text-xs px-2.5 py-0.5 rounded-full border transition ${
                      on
                        ? 'border-[#0193be] bg-[#0193be] text-white font-bold'
                        : (isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100')
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >{p}</button>
                );
              })}
            </div>
          )}
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
