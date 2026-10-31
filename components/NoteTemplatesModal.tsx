import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { NoteTemplate } from '../types';
import { XMarkIcon } from './icons';
import { deleteTemplate, fetchTemplates, saveTemplate } from '../services/notesService';

interface NoteTemplatesModalProps {
  userName: string;
  isDarkMode?: boolean;
  onClose: () => void;
  /** 追加・更新・削除したとき(ピッカーの再読み込み用) */
  onChanged?: () => void;
}

const NoteTemplatesModal: React.FC<NoteTemplatesModalProps> = ({ userName, isDarkMode = false, onClose, onChanged }) => {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id?: string; name: string; body: string; visibility: 'private' | 'public' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTemplates(await fetchTemplates(userName));
    } catch (e: any) {
      setError(e?.message ?? '定型文の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [userName]);
  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) { setError('定型文の名前を入力してください'); return; }
    if (!editing.body.trim()) { setError('定型文の内容を入力してください'); return; }
    setSaving(true);
    setError(null);
    try {
      await saveTemplate({ id: editing.id, owner: userName, name, body: editing.body, visibility: editing.visibility });
      setEditing(null);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: NoteTemplate) => {
    if (!window.confirm(`定型文「${t.name}」を削除しますか?`)) return;
    try {
      await deleteTemplate(t.id);
      await load();
      onChanged?.();
    } catch (e: any) {
      setError(e?.message ?? '削除に失敗しました');
    }
  };

  const card = isDarkMode ? 'bg-[#1a2234] text-slate-200' : 'bg-white text-slate-700';
  const field = isDarkMode ? 'bg-[#0f1623] border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-700';
  const border = isDarkMode ? 'border-slate-700' : 'border-slate-200';

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70]" onClick={onClose}>
      <div className={`${card} rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col`} onClick={e => e.stopPropagation()}>
        <div className={`p-4 border-b ${border} flex items-center justify-between`}>
          <h2 className="text-lg font-bold">📋 定型文の管理</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XMarkIcon className="w-6 h-6" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <p className="text-xs text-slate-500">
            案件の備考欄などで、ワンクリックで挿入できる文章です。「全員に公開」にすると、みんなの備考欄の定型文にも表示されます。
          </p>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

          {editing ? (
            <div className={`border ${border} rounded-lg p-3 space-y-2`}>
              <input
                value={editing.name}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                placeholder="名前(例: 不在時の折り返し依頼)"
                maxLength={40}
                className={`w-full px-3 py-2 border rounded-md text-sm ${field}`}
                autoFocus
              />
              <textarea
                value={editing.body}
                onChange={e => setEditing({ ...editing, body: e.target.value })}
                placeholder="挿入する文章"
                rows={6}
                className={`w-full px-3 py-2 border rounded-md text-sm ${field}`}
              />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex gap-1.5">
                  {(['private', 'public'] as const).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setEditing({ ...editing, visibility: v })}
                      className={`px-3 py-1.5 rounded-lg border text-sm ${editing.visibility === v ? 'border-[#0193be] bg-[#0193be]/10 text-[#0193be] font-bold' : `${border} text-slate-500`}`}
                    >{v === 'private' ? '🔒 自分だけ' : '🌐 全員に公開'}</button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(null); setError(null); }} className={`px-4 py-1.5 rounded-lg border text-sm ${border}`}>キャンセル</button>
                  <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 rounded-lg bg-[#0193be] text-white text-sm font-bold disabled:opacity-50">
                    {saving ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditing({ name: '', body: '', visibility: 'private' })}
              className="w-full py-2 rounded-lg border-2 border-dashed border-[#0193be]/50 text-[#0193be] font-bold text-sm hover:bg-[#0193be]/5"
            >＋ 定型文を追加</button>
          )}

          {loading ? (
            <p className="text-sm text-slate-400 text-center py-4">読み込み中…</p>
          ) : templates.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">定型文はまだありません</p>
          ) : (
            <ul className="space-y-2">
              {templates.map(t => {
                const mine = t.owner === userName;
                return (
                  <li key={t.id} className={`border ${border} rounded-lg p-3`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-sm truncate">
                        {t.visibility === 'public' ? '🌐' : '🔒'} {t.name}
                        {!mine && <span className="ml-2 text-xs font-normal text-slate-400">by {t.owner}</span>}
                      </div>
                      {mine && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => setEditing({ id: t.id, name: t.name, body: t.body, visibility: t.visibility })} className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-500 hover:bg-slate-100">編集</button>
                          <button onClick={() => handleDelete(t)} className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50">削除</button>
                        </div>
                      )}
                    </div>
                    <pre className="text-xs text-slate-500 mt-1.5 whitespace-pre-wrap font-sans line-clamp-3">{t.body}</pre>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NoteTemplatesModal;
