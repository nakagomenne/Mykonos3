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
  // ボット(人が使わないメンバー)は、共有相手の候補に出さない
  const candidates = users.filter(u => u.name !== owner && !u.isBot);
  const [filter, setFilter] = React.useState('');
  const shown = candidates.filter(u => !filter || u.name.includes(filter) || (u.furigana ?? '').includes(filter));

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
    onChange('members', next);
  };

  // ── まとめて選ぶボタン(全員 / 案内可能商材) ──
  // 押すと、その人たちを今の選択に「足す」(それまで選んでいた人は、そのまま)。
  // もう一度押すと、その人たちを外す。ボタンは、押してから、その人たちが全員選ばれているあいだ青く点灯する
  // (ほかのボタンで選ばれただけのときは点灯しない。1人でもチェックを外すと白に戻る)
  const ALL = '__all__';
  const [pressed, setPressed] = React.useState<Set<string>>(new Set());
  const setPress = (key: string, on: boolean) => setPressed(prev => {
    const next = new Set(prev);
    if (on) next.add(key); else next.delete(key);
    return next;
  });
  const selected = new Set(sharedWith);
  const membersOf = (product: string) => candidates.filter(u => (u.availableProducts ?? []).includes(product)).map(u => u.name);
  const allIn = (names: string[]) => names.length > 0 && names.every(n => selected.has(n));
  const isLit = (product: string) => pressed.has(product) && allIn(membersOf(product));
  const allNames = candidates.map(u => u.name);
  const allLit = pressed.has(ALL) && allIn(allNames);

  const toggleAll = () => {
    if (allLit) { setPressed(new Set()); onChange('members', []); return; }
    setPress(ALL, true);
    // 候補に無い人(退職した人など)が入っていても、消さずに残す
    onChange('members', [...sharedWith, ...allNames.filter(n => !selected.has(n))]);
  };

  const togglePreset = (product: string) => {
    const names = membersOf(product);
    if (!isLit(product)) {
      setPress(product, true);
      onChange('members', [...sharedWith, ...names.filter(n => !selected.has(n))]);
      return;
    }
    setPress(product, false);
    // 「全員」が点灯しているときは、全員のまま(商材のボタンだけ白に戻す)
    if (allLit) return;
    // 外すとき: ほかに点灯している商材でも選ばれている人は、残す
    const keep = new Set<string>();
    products.filter(p => p !== product).forEach(p => {
      if (isLit(p)) membersOf(p).forEach(n => keep.add(n));
    });
    const drop = new Set(names.filter(n => !keep.has(n)));
    onChange('members', sharedWith.filter(n => !drop.has(n)));
  };

  const presetBtn = (on: boolean) => `text-xs px-2.5 py-0.5 rounded-full border transition ${
    on
      ? 'border-[#0193be] bg-[#0193be] text-white font-bold'
      : (isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100')
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

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
          {allNames.length > 0 && (
            <div data-note-presets className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>まとめて選ぶ</span>
              <button
                type="button"
                disabled={disabled}
                onClick={toggleAll}
                aria-pressed={allLit}
                title="全員をまとめて選びます。もう一度押すと、全員を外します(選んだあと、外したい人のチェックだけ外せます)"
                className={presetBtn(allLit)}
              >全員</button>
              {products.map(p => {
                const on = isLit(p);
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={disabled}
                    onClick={() => togglePreset(p)}
                    aria-pressed={on}
                    title={`「${p}」を案内できるメンバーを、今の選択に足します。もう一度押すと、その人たちを外します`}
                    className={presetBtn(on)}
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
