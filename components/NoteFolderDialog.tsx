import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { NoteVisibility, User } from '../types';
import { XMarkIcon } from './icons';
import NoteVisibilityPicker from './NoteVisibilityPicker';

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
  isDarkMode?: boolean;
  onSubmit: (name: string, visibility: NoteVisibility, sharedWith: string[]) => Promise<void>;
  onClose: () => void;
}

const NoteFolderDialog: React.FC<NoteFolderDialogProps> = ({
  mode, owner, users, initialName = '', initialVisibility = 'private', initialSharedWith = [],
  parentName, appliesToContents = false, isDarkMode = false, onSubmit, onClose,
}) => {
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
      await onSubmit(trimmed, visibility, sharedWith);
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
            {mode === 'create' ? (parentName ? `📁 「${parentName}」にサブフォルダを作成` : '📁 フォルダを作成') : '📁 フォルダの設定'}
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
            <label className="block text-xs font-bold mb-1 text-slate-500">公開範囲(フォルダ内のノートに引き継がれます)</label>
            <NoteVisibilityPicker
              visibility={visibility}
              sharedWith={sharedWith}
              users={users}
              owner={owner}
              isDarkMode={isDarkMode}
              onChange={(v, s) => { setVisibility(v); setSharedWith(s); }}
            />
            {appliesToContents && visibilityChanged && (
              <p className="text-xs text-amber-600 mt-2">⚠ 変更すると、このフォルダの中にあるノートの公開範囲もすべて同じ設定に変わります。</p>
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
