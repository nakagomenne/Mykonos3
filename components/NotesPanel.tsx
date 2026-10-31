import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Note, NoteFolder, NoteTemplate, NoteVisibility, User } from '../types';
import type { NotesApi } from '../hooks/useNotes';
import {
  VISIBILITY_ICONS, VISIBILITY_LABELS, fetchTemplates, getRecipients, uploadNoteImage,
} from '../services/notesService';
import type { NotePatch } from '../services/notesService';
import NoteEditor, { htmlToPlainText } from './NoteEditor';
import NoteVisibilityPicker from './NoteVisibilityPicker';
import NoteFolderDialog from './NoteFolderDialog';
import NoteReadStatus from './NoteReadStatus';
import NoteConfirmDialog from './NoteConfirmDialog';
import NotesHelpModal from './NotesHelpModal';
import ConfirmationModal from './ConfirmationModal';
import { XMarkIcon, PlusIcon, TrashIcon, ChevronLeftIcon, MagnifyingGlassIcon } from './icons';

type View =
  | { kind: 'pinned' }
  | { kind: 'unsorted' }
  | { kind: 'mine' }
  | { kind: 'announce' }
  | { kind: 'hiddenAnnounce' }
  | { kind: 'shared' }
  | { kind: 'folder'; folderId: string };

type MobileStep = 'folders' | 'list' | 'note';

type FolderDlg =
  | { mode: 'create'; parent: NoteFolder | null }
  | { mode: 'edit'; folder: NoteFolder };

/** 「新規ノート」で開く未保存の下書き(「保存」を押すまでDBには作られない) */
interface NoteDraft {
  title: string;
  body: string;
  folderId: string | null;
  visibility: NoteVisibility;
  sharedWith: string[];
  tags: string[];
  pinned: boolean;
}

