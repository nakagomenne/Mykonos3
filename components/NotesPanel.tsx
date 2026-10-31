import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Note, NoteFolder, NoteTemplate, NoteVisibility, User } from '../types';
import type { NotesApi } from '../hooks/useNotes';
import {
  VISIBILITY_ICONS, VISIBILITY_LABELS, fetchTemplates, getRecipients, uploadNoteImage,
} from '../services/notesService';
import NoteEditor, { htmlToPlainText } from './NoteEditor';
import NoteVisibilityPicker from './NoteVisibilityPicker';
import NoteFolderDialog from './NoteFolderDialog';
import NoteReadStatus from './NoteReadStatus';
import NotesHelpModal from './NotesHelpModal';
import ConfirmationModal from './ConfirmationModal';
import { XMarkIcon, PlusIcon, TrashIcon, ChevronLeftIcon, MagnifyingGlassIcon } from './icons';

type View =
  | { kind: 'pinned' }
  | { kind: 'unsorted' }
  | { kind: 'mine' }
  | { kind: 'announce' }
  | { kind: 'shared' }
  | { kind: 'folder'; folderId: string };

type MobileStep = 'folders' | 'list' | 'note';

type FolderDlg =
  | { mode: 'create'; parent: NoteFolder | null }
  | { mode: 'edit'; folder: NoteFolder };

interface NotesPanelProps {
  api: NotesApi;
  me: User;
  users: User[];
  isDarkMode?: boolean;
  /** 開いたときに最初に選択するノート(通知・バッジから) */
  initialNoteId?: string | null;
  onClose: () => void;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const NotesPanel: React.FC<NotesPanelProps> = ({ api, me, users, isDarkMode = false, initialNoteId = null, onClose }) => {
  const {
    notes, folders, reads, loading, unavailable, error, saveState, myReadIds, unreadAnnouncements,
  } = api;
  const isAdmin = !!(me.isAdmin || me.isSuperAdmin);

  const [view, setView] = useState<View>(() => {
    const target = initialNoteId ? notes.find(n => n.id === initialNoteId) : undefined;
    if (target && target.owner !== me.name) return { kind: 'shared' };
    return unreadAnnouncements.length > 0 && !target ? { kind: 'announce' } : { kind: 'mine' };
  });
  const [selectedId, setSelectedId] = useState<string | null>(initialNoteId);
  const [step, setStep] = useState<MobileStep>(initialNoteId ? 'note' : 'list');
  const [search, setSearch] = useState('');
  const [folderDlg, setFolderDlg] = useState<FolderDlg | null>(null);
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<Note | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<NoteFolder | null>(null);
  const [announceTarget, setAnnounceTarget] = useState<Note | null>(null);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // 別のノートを開いたら、公開範囲の設定パネルは閉じる
  useEffect(() => { setSettingsOpen(false); }, [selectedId]);

  useEffect(() => {
    fetchTemplates(me.name).then(setTemplates).catch(() => setTemplates([]));
  }, [me.name]);

  // 閉じるとき・アンマウント時に、保存待ちの編集を送信
  const flushRef = useRef(api.flushAll);
  useEffect(() => { flushRef.current = api.flushAll; }, [api.flushAll]);
  useEffect(() => () => { void flushRef.current(); }, []);

  // 外から別ノートを指定された場合
  useEffect(() => {
    if (!initialNoteId) return;
    const t = notes.find(n => n.id === initialNoteId);
    if (!t) return;
    setSelectedId(initialNoteId);
    setSearch('');
    setView(t.owner === me.name ? { kind: 'mine' } : { kind: 'shared' });
    setStep('note');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNoteId]);

  // ── 派生データ ─────────────────────────────────────────
  const myFolders = useMemo(() => folders.filter(f => f.owner === me.name), [folders, me.name]);
  const topFolders = useMemo(
    () => myFolders.filter(f => !f.parentId || !myFolders.some(p => p.id === f.parentId))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ja')),
    [myFolders]
  );
  const childrenOf = (id: string) =>
    myFolders.filter(f => f.parentId === id).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ja'));
  const flatFolders = useMemo(() => {
    const out: { folder: NoteFolder; depth: number }[] = [];
    topFolders.forEach(f => {
      out.push({ folder: f, depth: 0 });
      childrenOf(f.id).forEach(c => out.push({ folder: c, depth: 1 }));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topFolders, myFolders]);

  const myNotes = useMemo(() => notes.filter(n => n.owner === me.name), [notes, me.name]);
  const otherNotes = useMemo(() => notes.filter(n => n.owner !== me.name), [notes, me.name]);

  const folderNoteCount = (folderId: string) => {
    const ids = new Set([folderId, ...childrenOf(folderId).map(c => c.id)]);
    return myNotes.filter(n => n.folderId && ids.has(n.folderId)).length;
  };

  // 検索用のプレーンテキスト(本文が変わったノートだけ再計算)
  const textCache = useRef(new Map<string, { body: string; text: string }>());
  const plainOf = (n: Note) => {
    const c = textCache.current.get(n.id);
    if (c && c.body === n.body) return c.text;
    const text = htmlToPlainText(n.body);
    textCache.current.set(n.id, { body: n.body, text });
    return text;
  };

  const visibleNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base: Note[];
    if (q) {
      base = notes;
    } else {
      switch (view.kind) {
        case 'pinned': base = myNotes.filter(n => n.pinned); break;
        case 'unsorted': base = myNotes.filter(n => !n.folderId); break;
        case 'mine': base = myNotes; break;
        case 'announce': base = notes.filter(n => n.isAnnouncement); break;
        case 'shared': base = otherNotes; break;
        case 'folder': {
          const ids = new Set([view.folderId, ...myFolders.filter(f => f.parentId === view.folderId).map(f => f.id)]);
          base = myNotes.filter(n => n.folderId && ids.has(n.folderId));
          break;
        }
      }
    }
    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      base = base.filter(n => {
        const hay = `${n.title}\n${n.tags.join(' ')}\n${n.owner}\n${plainOf(n)}`.toLowerCase();
        return words.every(w => hay.includes(w));
      });
    }
    return [...base].sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, myNotes, otherNotes, myFolders, view, search]);

