import React from 'react';
import { NoteVisibility, User } from '../types';
import { VISIBILITY_LABELS, groupToken, sharedGroups, sharedNames } from '../services/notesService';
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
  { value: 'members', desc: '選んだ商材・メンバーだけが見られます' },
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

  // ── 商材で公開する ──
  // 商材のボタンを押すと、「その商材を案内できるメンバー全員」という指定になる(名前の一覧ではない)。
  // あとから入った人も、その商材が付いていれば自動で見られる。商材を外された人は、見られなくなる。
  // 商材で見られる人のチェックは、入ったまま動かせない(その人だけ外したいときは、商材を使わず個別に選ぶ)
  const groups = sharedGroups(sharedWith);
  const isLit = (product: string) => groups.includes(product);
  /** この人が、点灯している商材で見られるか */
  const coveredBy = (u: User): string[] => groups.filter(g => (u.availableProducts ?? []).includes(g));
  const togglePreset = (product: string) => {
    const token = groupToken(product);
    onChange('members', isLit(product) ? sharedWith.filter(s => s !== token) : [...sharedWith, token]);
  };

  const toggle = (name: string) => {
    const next = sharedWith.includes(name) ? sharedWith.filter(n => n !== name) : [...sharedWith, name];
    onChange('members', next);
  };

  // ── 「全員」のボタン ──
  // 今いるメンバー全員の名前を選ぶ(外したい人のチェックだけ外せる)。もう一度押すと、選択をすべて外す。
  // これは名前の一覧なので、あとから入った人は含まれない(今後入る人にも見せたいときは、上の「全員」の公開範囲か、商材のボタンを使う)
  const [allPressed, setAllPressed] = React.useState(false);
  const selected = new Set(sharedWith);
  const allNames = candidates.map(u => u.name);
  const allLit = allPressed && allNames.length > 0 && allNames.every(n => selected.has(n));
  const toggleAll = () => {
    if (allLit) { setAllPressed(false); onChange('members', []); return; }
    setAllPressed(true);
    // 候補に無い人(退職した人など)や、商材の指定が入っていても、消さずに残す
    onChange('members', [...sharedWith, ...allNames.filter(n => !selected.has(n))]);
  };

  /** 今この設定で見られる人数(商材で見られる人 + 個別に選んだ人) */
  const viewerCount = candidates.filter(u => selected.has(u.name) || coveredBy(u).length > 0).length;
  /** 個別に選んだ人のうち、候補にいない人(退職した人など)は数えない */
  const pickedNames = sharedNames(sharedWith);

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
              共有するメンバー(いま {viewerCount}人{groups.length > 0 ? ` ・ ${groups.join('・')}` : ''})
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
                title="今いるメンバー全員をまとめて選びます。もう一度押すと、選択をすべて外します(選んだあと、外したい人のチェックだけ外せます)。あとから入る人は含まれません"
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
                    data-note-group={p}
                    title={`「${p}」を案内できるメンバー全員に公開します。あとから入った人も、「${p}」が付いていれば自動で見られます。もう一度押すと、この指定を外します`}
                    className={presetBtn(on)}
                  >{p}</button>
                );
              })}
            </div>
          )}
          <div className="max-h-40 overflow-y-auto grid grid-cols-2 gap-x-2 gap-y-0.5">
            {shown.map(u => {
              // 商材で見られる人は、チェックが入ったまま動かせない
              const via = coveredBy(u);
              const locked = via.length > 0;
              return (
                <label
                  key={u.name}
                  title={locked ? `「${via.join('・')}」で公開されています` : undefined}
                  className={`flex items-center gap-1.5 text-sm px-1.5 py-0.5 rounded ${locked ? 'cursor-default opacity-70' : 'cursor-pointer'} ${isDarkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-white'}`}
                >
                  <input
                    type="checkbox"
                    data-note-member={u.name}
                    checked={locked || sharedWith.includes(u.name)}
                    onChange={() => { if (!locked) toggle(u.name); }}
                    disabled={disabled || locked}
                    className="accent-[#0193be]"
                  />
                  <span className="truncate">{u.name}</span>
                </label>
              );
            })}
            {shown.length === 0 && <span className="text-xs text-slate-400 col-span-2 py-1">該当するメンバーがいません</span>}
          </div>
          {groups.length > 0 && (
            <p data-note-group-hint className={`text-[11px] mt-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              「{groups.join('・')}」を案内できるメンバー全員に公開します。あとから入った人も、自動で見られます。
            </p>
          )}
          {groups.length === 0 && pickedNames.length === 0 && (
            <p className="text-[11px] text-amber-600 mt-1.5">商材かメンバーを選ぶまでは、自分以外には見えません。</p>
          )}
        </div>
      )}
    </div>
  );
};

export default NoteVisibilityPicker;