/** 既存ノートの「編集中」の内容(「保存」を押すまでDBには反映しない) */
interface NoteEditDraft {
  id: string;
  title: string;
  body: string;
  folderId: string | null;
  visibility: NoteVisibility;
  sharedWith: string[];
  tags: string[];
}

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
    notes, folders, reads, loading, unavailable, error, saveState, myReadIds, myHiddenIds, unreadAnnouncements,
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
  const [confirmTarget, setConfirmTarget] = useState<Note | null>(null);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  /** 編集モードで開いているノートのID(それ以外のノートは閲覧モード) */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 編集中の下書き(自動保存しない。「保存」で反映、「キャンセル」で破棄) */
  const [editDraft, setEditDraft] = useState<NoteEditDraft | null>(null);
  const beginEdit = (n: Note) => {
    setEditingId(n.id);
    setEditDraft({
      id: n.id, title: n.title, body: n.body, folderId: n.folderId,
      visibility: n.visibility, sharedWith: [...n.sharedWith], tags: [...n.tags],
    });
  };
  const endEdit = () => { setEditingId(null); setEditDraft(null); };
  /** PC表示でノート一覧をバー状にたたむか(ノートを開くとたたまれ、バーを押すと開く) */
  const [listCollapsed, setListCollapsed] = useState(!!initialNoteId);
  /** PC表示でフォルダ欄をバー状にたたむか(ノートを開くとたたまれ、バーを押すと開く) */
  const [foldersCollapsed, setFoldersCollapsed] = useState(!!initialNoteId);
  /** ノートを開いたとき: フォルダ欄・ノート一覧の両方をたたむ */
  const foldPanes = () => { setListCollapsed(true); setFoldersCollapsed(true); };

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
    setDraft(null);
    endEdit();
    foldPanes();
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
        case 'announce': base = notes.filter(n => n.isAnnouncement && !myHiddenIds.has(n.id)); break;
        case 'hiddenAnnounce': base = notes.filter(n => n.isAnnouncement && myHiddenIds.has(n.id)); break;
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
  }, [notes, myNotes, otherNotes, myFolders, view, search, myHiddenIds]);

  const selected = notes.find(n => n.id === selectedId) ?? null;
  const isOwner = !!selected && selected.owner === me.name;
  const isEditing = !!selected && isOwner && editingId === selected.id;
  // 開いているノート(または新規下書き)があるときだけ、一覧をたためる
  const listFolded = listCollapsed && (!!selected || !!draft);
  const foldersFolded = foldersCollapsed && (!!selected || !!draft);
  const currentFolder = view.kind === 'folder' ? folders.find(f => f.id === view.folderId) ?? null : null;

  // 選択中のノートが消えた(削除・非公開化など)ら選択解除
  useEffect(() => {
    if (selectedId && !notes.some(n => n.id === selectedId)) {
      endEdit();
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

  /** 「新規ノート」: ここではまだ作成せず、空の下書きを開く */
  const handleNewNote = () => {
    if (draft) { foldPanes(); setStep('note'); return; }
    const folder = view.kind === 'folder' ? myFolders.find(f => f.id === view.folderId) : undefined;
    setLocalError(null);
    setSearch('');
    setSettingsOpen(false);
    setTagInput('');
    if (view.kind === 'shared' || view.kind === 'announce' || view.kind === 'hiddenAnnounce') setView({ kind: 'mine' });
    setSelectedId(null);
    endEdit();
    foldPanes();
    setDraft({
      title: '',
      body: '',
      folderId: folder?.id ?? null,
      visibility: folder?.visibility ?? 'private',
      sharedWith: folder?.sharedWith ?? [],
      tags: [],
      pinned: view.kind === 'pinned',
    });
    setStep('note');
  };

  /** 「保存」: ここで初めてノートを作成する */
  const handleSaveDraft = () => draft && run(async () => {
    const pendingTag = tagInput.trim().replace(/^#/, '');
    const tags = pendingTag && !draft.tags.includes(pendingTag) ? [...draft.tags, pendingTag] : draft.tags;
    if (!draft.title.trim() && !draft.body) {
      throw new Error('タイトルか本文を入力してから保存してください');
    }
    const note = await api.addNote({
      title: draft.title,
      body: draft.body,
      folderId: draft.folderId,
      visibility: draft.visibility,
      sharedWith: draft.sharedWith,
      tags,
      pinned: draft.pinned,
    });
    setDraft(null);
    setTagInput('');
    setSearch('');
    endEdit();
    setSelectedId(note.id);
    setStep('note');
  });

  const draftDirty = !!draft && (
    !!draft.title.trim() || !!draft.body || draft.tags.length > 0 || !!tagInput.trim()
  );

  /** 既存ノートの編集中に、まだ「保存」していない変更があるか */
  const editDirty = !!selected && isEditing && !!editDraft && editDraft.id === selected.id && (
    editDraft.title !== selected.title ||
    editDraft.body !== selected.body ||
    editDraft.folderId !== selected.folderId ||
    editDraft.visibility !== selected.visibility ||
    editDraft.sharedWith.join('\n') !== selected.sharedWith.join('\n') ||
    editDraft.tags.join('\n') !== selected.tags.join('\n') ||
    !!tagInput.trim()
  );
  const hasUnsaved = draftDirty || editDirty;

  // 保存していない内容があるままタブを閉じる/リロードしようとしたら、ブラウザの確認を出す
  useEffect(() => {
    if (!hasUnsaved) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsaved]);

  /** 保存していない内容を捨てて別の操作をする。内容があるときは確認する */
  const guard = (fn: () => void) => {
    if (hasUnsaved) { setPendingAction(() => fn); return; }
    setDraft(null);
    fn();
  };
  const requestClose = () => guard(onClose);

  const addDraftTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (!t) return;
    setDraft(dr => (dr && !dr.tags.includes(t) ? { ...dr, tags: [...dr.tags, t] } : dr));
    setTagInput('');
  };

  const handleCopy = () => selected && run(async () => {
    const created = await api.copyToMine(selected);
    setSearch('');
    setView({ kind: 'unsorted' });
    setSelectedId(created.id);
    beginEdit(created);
    foldPanes();
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

  /** 周知の「確認しました」ダイアログで、キャンセル以外を選んだとき(確認済み+非表示。必要ならコピーも作る) */
  const handleConfirmHide = (copy: boolean) => confirmTarget && run(async () => {
    const target = confirmTarget;
    // 先に「確認済み+非表示」を記録する(DBの更新漏れなどで失敗したとき、コピーだけが増えないように)
    await api.hideAnnouncement(target.id);
    let created: Note | null = null;
    if (copy) {
      try {
        created = await api.copyToMine(target);
      } catch (e) {
        try { await api.unhideAnnouncement(target.id); } catch { /* 戻せなくても「非表示の周知一覧」から見られる */ }
        throw e;
      }
    }
    setConfirmTarget(null);
    if (created) {
      setSearch('');
      setView({ kind: 'unsorted' });
      setSelectedId(created.id);
      endEdit();
      foldPanes();
      setStep('note');
    } else if (view.kind === 'announce' && selectedId === target.id) {
      setSelectedId(null);   // 非表示にした周知は一覧から消えるので、開いたままにしない
      setStep('list');
    }
  });

  const patchEdit = (p: Partial<NoteEditDraft>) => setEditDraft(cur => (cur ? { ...cur, ...p } : cur));

  // 公開範囲・フォルダ: 編集中は下書きに、閲覧中はその場で保存する(本文の編集とは独立)
  const changeVisibility = (id: string, v: NoteVisibility, sh: string[]) => {
    if (isEditing) patchEdit({ visibility: v, sharedWith: sh });
    else api.editNote(id, { visibility: v, sharedWith: sh }, { immediate: true });
  };
  const changeFolder = (id: string, folderId: string | null) => {
    if (isEditing) patchEdit({ folderId });
    else api.editNote(id, { folderId }, { immediate: true });
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (!t) return;
    setEditDraft(cur => (cur && !cur.tags.includes(t) ? { ...cur, tags: [...cur.tags, t] } : cur));
    setTagInput('');
  };

  /** 編集中の「保存」: ここで初めて変更をDBに反映する(自動保存はしない) */
  const handleSaveEdit = () => selected && editDraft && run(async () => {
    const n = selected;
    const dr = editDraft;
    const pendingTag = tagInput.trim().replace(/^#/, '');
    const tags = pendingTag && !dr.tags.includes(pendingTag) ? [...dr.tags, pendingTag] : dr.tags;
    const patch: NotePatch = {};
    if (dr.title !== n.title) patch.title = dr.title;
    if (dr.body !== n.body) patch.body = dr.body;
    if (dr.folderId !== n.folderId) patch.folderId = dr.folderId;
    if (dr.visibility !== n.visibility || dr.sharedWith.join('\n') !== n.sharedWith.join('\n')) {
      patch.visibility = dr.visibility;
      patch.sharedWith = dr.sharedWith;
    }
    if (tags.join('\n') !== n.tags.join('\n')) patch.tags = tags;
    if (Object.keys(patch).length > 0) await api.saveNote(n.id, patch);
    endEdit();
    setSettingsOpen(false);
    setTagInput('');
  });

  /** 編集中の「キャンセル」: 変更を捨てて閲覧モードに戻る(未保存の変更があれば確認) */
  const cancelEdit = () => guard(() => { endEdit(); setSettingsOpen(false); setTagInput(''); });

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

  const selectView = (v: View) => guard(() => {
    setListCollapsed(false);
    setView(v);
    setSearch('');
    setStep('list');
  });

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
      case 'hiddenAnnounce': return '🙈 非表示の周知一覧';
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
        onClick={() => guard(() => { endEdit(); setSelectedId(n.id); foldPanes(); setStep('note'); })}
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
  const renderDraftPane = (dr: NoteDraft) => {
    const patch = (p: Partial<NoteDraft>) => setDraft(cur => (cur ? { ...cur, ...p } : cur));
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {/* 未保存バー */}
        <div className={`sticky top-0 z-20 px-4 py-2.5 flex items-center gap-2 border-b ${d ? 'bg-amber-900/40 border-amber-700' : 'bg-amber-50 border-amber-300'}`}>
          <span className="text-sm font-bold text-amber-600 flex-1 min-w-0 truncate">📝 新規ノート<span className={`ml-2 text-xs font-normal ${muted}`}>まだ保存されていません</span></span>
          <button
            onClick={() => guard(() => setStep('list'))}
            disabled={busy}
            className={`text-sm px-3 py-1.5 rounded-md border ${border} ${hoverRow} disabled:opacity-50`}
          >キャンセル</button>
          <button
            onClick={handleSaveDraft}
            disabled={busy}
            className="text-sm px-5 py-1.5 rounded-md font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50"
          >{busy ? '保存中…' : '保存'}</button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            <input
              value={dr.title}
              onChange={e => patch({ title: e.target.value })}
              placeholder="タイトル"
              autoFocus
              className={`flex-1 text-xl font-bold bg-transparent border-b-2 ${border} focus:border-[#0193be] focus:outline-none py-1`}
            />
            <button
              onClick={() => patch({ pinned: !dr.pinned })}
              title={dr.pinned ? 'ピン留めを外す' : 'ピン留め'}
              className={`text-xl px-1 ${dr.pinned ? 'text-amber-500' : muted}`}
            >{dr.pinned ? '★' : '☆'}</button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              onClick={() => setSettingsOpen(o => !o)}
              title="このノートを誰が見られるかを選びます"
              className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition ${settingsOpen ? 'border-[#0193be] bg-[#0193be]/10 text-[#0193be]' : `${border} ${hoverRow}`}`}
            >
              <span className={`text-xs ${muted}`}>公開範囲</span>
              <span className="font-bold">{VISIBILITY_ICONS[dr.visibility]} {VISIBILITY_LABELS[dr.visibility]}{dr.visibility === 'members' ? `(${dr.sharedWith.length}名)` : ''}</span>
              <span className="text-[10px]">{settingsOpen ? '▲' : '▼'}</span>
            </button>
            <label className="inline-flex items-center gap-1.5">
              <span className={`text-xs ${muted}`}>フォルダ</span>
              <select
                value={dr.folderId ?? ''}
                onChange={e => patch({ folderId: e.target.value || null })}
                className={inputCls}
              >
                <option value="">📥 未設定</option>
                {flatFolders.map(({ folder, depth }) => (
                  <option key={folder.id} value={folder.id}>{depth ? '　└ ' : ''}{folder.name}</option>
                ))}
              </select>
            </label>
            <div className="inline-flex items-center gap-1 flex-wrap">
              <span className={`text-xs ${muted}`}>タグ</span>
              {dr.tags.map(t => (
                <span key={t} className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${d ? 'bg-slate-700' : 'bg-slate-200'}`}>
                  #{t}
                  <button onClick={() => patch({ tags: dr.tags.filter(x => x !== t) })} className="hover:text-red-500" aria-label={`タグ ${t} を外す`}>×</button>
                </span>
              ))}
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addDraftTag(); } }}
                onBlur={addDraftTag}
                placeholder="＋タグ"
                className={`${inputCls} w-24 !py-0.5 text-xs`}
              />
            </div>
          </div>

          {settingsOpen && (
            <div className={`rounded-lg border ${border} ${surface2} p-3 space-y-2`}>
              <div className={`text-xs ${muted}`}>このノートを誰が見られるかを選びます。「保存」を押すと反映されます。</div>
              <NoteVisibilityPicker
                visibility={dr.visibility}
                sharedWith={dr.sharedWith}
                users={users}
                owner={me.name}
                isDarkMode={d}
                onChange={(v: NoteVisibility, sh: string[]) => patch({ visibility: v, sharedWith: sh })}
              />
            </div>
          )}

          <div className={`text-xs ${muted}`}>※ 「周知」は、保存してから行えます。</div>

          <NoteEditor
            key="draft"
            value={dr.body}
            editable
            toolbarTop={54}
            isDarkMode={d}
            onChange={html => patch({ body: html })}
            onUploadImage={file => uploadNoteImage(file, me.name)}
            templates={templates}
            onError={setLocalError}
          />

          <div className="pt-2 flex justify-end gap-2">
            <button
              onClick={() => guard(() => setStep('list'))}
              disabled={busy}
              className={`text-sm px-4 py-2 rounded-md border ${border} ${hoverRow} disabled:opacity-50`}
            >キャンセル</button>
            <button
              onClick={handleSaveDraft}
              disabled={busy}
              className="text-sm px-6 py-2 rounded-md font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50"
            >{busy ? '保存中…' : '保存'}</button>
          </div>
        </div>
      </div>
    );
  };

  const renderNotePane = () => {
    if (draft) return renderDraftPane(draft);
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
    const iHidden = myHiddenIds.has(n.id);
    const snap = n.sourceSnapshot;
    const folderOptions = flatFolders;
    const folderName = n.folderId ? folders.find(f => f.id === n.folderId)?.name : undefined;
    const e = isEditing && editDraft && editDraft.id === n.id ? editDraft : null;
    const shown = e ?? n;   // 編集中は下書き、それ以外は保存済みの内容
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {isOwner && isEditing && (
          <div className={`sticky top-0 z-20 px-4 py-2.5 flex items-center gap-2 border-b ${d ? 'bg-sky-900/40 border-sky-700' : 'bg-sky-50 border-sky-300'}`}>
            <>
                <span className={`text-sm font-bold flex-1 min-w-0 truncate ${d ? 'text-sky-300' : 'text-[#01607a]'}`}>
                  ✏️ 編集中
                  <span className={`ml-2 text-xs font-normal ${editDirty ? 'text-amber-600' : muted}`}>
                    {editDirty ? '未保存の変更があります' : '「保存」を押すと反映されます'}
                  </span>
                </span>
                <button
                  onClick={cancelEdit}
                  disabled={busy}
                  className={`text-sm px-3 py-1.5 rounded-md border ${border} ${hoverRow} disabled:opacity-50`}
                >キャンセル</button>
                <button
                  onClick={handleSaveEdit}
                  disabled={busy}
                  className="text-sm px-5 py-1.5 rounded-md font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50"
                >{busy ? '保存中…' : '保存'}</button>
            </>
          </div>
        )}
        {n.isAnnouncement && !isOwner && (
          <div className={`px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b ${border} ${iRead ? (d ? 'bg-emerald-900/30' : 'bg-emerald-50') : (d ? 'bg-amber-900/30' : 'bg-amber-50')}`}>
            <span className="text-sm flex-1 min-w-[200px]">
              {iRead
                ? (iHidden ? '✅ 確認済みで、周知の一覧では非表示にしています' : '✅ このお知らせを確認済みです')
                : `📣 ${n.owner} さんからの周知です。内容を読んだら「確認しました」を押してください。`}
            </span>
            {!iRead && (
              <button
                onClick={() => { setLocalError(null); setConfirmTarget(n); }}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50"
              >確認しました</button>
            )}
            {iRead && !iHidden && (
              <button
                onClick={() => { setLocalError(null); setConfirmTarget(n); }}
                disabled={busy}
                className={`px-3 py-1.5 rounded-md text-sm font-bold border ${border} ${hoverRow} disabled:opacity-50`}
              >非表示にする</button>
            )}
            {iHidden && (
              <button
                onClick={() => run(() => api.unhideAnnouncement(n.id))}
                disabled={busy}
                className={`px-3 py-1.5 rounded-md text-sm font-bold border ${border} ${hoverRow} disabled:opacity-50`}
              >周知の一覧に戻す</button>
            )}
          </div>
        )}
        {n.isAnnouncement && (isOwner || isAdmin) && (
          <div className={`px-4 py-2.5 border-b ${border}`}>
            <NoteReadStatus note={n} users={users} reads={reads} isDarkMode={d} />
          </div>
        )}

        <div className="p-4 space-y-3">
          {/* タイトル */}
          <div className="flex flex-wrap items-center gap-2">
            <div className={`flex-1 min-w-[14rem] rounded-lg border px-3 py-2 transition-colors ${border} ${surface2} ${isEditing ? 'focus-within:border-[#0193be]' : ''}`}>
              <input
                value={shown.title}
                readOnly={!isEditing}
                onChange={ev => patchEdit({ title: ev.target.value })}
                placeholder={isEditing ? 'タイトル' : '(無題)'}
                className={`w-full min-w-0 text-xl font-bold bg-transparent focus:outline-none ${isEditing ? '' : 'cursor-default'}`}
              />
            </div>
            {isOwner && (
              <button
                onClick={() => api.editNote(n.id, { pinned: !n.pinned }, { immediate: true })}
                title={n.pinned ? 'ピン留めを外す' : 'ピン留め'}
                className={`text-xl px-1 ${n.pinned ? 'text-amber-500' : muted}`}
              >{n.pinned ? '★' : '☆'}</button>
            )}
            {!isOwner && (
              <button onClick={handleCopy} disabled={busy} className="ml-auto text-sm px-3 py-2 rounded-md font-semibold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50 whitespace-nowrap">
                📄 自分用にコピーして編集
              </button>
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
                  <span className="font-bold">{VISIBILITY_ICONS[shown.visibility]} {VISIBILITY_LABELS[shown.visibility]}{shown.visibility === 'members' ? `(${shown.sharedWith.length}名)` : ''}</span>
                  <span className="text-[10px]">{settingsOpen ? '▲' : '▼'}</span>
                </button>
                <label className="inline-flex items-center gap-1.5">
                  <span className={`text-xs ${muted}`}>フォルダ</span>
                  <select
                    value={shown.folderId ?? ''}
                    onChange={ev => changeFolder(n.id, ev.target.value || null)}
                    className={inputCls}
                  >
                    <option value="">📥 未設定</option>
                    {folderOptions.map(({ folder, depth }) => (
                      <option key={folder.id} value={folder.id}>{depth ? '　└ ' : ''}{folder.name}</option>
                    ))}
                  </select>
                </label>
                {isEditing ? (
                  <div className="inline-flex items-center gap-1 flex-wrap">
                    <span className={`text-xs ${muted}`}>タグ</span>
                    {shown.tags.map(t => (
                      <span key={t} className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${d ? 'bg-slate-700' : 'bg-slate-200'}`}>
                        #{t}
                        <button onClick={() => patchEdit({ tags: shown.tags.filter(x => x !== t) })} className="hover:text-red-500" aria-label={`タグ ${t} を外す`}>×</button>
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
                ) : n.tags.map(t => <span key={t} className={`text-xs rounded-full px-2 py-0.5 ${d ? 'bg-slate-700' : 'bg-slate-200'}`}>#{t}</span>)}
              </div>

              {settingsOpen && (
                <div className={`rounded-lg border ${border} ${surface2} p-3 space-y-2`}>
                  <div className={`text-xs ${muted}`}>
                    このノートを誰が見られるかを選びます。{isEditing ? '「保存」を押すと反映されます。' : '選ぶとすぐに反映されます。'}
                  </div>
                  <NoteVisibilityPicker
                    visibility={shown.visibility}
                    sharedWith={shown.sharedWith}
                    users={users}
                    owner={n.owner}
                    isDarkMode={d}
                    onChange={(v: NoteVisibility, sh: string[]) => changeVisibility(n.id, v, sh)}
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
                    <button onClick={() => setAnnounceTarget(n)} disabled={editDirty} className={`text-xs px-2.5 py-1 rounded-md border ${border} ${hoverRow} disabled:opacity-50`} title={editDirty ? '先に「保存」してください' : '内容を直したときなど、もう一度確認してもらいます'}>再周知する</button>
                    <button onClick={() => run(() => api.unannounce(n.id))} disabled={editDirty} className={`text-xs px-2.5 py-1 rounded-md border ${border} ${hoverRow} disabled:opacity-50`}>周知をやめる</button>
                  </>
                ) : (
                  <>
                    <span className="text-sm flex-1 min-w-[200px]">📣 <b>周知</b><span className={`ml-2 text-xs ${muted}`}>通知を送り、誰が読んだかを確認できます</span></span>
                    <button onClick={() => setAnnounceTarget(n)} disabled={editDirty} title={editDirty ? '先に「保存」してください' : undefined} className="text-sm px-4 py-1.5 rounded-md font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50">📣 周知する</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              {n.tags.map(t => <span key={t} className={`text-xs rounded-full px-2 py-0.5 ${d ? 'bg-slate-700' : 'bg-slate-200'}`}>#{t}</span>)}
              <span className={`text-xs ${muted}`}>他の人のノートは読み取り専用です</span>
            </div>
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
          <div className={isEditing ? '' : `rounded-lg border ${border} ${surface2} p-4 min-h-[8rem]`}>
            {(isEditing || n.body) && <NoteEditor
              key={n.id + (isEditing ? ':e' : ':r')}
              value={e ? e.body : n.body}
              editable={isEditing}
              isDarkMode={d}
              toolbarTop={isOwner ? 54 : 0}
              onChange={html => patchEdit({ body: html })}
              onUploadImage={isEditing ? file => uploadNoteImage(file, me.name) : undefined}
              templates={isEditing ? templates : undefined}
              onError={setLocalError}
            />}
            {!isEditing && !n.body && (
              <div className={`text-sm text-left ${muted}`}>本文はまだありません。{isOwner ? '「✏️ 編集」から書き込めます。' : ''}</div>
            )}
          </div>

          {isOwner && (
            <div className="pt-2 flex justify-end items-center gap-2">
              {!isEditing && (
                <button
                  onClick={() => { setSettingsOpen(false); beginEdit(n); }}
                  className="text-sm px-5 py-1.5 rounded-md font-bold text-white bg-[#0193be] hover:bg-[#017a9c] inline-flex items-center gap-1"
                >✏️ 編集</button>
              )}
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
    <div className="fixed inset-0 z-[45] bg-black/60 flex items-stretch justify-center md:p-4" onClick={requestClose}>
      <div className={`${surface} w-full max-w-7xl md:rounded-xl shadow-2xl flex flex-col min-h-0 overflow-hidden`} onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="px-3 md:px-4 py-2.5 flex items-center gap-2 md:gap-3 text-white" style={{ backgroundColor: '#0193be' }}>
          {step !== 'folders' && (
            <button
              className="md:hidden p-1 -ml-1"
              onClick={() => (step === 'note' ? guard(() => setStep('list')) : setStep('folders'))}
              aria-label="戻る"
            ><ChevronLeftIcon className="w-5 h-5" /></button>
          )}
          <h2 className="font-bold text-base md:text-lg whitespace-nowrap">📓<span className="hidden sm:inline"> ノート</span></h2>
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); if (e.target.value) setListCollapsed(false); if (e.target.value && step === 'folders') setStep('list'); }}
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
          <button onClick={requestClose} className="p-1 hover:bg-white/20 rounded" aria-label="閉じる"><XMarkIcon className="w-6 h-6" /></button>
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
            <aside
              className={`${step === 'folders' ? 'flex' : 'hidden'} md:flex w-full flex-shrink-0 flex-col min-h-0 overflow-hidden ${surface2} md:transition-[width] md:duration-200 ${
                foldersFolded ? 'md:w-0 md:invisible' : `md:w-56 lg:w-60 border-r ${border}`}`}
            >
             <div className="flex flex-col flex-1 min-h-0 w-full md:w-56 lg:w-60 overflow-y-auto p-2 gap-0.5">
              <div className={`px-2 pt-1 pb-0.5 text-[11px] font-bold tracking-wide ${muted} flex items-center justify-between`}>
                <span>自分のノート</span>
                {(selected || draft) && (
                  <button
                    onClick={() => setFoldersCollapsed(true)}
                    title="フォルダ欄をたたんで本文を広く表示します"
                    aria-label="フォルダ欄をたたむ"
                    className={`hidden md:inline-flex items-center justify-center w-6 h-6 rounded text-xs ${muted} ${hoverRow}`}
                  >◀</button>
                )}
              </div>
              <SideItem v={{ kind: 'mine' }} icon="📝" label="すべて" count={myNotes.length} />
              <SideItem v={{ kind: 'pinned' }} icon="★" label="ピン留め" count={myNotes.filter(n => n.pinned).length} />
              <SideItem v={{ kind: 'unsorted' }} icon="📥" label="フォルダ未設定" count={myNotes.filter(n => !n.folderId).length} />

              <div className={`px-2 pt-3 pb-0.5 text-[11px] font-bold tracking-wide ${muted}`}>みんなから</div>
              <SideItem v={{ kind: 'announce' }} icon="📣" label="周知(お知らせ)" badge={unreadAnnouncements.length} count={notes.filter(n => n.isAnnouncement && !myHiddenIds.has(n.id)).length} />
              <SideItem v={{ kind: 'hiddenAnnounce' }} icon="🙈" label="非表示の周知一覧" count={notes.filter(n => n.isAnnouncement && myHiddenIds.has(n.id)).length} />
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
             </div>
            </aside>

            {/* ①' たたまれたフォルダバー(PCのみ・クリックで展開) */}
            {foldersFolded && (
              <button
                onClick={() => setFoldersCollapsed(false)}
                title="フォルダ欄を開く"
                aria-label="フォルダ欄を開く"
                className={`hidden md:flex w-9 flex-shrink-0 flex-col items-center gap-3 pt-3 border-r ${border} ${surface2} ${hoverRow} transition`}
              >
                <span className={`text-sm ${d ? 'text-sky-300' : 'text-[#0193be]'}`}>▶</span>
                <span className={`text-xs font-semibold whitespace-nowrap flex-shrink-0 ${muted}`} style={{ writingMode: 'vertical-rl', letterSpacing: '0.15em', height: '5em' }}>
                  フォルダ
                </span>
              </button>
            )}

            {/* ② ノート一覧 */}
            <section
              className={`${step === 'list' ? 'flex' : 'hidden'} md:flex w-full flex-shrink-0 flex-col min-h-0 overflow-hidden md:transition-[width] md:duration-200 ${
                listFolded ? 'md:w-0 md:invisible' : `md:w-72 lg:w-80 border-r ${border}`}`}
            >
             <div className="flex flex-col flex-1 min-h-0 w-full md:w-72 lg:w-80">
              <div className={`px-3 py-2 text-sm font-bold border-b ${border} flex items-center justify-between gap-2`}>
                <button onClick={() => setStep('folders')} className={`md:hidden flex-shrink-0 text-xs font-semibold px-2 py-1 rounded border ${border}`}>📂 フォルダ</button>
                <span className="truncate flex-1">{viewTitle}</span>
                <span className={`text-xs font-normal ${muted}`}>{visibleNotes.length}件</span>
                {(selected || draft) && (
                  <button
                    onClick={() => setListCollapsed(true)}
                    title="一覧をたたんで本文を広く表示します"
                    aria-label="一覧をたたむ"
                    className={`hidden md:inline-flex flex-shrink-0 items-center justify-center w-6 h-6 rounded text-xs ${muted} ${hoverRow}`}
                  >◀</button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {draft && (
                  <button
                    onClick={() => setStep('note')}
                    className={`w-full text-left px-3 py-2.5 border-b ${border} ${d ? 'bg-amber-900/30' : 'bg-amber-50'}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`truncate flex-1 text-sm font-semibold ${draft.title ? '' : muted}`}>{draft.title || '(無題)'}</span>
                      <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5">未保存</span>
                    </div>
                    <div className={`text-xs mt-0.5 ${muted}`}>新規ノート — 「保存」を押すと作成されます</div>
                  </button>
                )}
                {loading && notes.length === 0 ? (
                  <div className={`p-4 text-sm ${muted}`}>読み込み中…</div>
                ) : visibleNotes.length === 0 ? (
                  draft ? null : <div className={`p-4 text-sm ${muted}`}>
                    {search.trim() ? '一致するノートがありません。' : view.kind === 'announce' ? '周知されているノートはありません。' : view.kind === 'hiddenAnnounce' ? '非表示にした周知はありません。' : 'ノートがありません。「＋ 新規ノート」で作成できます。'}
                  </div>
                ) : visibleNotes.map(n => <NoteRow key={n.id} n={n} />)}
              </div>
             </div>
            </section>

            {/* ②' たたまれた一覧バー(PCのみ・クリックで展開) */}
            {listFolded && (
              <button
                onClick={() => setListCollapsed(false)}
                title="ノート一覧を開く"
                aria-label="ノート一覧を開く"
                className={`hidden md:flex w-9 flex-shrink-0 flex-col items-center gap-3 pt-3 border-r ${border} ${surface2} ${hoverRow} transition`}
              >
                <span className={`text-sm ${d ? 'text-sky-300' : 'text-[#0193be]'}`}>▶</span>
                <span className={`text-xs font-semibold whitespace-nowrap flex-shrink-0 ${muted}`} style={{ writingMode: 'vertical-rl', letterSpacing: '0.15em', height: '6em' }}>
                  ノート一覧
                </span>
                <span className={`flex-shrink-0 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${d ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'}`}>{visibleNotes.length}</span>
              </button>
            )}

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
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          const fn = pendingAction;
          setPendingAction(null);
          setDraft(null);
          endEdit();
          setTagInput('');
          fn?.();
        }}
        title="保存していない内容があります"
        titleClassName="text-red-600"
        confirmLabel="破棄して移動"
        cancelLabel="編集に戻る"
      >
        <p>{editDirty ? 'ノートの変更はまだ保存されていません。このまま進むと、変更は破棄されます。' : '新規ノートはまだ保存されていません。このまま移動すると、入力した内容は破棄されます。'}</p>
      </ConfirmationModal>

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

      <NoteConfirmDialog
        isOpen={!!confirmTarget}
        noteTitle={confirmTarget?.title ?? ''}
        busy={busy}
        error={localError}
        onCopyAndHide={() => handleConfirmHide(true)}
        onHide={() => handleConfirmHide(false)}
        onCancel={() => { setConfirmTarget(null); setLocalError(null); }}
      />

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