  const selected = notes.find(n => n.id === selectedId) ?? null;
  const isOwner = !!selected && selected.owner === me.name;
  const currentFolder = view.kind === 'folder' ? folders.find(f => f.id === view.folderId) ?? null : null;

  // 選択中のノートが消えた(削除・非公開化など)ら選択解除
  useEffect(() => {
    if (selectedId && !notes.some(n => n.id === selectedId)) {
      setSelectedId(null);
      setStep(s => (s === 'note' ? 'list' : s));
    }
  }, [notes, selectedId]);

  const shownError = localError || error;

  // ── 操作 ──────────────────────────────────────────────
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setLocalError(null);
    try { await fn(); } catch (e: any) { setLocalError(e?.message ?? '操作に失敗しました'); } finally { setBusy(false); }
  };

  const handleNewNote = () => run(async () => {
    const folder = view.kind === 'folder' ? myFolders.find(f => f.id === view.folderId) : undefined;
    const note = await api.addNote({
      title: '',
      folderId: folder?.id ?? null,
      visibility: folder?.visibility ?? 'private',
      sharedWith: folder?.sharedWith ?? [],
      pinned: view.kind === 'pinned',
    });
    setSearch('');
    if (view.kind === 'shared' || view.kind === 'announce') setView({ kind: 'mine' });
    setSelectedId(note.id);
    setStep('note');
  });

  const handleCopy = () => selected && run(async () => {
    const created = await api.copyToMine(selected);
    setSearch('');
    setView({ kind: 'unsorted' });
    setSelectedId(created.id);
    setStep('note');
  });

  const handleDeleteNote = () => deleteNoteTarget && run(async () => {
    await api.removeNote(deleteNoteTarget.id);
    setDeleteNoteTarget(null);
    setStep('list');
  });

  const handleDeleteFolder = () => deleteFolderTarget && run(async () => {
    const id = deleteFolderTarget.id;
    await api.removeFolder(id);
    setDeleteFolderTarget(null);
    if (view.kind === 'folder' && (view.folderId === id || deleteFolderTarget.id === id)) setView({ kind: 'mine' });
  });

  const handleAnnounce = () => announceTarget && run(async () => {
    await api.announce(announceTarget.id);
    setAnnounceTarget(null);
  });

  const addTag = () => {
    if (!selected) return;
    const t = tagInput.trim().replace(/^#/, '');
    if (!t) return;
    if (!selected.tags.includes(t)) api.editNote(selected.id, { tags: [...selected.tags, t] });
    setTagInput('');
  };

  // ── スタイル ──────────────────────────────────────────
  const d = isDarkMode;
  const surface = d ? 'bg-[#1a2234] text-slate-200' : 'bg-white text-slate-700';
  const surface2 = d ? 'bg-[#141b2b]' : 'bg-slate-50';
  const border = d ? 'border-slate-700' : 'border-slate-200';
  const muted = d ? 'text-slate-400' : 'text-slate-500';
  const inputCls = `${d ? 'bg-slate-800 border-slate-600 text-slate-100 placeholder-slate-500' : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400'} border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0193be]`;
  const hoverRow = d ? 'hover:bg-slate-700/60' : 'hover:bg-slate-200/70';
  const activeRow = d ? 'bg-[#0193be]/30 text-white' : 'bg-[#0193be]/15 text-[#01607a] font-semibold';

  const isViewActive = (v: View) =>
    !search.trim() && v.kind === view.kind && (v.kind !== 'folder' || (view.kind === 'folder' && v.folderId === view.folderId));

  const selectView = (v: View) => {
    setView(v);
    setSearch('');
    setStep('list');
  };

  const SideItem: React.FC<{ v: View; icon: string; label: string; count?: number; badge?: number; depth?: number }> =
    ({ v, icon, label, count, badge, depth = 0 }) => (
      <button
        onClick={() => selectView(v)}
        className={`w-full flex items-center gap-2 pr-2 py-1.5 rounded-md text-sm text-left transition ${isViewActive(v) ? activeRow : hoverRow}`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="truncate flex-1">{label}</span>
        {badge ? <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">{badge}</span> : null}
        {count !== undefined && !badge ? <span className={`text-xs ${muted}`}>{count}</span> : null}
      </button>
    );

  const renderFolder = (f: NoteFolder, depth: number): React.ReactNode => {
    const active = isViewActive({ kind: 'folder', folderId: f.id });
    return (
      <React.Fragment key={f.id}>
        <SideItem
          v={{ kind: 'folder', folderId: f.id }}
          icon={VISIBILITY_ICONS[f.visibility] === '🔒' ? '📁' : `📁`}
          label={f.visibility === 'private' ? f.name : `${f.name} ${VISIBILITY_ICONS[f.visibility]}`}
          count={folderNoteCount(f.id)}
          depth={depth}
        />
        {active && (
          <div className="flex gap-1 mb-1" style={{ paddingLeft: 8 + depth * 16 + 22 }}>
            {depth === 0 && (
              <button className={`text-[11px] px-1.5 py-0.5 rounded border ${border} ${hoverRow}`} onClick={() => setFolderDlg({ mode: 'create', parent: f })}>＋サブ</button>
            )}
            <button className={`text-[11px] px-1.5 py-0.5 rounded border ${border} ${hoverRow}`} onClick={() => setFolderDlg({ mode: 'edit', folder: f })}>設定</button>
            <button className={`text-[11px] px-1.5 py-0.5 rounded border border-red-300 text-red-500 ${d ? 'hover:bg-red-900/30' : 'hover:bg-red-50'}`} onClick={() => setDeleteFolderTarget(f)}>削除</button>
          </div>
        )}
        {depth === 0 && childrenOf(f.id).map(c => renderFolder(c, 1))}
      </React.Fragment>
    );
  };

  const viewTitle = (() => {
    if (search.trim()) return `検索結果「${search.trim()}」`;
    switch (view.kind) {
      case 'pinned': return '★ ピン留め';
      case 'unsorted': return '📥 フォルダ未設定';
      case 'mine': return '📝 自分のノート(すべて)';
      case 'announce': return '📣 周知(お知らせ)';
      case 'shared': return '🌐 共有されたノート';
      case 'folder': return `📁 ${currentFolder?.name ?? 'フォルダ'}`;
    }
  })();

  const NoteRow: React.FC<{ n: Note }> = ({ n }) => {
    const preview = plainOf(n).replace(/\s+/g, ' ').slice(0, 70);
    const unread = n.isAnnouncement && n.owner !== me.name && !myReadIds.has(n.id);
    const active = n.id === selectedId;
    return (
      <button
        onClick={() => { setSelectedId(n.id); setStep('note'); }}
        className={`w-full text-left px-3 py-2.5 border-b ${border} transition ${active ? (d ? 'bg-[#0193be]/25' : 'bg-[#0193be]/10') : hoverRow}`}
      >
        <div className="flex items-center gap-1.5">
          {n.pinned && <span className="text-amber-500 text-xs">★</span>}
          <span className={`truncate flex-1 text-sm font-semibold ${n.title ? '' : muted}`}>{n.title || '(無題)'}</span>
          {unread && <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5">未確認</span>}
          {n.isAnnouncement && !unread && <span title="周知">📣</span>}
          <span title={VISIBILITY_LABELS[n.visibility]} className="text-xs">{VISIBILITY_ICONS[n.visibility]}</span>
        </div>
        <div className={`text-xs mt-0.5 truncate ${muted}`}>{preview || '(本文なし)'}</div>
        <div className={`text-[11px] mt-0.5 flex gap-2 ${muted}`}>
          <span>{fmtDate(n.updatedAt)}</span>
          {n.owner !== me.name && <span>👤 {n.owner}</span>}
          {n.tags.slice(0, 3).map(t => <span key={t}>#{t}</span>)}
        </div>
      </button>
    );
  };

  // ── 本文ペイン ─────────────────────────────────────────
  const renderNotePane = () => {
    if (!selected) {
      return (
        <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="text-4xl">📓</div>
            <div className="font-bold text-base">ノートを選んでください</div>
            <p className={`text-sm ${muted}`}>左の一覧からノートを選ぶか、新しく作成します。</p>
            <div className="flex justify-center gap-2 flex-wrap">
              <button onClick={handleNewNote} disabled={busy} className="px-4 py-2 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50">＋ 新規ノート</button>
              <button onClick={() => setHelpOpen(true)} className={`px-4 py-2 rounded-md text-sm font-semibold border ${border} ${hoverRow}`}>❓ 使い方を見る</button>
            </div>
            <ul className={`text-left text-sm space-y-1.5 rounded-lg border ${border} ${surface2} p-4 ${d ? 'text-slate-300' : 'text-slate-600'}`}>
              <li>📣 <b>周知</b>:読んでほしいノートを、みんなに通知して確認状況も見られます</li>
              <li>🔒 <b>公開範囲</b>:自分だけ / 全員 / 管理者 / 選んだメンバー</li>
              <li>📎 案件の備考は、詳細画面の「ノートに保存」から移せます</li>
            </ul>
          </div>
        </div>
      );
    }
    const n = selected;
    const recipients = getRecipients(n, users);
    const iRead = myReadIds.has(n.id);
    const snap = n.sourceSnapshot;
    const folderOptions = flatFolders;
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {n.isAnnouncement && !isOwner && (
          <div className={`px-4 py-2.5 flex items-center gap-3 border-b ${border} ${iRead ? (d ? 'bg-emerald-900/30' : 'bg-emerald-50') : (d ? 'bg-amber-900/30' : 'bg-amber-50')}`}>
            <span className="text-sm flex-1">
              {iRead ? '✅ このお知らせを確認済みです' : `📣 ${n.owner} さんからの周知です。内容を読んだら「確認しました」を押してください。`}
            </span>
            {!iRead && (
              <button
                onClick={() => run(() => api.markRead(n.id))}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50"
              >確認しました</button>
            )}
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* タイトル */}
          <div className="flex items-start gap-2">
            <input
              value={n.title}
              readOnly={!isOwner}
              onChange={e => api.editNote(n.id, { title: e.target.value })}
              placeholder="タイトル"
              className={`flex-1 text-xl font-bold bg-transparent border-b-2 ${border} focus:border-[#0193be] focus:outline-none py-1`}
            />
            {isOwner && (
              <button
                onClick={() => api.editNote(n.id, { pinned: !n.pinned }, { immediate: true })}
                title={n.pinned ? 'ピン留めを外す' : 'ピン留め'}
                className={`text-xl px-1 ${n.pinned ? 'text-amber-500' : muted}`}
              >{n.pinned ? '★' : '☆'}</button>
            )}
          </div>

          {/* メタ情報 */}
          <div className={`text-xs ${muted} flex flex-wrap gap-x-4 gap-y-1`}>
            <span>👤 {n.owner}</span>
            <span>作成 {fmtDateTime(n.createdAt)}</span>
            <span>更新 {fmtDateTime(n.updatedAt)}{n.updatedBy && n.updatedBy !== n.owner ? `(${n.updatedBy})` : ''}</span>
            {!isOwner && <span>{VISIBILITY_ICONS[n.visibility]} {VISIBILITY_LABELS[n.visibility]}{n.visibility === 'members' ? `(${n.sharedWith.length}名)` : ''}</span>}
          </div>

          {/* オーナー用設定 */}
          {isOwner ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <button
                  onClick={() => setSettingsOpen(o => !o)}
                  title="このノートを誰が見られるかを変更します"
                  className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition ${settingsOpen ? 'border-[#0193be] bg-[#0193be]/10 text-[#0193be]' : `${border} ${hoverRow}`}`}
                >
                  <span className={`text-xs ${muted}`}>公開範囲</span>
                  <span className="font-bold">{VISIBILITY_ICONS[n.visibility]} {VISIBILITY_LABELS[n.visibility]}{n.visibility === 'members' ? `(${n.sharedWith.length}名)` : ''}</span>
                  <span className="text-[10px]">{settingsOpen ? '▲' : '▼'}</span>
                </button>
                <label className="inline-flex items-center gap-1.5">
                  <span className={`text-xs ${muted}`}>フォルダ</span>
                  <select
                    value={n.folderId ?? ''}
                    onChange={e => api.editNote(n.id, { folderId: e.target.value || null }, { immediate: true })}
                    className={inputCls}
                  >
                    <option value="">📥 未設定</option>
                    {folderOptions.map(({ folder, depth }) => (
                      <option key={folder.id} value={folder.id}>{depth ? '　└ ' : ''}{folder.name}</option>
                    ))}
                  </select>
                </label>
                <div className="inline-flex items-center gap-1 flex-wrap">
                  <span className={`text-xs ${muted}`}>タグ</span>
                  {n.tags.map(t => (
                    <span key={t} className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${d ? 'bg-slate-700' : 'bg-slate-200'}`}>
                      #{t}
                      <button onClick={() => api.editNote(n.id, { tags: n.tags.filter(x => x !== t) })} className="hover:text-red-500" aria-label={`タグ ${t} を外す`}>×</button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addTag(); } }}
                    onBlur={addTag}
                    placeholder="＋タグ"
                    className={`${inputCls} w-24 !py-0.5 text-xs`}
                  />
                </div>
              </div>

              {settingsOpen && (
                <div className={`rounded-lg border ${border} ${surface2} p-3 space-y-2`}>
                  <div className={`text-xs ${muted}`}>このノートを誰が見られるかを選びます。選ぶとすぐに反映されます。</div>
                  <NoteVisibilityPicker
                    visibility={n.visibility}
                    sharedWith={n.sharedWith}
                    users={users}
                    owner={n.owner}
                    isDarkMode={d}
                    onChange={(v: NoteVisibility, sh: string[]) => api.editNote(n.id, { visibility: v, sharedWith: sh }, { immediate: true })}
                  />
                </div>
              )}

              {/* 周知 */}
              <div className={`rounded-lg border px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 ${n.isAnnouncement ? (d ? 'border-amber-600 bg-amber-900/20' : 'border-amber-300 bg-amber-50') : `${border} ${surface2}`}`}>
                {n.visibility === 'private' ? (
                  <>
                    <span className="text-sm flex-1 min-w-[200px]">📣 <b>周知</b><span className={`ml-2 text-xs ${muted}`}>読んでほしい内容は、公開範囲を「自分だけ」以外にすると周知できます</span></span>
                    <button onClick={() => setSettingsOpen(true)} className={`text-xs px-2.5 py-1 rounded-md border ${border} ${hoverRow}`}>公開範囲を変える</button>
                  </>
                ) : n.isAnnouncement ? (
                  <>
                    <span className="text-sm font-bold text-amber-600 flex-1 min-w-[200px]">📣 周知中<span className={`ml-2 text-xs font-normal ${muted}`}>{n.announcedAt ? fmtDateTime(n.announcedAt) : ''}</span></span>
                    <button onClick={() => setAnnounceTarget(n)} className={`text-xs px-2.5 py-1 rounded-md border ${border} ${hoverRow}`} title="内容を直したときなど、もう一度確認してもらいます">再周知する</button>
                    <button onClick={() => run(() => api.unannounce(n.id))} className={`text-xs px-2.5 py-1 rounded-md border ${border} ${hoverRow}`}>周知をやめる</button>
                  </>
                ) : (
                  <>
                    <span className="text-sm flex-1 min-w-[200px]">📣 <b>周知</b><span className={`ml-2 text-xs ${muted}`}>通知を送り、誰が読んだかを確認できます</span></span>
                    <button onClick={() => setAnnounceTarget(n)} className="text-sm px-4 py-1.5 rounded-md font-bold text-white bg-amber-500 hover:bg-amber-600">📣 周知する</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              {n.tags.map(t => <span key={t} className={`text-xs rounded-full px-2 py-0.5 ${d ? 'bg-slate-700' : 'bg-slate-200'}`}>#{t}</span>)}
              <span className={`text-xs ${muted}`}>他の人のノートは読み取り専用です</span>
              <button onClick={handleCopy} disabled={busy} className="ml-auto text-sm px-3 py-1.5 rounded-md font-semibold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50">
                📄 自分用にコピーして編集
              </button>
            </div>
          )}

          {n.isAnnouncement && (isOwner || isAdmin) && (
            <NoteReadStatus note={n} users={users} reads={reads} isDarkMode={d} />
          )}
          {n.isAnnouncement && isOwner && recipients.length === 0 && (
            <div className="text-xs text-amber-600">※ 周知の対象者がいません(特定メンバーの選択を確認してください)。</div>
          )}

          {/* 元案件 */}
          {snap && (
            <div className={`rounded-lg border ${border} ${surface2} px-3 py-2 text-xs ${muted}`}>
              <div className="font-semibold mb-0.5">📎 元になった案件</div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {snap.customerId && <span>顧客ID: {snap.customerId}</span>}
                {snap.rank && <span>ランク: {snap.rank}</span>}
                {snap.requester && <span>依頼者: {snap.requester}</span>}
                {snap.assignee && <span>担当: {snap.assignee}</span>}
                {snap.dateTime && <span>日時: {snap.dateTime}</span>}
                {!snap.customerId && <span>(顧客IDは伏せています)</span>}
              </div>
            </div>
          )}

          {/* エディタ(ノートごとに作り直す) */}
          <NoteEditor
            key={n.id + (isOwner ? ':e' : ':r')}
            value={n.body}
            editable={isOwner}
            isDarkMode={d}
            onChange={html => api.editNote(n.id, { body: html })}
            onUploadImage={isOwner ? file => uploadNoteImage(file, me.name) : undefined}
            templates={isOwner ? templates : undefined}
            onError={setLocalError}
          />

          {isOwner && (
            <div className="pt-2 flex justify-end">
              <button onClick={() => setDeleteNoteTarget(n)} className="text-sm px-3 py-1.5 rounded-md border border-red-300 text-red-500 hover:bg-red-50 inline-flex items-center gap-1">
                <TrashIcon className="w-4 h-4" />このノートを削除
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const saveLabel = saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '✓ 保存しました' : saveState === 'error' ? '⚠ 保存に失敗' : '';

  return createPortal(
    <div className="fixed inset-0 z-[45] bg-black/60 flex items-stretch justify-center md:p-4" onClick={onClose}>
      <div className={`${surface} w-full max-w-7xl md:rounded-xl shadow-2xl flex flex-col min-h-0 overflow-hidden`} onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="px-3 md:px-4 py-2.5 flex items-center gap-2 md:gap-3 text-white" style={{ backgroundColor: '#0193be' }}>
          {step !== 'folders' && (
            <button
              className="md:hidden p-1 -ml-1"
              onClick={() => setStep(step === 'note' ? 'list' : 'folders')}
              aria-label="戻る"
            ><ChevronLeftIcon className="w-5 h-5" /></button>
          )}
          <h2 className="font-bold text-base md:text-lg whitespace-nowrap">📓<span className="hidden sm:inline"> ノート</span></h2>
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value && step === 'folders') setStep('list'); }}
              placeholder="タイトル・本文・タグを検索"
              className="w-full pl-8 pr-2 py-1.5 rounded-md text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-white/70"
            />
          </div>
          <button
            onClick={handleNewNote}
            disabled={busy || unavailable}
            className="inline-flex items-center gap-1 bg-white text-[#01607a] font-bold text-sm px-3 py-1.5 rounded-md hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
          ><PlusIcon className="w-4 h-4" /><span className="hidden sm:inline">新規ノート</span><span className="sm:hidden">新規</span></button>
          <span className="hidden md:inline text-xs opacity-90 min-w-[88px] text-right whitespace-nowrap">{saveLabel}</span>
          <button onClick={() => setHelpOpen(true)} className="hidden sm:inline-flex items-center justify-center w-7 h-7 rounded-full border border-white/70 text-sm font-bold hover:bg-white/20" title="ノートの使い方" aria-label="ノートの使い方">?</button>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded" aria-label="閉じる"><XMarkIcon className="w-6 h-6" /></button>
        </div>

        {shownError && !unavailable && (
          <div className="px-4 py-2 text-sm bg-red-50 text-red-700 border-b border-red-200 flex items-center gap-2">
            <span className="flex-1">⚠ {shownError}</span>
            <button onClick={() => { setLocalError(null); api.clearError(); }} className="font-bold" aria-label="エラーを閉じる">×</button>
          </div>
        )}

        {unavailable ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className={`max-w-lg rounded-xl border ${border} ${surface2} p-6 text-sm space-y-2`}>
              <div className="font-bold text-base">ノート機能の準備がまだ完了していません</div>
              <p>データベースにノート用のテーブルがありません。Supabase の SQL Editor で
                <code className="mx-1 px-1 rounded bg-slate-200 text-slate-800">supabase/migrations/20261031_add_notes.sql</code>
                を実行してください。</p>
              <button onClick={() => void api.reload()} className="mt-2 px-3 py-1.5 rounded-md text-white bg-[#0193be] hover:bg-[#017a9c]">再読み込み</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex min-h-0">
            {/* ① フォルダ */}
            <aside className={`${step === 'folders' ? 'flex' : 'hidden'} md:flex w-full md:w-56 lg:w-60 flex-shrink-0 flex-col border-r ${border} ${surface2} overflow-y-auto p-2 gap-0.5`}>
              <div className={`px-2 pt-1 pb-0.5 text-[11px] font-bold tracking-wide ${muted}`}>自分のノート</div>
              <SideItem v={{ kind: 'mine' }} icon="📝" label="すべて" count={myNotes.length} />
              <SideItem v={{ kind: 'pinned' }} icon="★" label="ピン留め" count={myNotes.filter(n => n.pinned).length} />
              <SideItem v={{ kind: 'unsorted' }} icon="📥" label="フォルダ未設定" count={myNotes.filter(n => !n.folderId).length} />

              <div className={`px-2 pt-3 pb-0.5 text-[11px] font-bold tracking-wide ${muted}`}>みんなから</div>
              <SideItem v={{ kind: 'announce' }} icon="📣" label="周知(お知らせ)" badge={unreadAnnouncements.length} count={notes.filter(n => n.isAnnouncement).length} />
              <SideItem v={{ kind: 'shared' }} icon="🌐" label="共有されたノート" count={otherNotes.length} />

              <div className={`px-2 pt-3 pb-0.5 text-[11px] font-bold tracking-wide ${muted} flex items-center justify-between`}>
                <span>マイフォルダ</span>
                <button
                  onClick={() => setFolderDlg({ mode: 'create', parent: null })}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded font-semibold normal-case ${hoverRow}`}
                  title="フォルダを作る"
                ><PlusIcon className="w-3.5 h-3.5" />作成</button>
              </div>
              {topFolders.map(f => renderFolder(f, 0))}
              {topFolders.length === 0 && (
                <div className={`px-2 py-1 text-xs leading-relaxed ${muted}`}>
                  フォルダはまだありません。右上の「＋作成」で、ノートを分類するフォルダを作れます。
                </div>
              )}

              <div className="flex-1" />
              <button
                onClick={() => setHelpOpen(true)}
                className={`mt-3 flex items-center gap-1.5 px-2 py-2 rounded-md text-sm font-semibold ${d ? 'text-sky-300' : 'text-[#0193be]'} ${hoverRow}`}
              >❓ ノートの使い方</button>
            </aside>

            {/* ② ノート一覧 */}
            <section className={`${step === 'list' ? 'flex' : 'hidden'} md:flex w-full md:w-72 lg:w-80 flex-shrink-0 flex-col border-r ${border} min-h-0`}>
              <div className={`px-3 py-2 text-sm font-bold border-b ${border} flex items-center justify-between gap-2`}>
                <button onClick={() => setStep('folders')} className={`md:hidden flex-shrink-0 text-xs font-semibold px-2 py-1 rounded border ${border}`}>📂 フォルダ</button>
                <span className="truncate flex-1">{viewTitle}</span>
                <span className={`text-xs font-normal ${muted}`}>{visibleNotes.length}件</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading && notes.length === 0 ? (
                  <div className={`p-4 text-sm ${muted}`}>読み込み中…</div>
                ) : visibleNotes.length === 0 ? (
                  <div className={`p-4 text-sm ${muted}`}>
                    {search.trim() ? '一致するノートがありません。' : view.kind === 'announce' ? '周知されているノートはありません。' : 'ノートがありません。「＋ 新規ノート」で作成できます。'}
                  </div>
                ) : visibleNotes.map(n => <NoteRow key={n.id} n={n} />)}
              </div>
            </section>

            {/* ③ 本文 */}
            <section className={`${step === 'note' ? 'flex' : 'hidden'} md:flex flex-1 min-w-0 flex-col min-h-0`}>
              {renderNotePane()}
            </section>
          </div>
        )}
      </div>

      {helpOpen && <NotesHelpModal isDarkMode={d} onClose={() => setHelpOpen(false)} />}

      {/* フォルダ作成・設定 */}
      {folderDlg && (
        <NoteFolderDialog
          mode={folderDlg.mode}
          owner={me.name}
          users={users}
          isDarkMode={d}
          parentName={folderDlg.mode === 'create' ? folderDlg.parent?.name : undefined}
          initialName={folderDlg.mode === 'edit' ? folderDlg.folder.name : ''}
          initialVisibility={folderDlg.mode === 'edit' ? folderDlg.folder.visibility : (folderDlg.parent?.visibility ?? 'private')}
          initialSharedWith={folderDlg.mode === 'edit' ? folderDlg.folder.sharedWith : (folderDlg.parent?.sharedWith ?? [])}
          appliesToContents={folderDlg.mode === 'edit'}
          onClose={() => setFolderDlg(null)}
          onSubmit={async (name, visibility, sharedWith) => {
            if (folderDlg.mode === 'create') {
              const f = await api.addFolder({ name, parentId: folderDlg.parent?.id ?? null, visibility, sharedWith });
              setView({ kind: 'folder', folderId: f.id });
              setSearch('');
            } else {
              const f = folderDlg.folder;
              if (name !== f.name) await api.renameFolder(f.id, name);
              const sameShared = JSON.stringify([...sharedWith].sort()) === JSON.stringify([...f.sharedWith].sort());
              if (visibility !== f.visibility || !sameShared) await api.setFolderVisibility(f.id, visibility, sharedWith);
            }
          }}
        />
      )}

      <ConfirmationModal
        isOpen={!!deleteNoteTarget}
        onClose={() => setDeleteNoteTarget(null)}
        onConfirm={handleDeleteNote}
        title="ノートを削除"
        titleClassName="text-red-600"
        confirmLabel="削除する"
      >
        <p>「{deleteNoteTarget?.title || '(無題)'}」を削除します。この操作は元に戻せません。</p>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={!!deleteFolderTarget}
        onClose={() => setDeleteFolderTarget(null)}
        onConfirm={handleDeleteFolder}
        title="フォルダを削除"
        titleClassName="text-red-600"
        confirmLabel="削除する"
      >
        <p>フォルダ「{deleteFolderTarget?.name}」を削除します。</p>
        <p className="mt-2 text-sm">中のノートは削除されず「未整理」に移動します。サブフォルダがある場合は、サブフォルダも削除されます。</p>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={!!announceTarget}
        onClose={() => setAnnounceTarget(null)}
        onConfirm={handleAnnounce}
        title={announceTarget?.isAnnouncement ? '再周知しますか?' : '周知しますか?'}
        confirmLabel={announceTarget?.isAnnouncement ? '再周知する' : '周知する'}
      >
        {announceTarget && (
          <>
            <p>「{announceTarget.title || '(無題)'}」を、閲覧できる {getRecipients(announceTarget, users).length} 名に周知します。</p>
            <p className="mt-2 text-sm">対象の方にはプッシュ通知(通知を許可している場合)とヘッダーのバッジでお知らせし、「確認しました」の状況を確認できます。</p>
            {announceTarget.isAnnouncement && <p className="mt-2 text-sm text-amber-600">再周知すると、これまでの確認状況はリセットされます。</p>}
          </>
        )}
      </ConfirmationModal>
    </div>,
    document.body
  );
};

export default NotesPanel;
