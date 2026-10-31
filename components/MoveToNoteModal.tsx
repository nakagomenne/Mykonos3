import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CallRequest, NoteVisibility, User } from '../types';
import type { NotesApi } from '../hooks/useNotes';
import NoteVisibilityPicker from './NoteVisibilityPicker';
import { plainTextToHtml } from './NoteEditor';
import { XMarkIcon } from './icons';

interface MoveToNoteModalProps {
  call: CallRequest;
  api: NotesApi;
  me: User;
  users: User[];
  isDarkMode?: boolean;
  /** 案件を更新する(完了にする場合に使用) */
  onUpdateCall: (id: string, data: Partial<Omit<CallRequest, 'id'>>) => Promise<void> | void;
  onClose: () => void;
  /** ノート作成後に「開く」を押したとき */
  onOpenNote?: (noteId: string) => void;
}

const MoveToNoteModal: React.FC<MoveToNoteModalProps> = ({
  call, api, me, users, isDarkMode = false, onUpdateCall, onClose, onOpenNote,
}) => {
  const firstLine = (call.notes.split(/\r?\n/).find(l => l.trim()) ?? '').trim();
  const [title, setTitle] = useState(firstLine.length > 40 ? firstLine.slice(0, 40) + '…' : firstLine);
  const [folderId, setFolderId] = useState<string>('');
  const [visibility, setVisibility] = useState<NoteVisibility>('private');
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [hideCustomerId, setHideCustomerId] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'completed' | 'kept'>(null);

  const myFolders = api.folders.filter(f => f.owner === me.name);
  const tops = myFolders.filter(f => !f.parentId || !myFolders.some(p => p.id === f.parentId));
  const options: { id: string; label: string }[] = [];
  tops.forEach(f => {
    options.push({ id: f.id, label: f.name });
    myFolders.filter(c => c.parentId === f.id).forEach(c => options.push({ id: c.id, label: `　└ ${c.name}` }));
  });

  const alreadyCompleted = call.status === '完了';
  const d = isDarkMode;
  const border = d ? 'border-slate-700' : 'border-slate-200';
  const muted = d ? 'text-slate-400' : 'text-slate-500';
  const inputCls = `${d ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-800'} border rounded-md px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-[#0193be]`;

  const onFolderChange = (id: string) => {
    setFolderId(id);
    const f = myFolders.find(x => x.id === id);
    // フォルダの公開範囲を初期値として引き継ぐ
    if (f) { setVisibility(f.visibility); setSharedWith(f.sharedWith); }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const note = await api.addNote({
        title: title.trim() || `案件メモ ${call.customerId || ''}`.trim(),
        body: plainTextToHtml(call.notes),
        folderId: folderId || null,
        visibility,
        sharedWith: visibility === 'members' ? sharedWith : [],
        sourceCallId: call.id,
        sourceSnapshot: {
          customerId: hideCustomerId ? null : call.customerId,
          rank: call.rank,
          requester: call.requester,
          assignee: call.assignee,
          dateTime: call.dateTime,
        },
      });
      setCreatedId(note.id);
      // すでに完了している案件には確認を出さない
      if (alreadyCompleted) setDone('kept');
    } catch (e: any) {
      setError(e?.message ?? 'ノートの作成に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  /** 完了する → ステータスを完了にし、備考はノートへ移したものとして案件から外す */
  const completeCall = async () => {
    setBusy(true);
    setError(null);
    try {
      await onUpdateCall(call.id, { status: '完了', notes: '' });
      setDone('completed');
    } catch (e: any) {
      setError(e?.message ?? '案件の更新に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  const labelCls = `text-xs font-semibold mb-1 ${muted}`;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[80]" onClick={busy ? undefined : onClose}>
      <div
        className={`${d ? 'bg-[#1a2234] text-slate-200' : 'bg-white text-slate-700'} rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        <div className={`p-4 border-b ${border} flex items-center justify-between`}>
          <h2 className="text-lg font-bold">📓 備考をノートに保存</h2>
          <button onClick={onClose} disabled={busy} aria-label="閉じる"><XMarkIcon className="w-6 h-6" /></button>
        </div>

        {done ? (
          <div className="p-6 space-y-4">
            <div className="text-base font-semibold">✅ ノートに保存しました</div>
            <p className="text-sm">
              {done === 'completed'
                ? '案件を完了にし、備考は案件から外してノートに移しました(変更履歴には残っています)。'
                : '案件の備考はそのまま残っています。'}
            </p>
            <div className="flex justify-end gap-2">
              {createdId && onOpenNote && (
                <button
                  onClick={() => { onOpenNote(createdId); onClose(); }}
                  className="px-4 py-2 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c]"
                >ノートを開く</button>
              )}
              <button onClick={onClose} className={`px-4 py-2 rounded-md text-sm border ${border}`}>閉じる</button>
            </div>
          </div>
        ) : createdId ? (
          <div className="p-6 space-y-4">
            <div className="text-base font-semibold">ノートを作成しました。この案件を完了にしますか?</div>
            <ul className={`text-sm space-y-1 list-disc pl-5 ${muted}`}>
              <li><b>完了する</b>:案件を完了にし、備考はノートへ移します(案件の備考欄は空になります)。</li>
              <li><b>完了しない</b>:案件はそのままで、備考も案件に残ります(ノートは控えとして残ります)。</li>
            </ul>
            {error && <div className="text-sm text-red-600">⚠ {error}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDone('kept')} disabled={busy} className={`px-4 py-2 rounded-md text-sm border ${border} disabled:opacity-50`}>完了しない</button>
              <button onClick={completeCall} disabled={busy} className="px-4 py-2 rounded-md text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                {busy ? '処理中…' : '完了する'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-4 overflow-y-auto">
              <div>
                <div className={labelCls}>元の備考</div>
                <div className={`text-sm whitespace-pre-wrap rounded-md border ${border} ${d ? 'bg-slate-800' : 'bg-slate-50'} p-2 max-h-32 overflow-y-auto`}>{call.notes}</div>
              </div>
              <div>
                <div className={labelCls}>タイトル</div>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="ノートのタイトル" className={inputCls} />
              </div>
              <div>
                <div className={labelCls}>保存先フォルダ</div>
                <select value={folderId} onChange={e => onFolderChange(e.target.value)} className={inputCls}>
                  <option value="">📥 未整理</option>
                  {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <div className={labelCls}>公開範囲</div>
                <NoteVisibilityPicker
                  visibility={visibility}
                  sharedWith={sharedWith}
                  users={users}
                  owner={me.name}
                  isDarkMode={d}
                  onChange={(v, s) => { setVisibility(v); setSharedWith(s); }}
                />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={hideCustomerId} onChange={e => setHideCustomerId(e.target.checked)} className="mt-1" />
                <span>
                  顧客IDを伏せる
                  <span className={`block text-xs ${muted}`}>
                    ノートに残す元案件の控え(ランク・依頼者・担当者・日時)から顧客IDを除きます。非公開以外で保存するときは、チェックしたままを推奨します。
                    なお備考の本文中に書かれた個人情報は自動では消えません。
                  </span>
                </span>
              </label>
              {error && <div className="text-sm text-red-600">⚠ {error}</div>}
            </div>
            <div className={`p-4 border-t ${border} flex justify-end gap-2`}>
              <button onClick={onClose} disabled={busy} className={`px-4 py-2 rounded-md text-sm border ${border}`}>キャンセル</button>
              <button onClick={create} disabled={busy} className="px-4 py-2 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50">
                {busy ? '保存中…' : 'ノートに保存'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default MoveToNoteModal;
