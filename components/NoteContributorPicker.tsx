// ============================================================
// 共同フォルダの「ノートを入れられる人」を選ぶ欄
//   - 候補は、そのフォルダを見られる人だけ(見られない人は、入れることもできないので)
//   - 商材のボタンを押すと、「その商材を案内できるメンバー全員」という指定になる
//     (名前の一覧ではないので、あとから入った人にも自動で効く)
// ============================================================
import React from 'react';
import { User } from '../types';
import { groupToken, sharedGroups } from '../services/notesService';

interface Props {
  /** ノートを入れられる人(人の名前、または商材の指定) */
  contributors: string[];
  /** 候補(このフォルダを見られる人。持ち主とボットは除く) */
  candidates: User[];
  onChange: (contributors: string[]) => void;
  isDarkMode?: boolean;
}

/** 案内可能商材の並び順(管理者メニューと同じ) */
const PRODUCT_ORDER = ['回線', '水', '保険'];

const NoteContributorPicker: React.FC<Props> = ({ contributors, candidates, onChange, isDarkMode = false }) => {
  const d = isDarkMode;
  const products = React.useMemo(() => {
    const all = new Set<string>();
    candidates.forEach(u => (u.availableProducts ?? []).forEach(p => all.add(p)));
    return [...all].sort((a, b) => {
      const ia = PRODUCT_ORDER.indexOf(a), ib = PRODUCT_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b, 'ja');
    });
  }, [candidates]);

  const groups = sharedGroups(contributors);
  const coveredBy = (u: User): string[] => groups.filter(g => (u.availableProducts ?? []).includes(g));
  const toggleGroup = (product: string) => {
    const token = groupToken(product);
    onChange(contributors.includes(token) ? contributors.filter(s => s !== token) : [...contributors, token]);
  };
  const toggle = (name: string) =>
    onChange(contributors.includes(name) ? contributors.filter(n => n !== name) : [...contributors, name]);

  const count = candidates.filter(u => contributors.includes(u.name) || coveredBy(u).length > 0).length;
  const presetBtn = (on: boolean) => `text-xs px-2.5 py-0.5 rounded-full border transition ${
    on
      ? 'border-[#0193be] bg-[#0193be] text-white font-bold'
      : (d ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100')}`;

  return (
    <div data-folder-contributors className={`rounded-lg border p-2 ${d ? 'border-slate-600 bg-[#0f1623]' : 'border-slate-200 bg-slate-50'}`}>
      <div className={`text-xs font-bold mb-1.5 ${d ? 'text-slate-300' : 'text-slate-600'}`}>
        いま {count}人{groups.length > 0 ? ` ・ ${groups.join('・')}` : ''}
      </div>
      {candidates.length === 0 ? (
        <p className="text-xs text-slate-400 py-1">このフォルダを見られる人が、まだいません。</p>
      ) : (
        <>
          {products.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className={`text-[11px] ${d ? 'text-slate-400' : 'text-slate-500'}`}>まとめて選ぶ</span>
              {products.map(p => {
                const on = groups.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    data-contributor-group={p}
                    aria-pressed={on}
                    onClick={() => toggleGroup(p)}
                    title={`「${p}」を案内できるメンバー全員が、ノートを入れられます。あとから入った人にも、自動で効きます`}
                    className={presetBtn(on)}
                  >{p}</button>
                );
              })}
            </div>
          )}
          <div className="max-h-32 overflow-y-auto grid grid-cols-2 gap-x-2 gap-y-0.5">
            {candidates.map(u => {
              const via = coveredBy(u);
              const locked = via.length > 0;
              return (
                <label
                  key={u.name}
                  title={locked ? `「${via.join('・')}」で選ばれています` : undefined}
                  className={`flex items-center gap-1.5 text-sm px-1.5 py-0.5 rounded ${locked ? 'cursor-default opacity-70' : 'cursor-pointer'} ${d ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-white'}`}
                >
                  <input
                    type="checkbox"
                    data-contributor-member={u.name}
                    checked={locked || contributors.includes(u.name)}
                    onChange={() => { if (!locked) toggle(u.name); }}
                    disabled={locked}
                    className="accent-[#0193be]"
                  />
                  <span className="truncate">{u.name}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default NoteContributorPicker;
