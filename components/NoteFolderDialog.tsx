import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { NoteVisibility, User } from '../types';
import { XMarkIcon } from './icons';
import NoteVisibilityPicker from './NoteVisibilityPicker';
import { NoteIcon } from './NoteIcons';

interface NoteFolderDialogProps {
  mode: 'create' | 'edit';
  owner: string;
  users: User[];
  initialName?: string;
  initialVisibility?: NoteVisibility;
  initialSharedWith?: string[];
  /** 親フォルダ名(サブフォルダ作成時の表示用) */
  parentName?: string;
  /** 公開範囲の変更が中のノートにも適用されることを示す */
  appliesToContents?: boolean;
  /** フォルダ(サブフォルダを含む)に入っている、自分のノートの数。1件以上あると「ノートの公開範囲もそろえる」を選べる */
  noteCount?: number;
  isDarkMode?: boolean;
  /** applyToNotes: 中のノートの公開範囲も、同じ設定にそろえるか */
  onSubmit: (name: string, visibility: NoteVisibility, sharedWith: string[], applyToNotes: boolean) => Promise<void>;
  onClose: () => void;
}

const NoteFolderDialog: React.FC<NoteFolderDialogProps> = ({
  mode, owner, users, initialName = '', initialVisibility = 'private', initialSharedWith = [],
  parentName, appliesToContents = false, noteCount = 0, isDarkMode = false, onSubmit, onClose,
}) => {
  /** 中のノートの公開範囲も、同じ設定にそろえるか(ふだんはオフ。ノートごとの設定を残す) */
  const [applyToNotes, setApplyToNotes] = useState(false);
  const [name, setName] = useState(initialName);
  const [visibility, setVisibility] = useState<NoteVisibility>(initialVisibility);
  const [sharedWith, setSharedWith] = useState<string[]>(initialSharedWith);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('フォルダ名を入力してください'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed, visibility, sharedWith, mode === 'edit' && noteCount > 0 && applyToNotes);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? '保存に失敗しました');
      setSaving(false);
    }
  };

  const border = isDarkMode ? 'border-slate-700' : 'border-slate-200';
  const visibilityChanged = mode === 'edit' && (visibility !== initialVisibility ||
    JSON.stringify([...sharedWith].sort()) !== JSON.stringify([...initialSharedWith].sort()));

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[90]" onClick={onClose}>
      <div
        className={`${isDarkMode ? 'bg-[#1a2234] text-slate-200' : 'bg-white text-slate-700'} rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`p-4 border-b ${border} flex items-center justify-between`}>
          <h2 className="text-lg font-bold">
            <NoteIcon name="folder" /> {mode === 'create' ? (parentName ? `「${parentName}」にサブフォルダを作成` : 'フォルダを作成') : 'フォルダの設定'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XMarkIcon className="w-6 h-6" /></button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-500">フォルダ名</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void submit(); }}
              maxLength={30}
              autoFocus
              className={`w-full px-3 py-2 border rounded-md text-sm ${isDarkMode ? 'bg-[#0f1623] border-slate-600 text-slate-200' : 'bg-white border-slate-300'}`}
              placeholder="例: 料金改定、運用ルール"
            />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1 text-slate-500">公開範囲(このフォルダで新しく作るノートの、最初の設定になります)</label>
            <NoteVisibilityPicker
              visibility={visibility}
              sharedWith={sharedWith}
              users={users}
              owner={owner}
              isDarkMode={isDarkMode}
              onChange={(v, s) => { setVisibility(v); setSharedWith(s); }}
            />
            {appliesToContents && noteCount > 0 && (
              <label className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${applyToNotes ? 'border-amber-400 bg-amber-50/70 text-slate-700' : border}`}>
                <input
                  type="checkbox"
                  data-folder-apply-notes
                  checked={applyToNotes}
                  onChange={e => setApplyToNotes(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0193be] focus:ring-[#0193be]"
                />
                <span className="text-sm">
                  <span className="font-semibold">フォルダの中のノート({noteCount}件)の公開範囲も、これにそろえる</span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    {applyToNotes
                      ? '保存すると、このフォルダ(サブフォルダを含む)に入っている自分のノートの公開範囲が、すべて上の設定に変わります。元の設定には戻せません。'
                      : 'チェックを入れないときは、ノートの公開範囲は変わりません(ノートごとの設定のままです)。'}
                  </span>
                </span>
              </label>
            )}
            {appliesToContents && noteCount === 0 && visibilityChanged && (
              <p className="text-xs text-slate-500 mt-2">すでにフォルダの中にあるノートの公開範囲は変わりません(ノートごとの設定のままです)。</p>
            )}
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
        </div>
        <div className={`p-3 border-t ${border} flex justify-end gap-2`}>
          <button onClick={onClose} className={`px-4 py-2 rounded-lg border text-sm ${border}`}>キャンセル</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2 rounded-lg bg-[#0193be] text-white text-sm font-bold disabled:opacity-50">
            {saving ? '保存中…' : (mode === 'create' ? '作成' : '保存')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default NoteFolderDialog;
