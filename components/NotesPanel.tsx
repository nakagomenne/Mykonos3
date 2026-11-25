import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Note, NoteFolder, NoteTemplate, NoteVisibility, User } from '../types';
import type { NotesApi } from '../hooks/useNotes';
import {
  VISIBILITY_LABELS, canView, sharedLabel, fetchTemplates, getRecipients, isAnnounceOverdue, formatAnnounceDue, uploadNoteImage, uploadNoteFile,
} from '../services/notesService';
import type { NotePatch } from '../services/notesService';
import NoteEditor, { htmlToPlainText } from './NoteEditor';
import NoteVisibilityPicker from './NoteVisibilityPicker';
import NoteFolderDialog from './NoteFolderDialog';
import { NoteAccordion, AccordionArrow } from './NoteAccordion';
import NoteSharedFolderPicker from './NoteSharedFolderPicker';
import NoteReadStatus from './NoteReadStatus';
import NoteComments from './NoteComments';
import { noteLinkUrl } from './noteLinks';
import NoteConfirmDialog from './NoteConfirmDialog';
import NotesHelpModal from './NotesHelpModal';
import NoteHistoryModal from './NoteHistoryModal';
import { NoteIcon, VisibilityIcon } from './NoteIcons';
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

/** 「新規ノート」で開く未保存の下書き(「保存」を押すまでDBには作られない) */
interface NoteDraft {
  title: string;
  body: string;
  folderId: string | null;
  visibility: NoteVisibility;
  sharedWith: string[];
  tags: string[];
  pinned: boolean;
  /** 保存と同時にアナウンスするか */
  announce?: boolean;
  /** アナウンスを「重要」にするか */
  announceImportant?: boolean;
  /** アナウンスの確認期限(YYYY-MM-DD。なしは空文字) */
  announceDue?: string;
}

/** 既存ノートの「編集中」の内容(「保存」を押すまでDBには反映しない) */
interface NoteEditDraft {
  id: string;
  title: string;
  body: string;
  /** 編集を始めたときのタイトル・本文(その後に他の人が更新したかを見分けるため) */
  baseTitle?: string;
  baseBody?: string;
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

/** 一覧の並び順(ピン留めは常に先頭) */
type SortKey = 'updated' | 'created' | 'title' | 'manual';
const SORT_LABELS: Record<SortKey, string> = { updated: '更新が新しい順', created: '作成が新しい順', title: 'タイトル順', manual: '自分で並べた順' };

/** 並べ替え: ids の中で dragId を、targetId の前(after=false)か後ろ(after=true)へ動かす */
function moveInList(ids: string[], dragId: string, targetId: string, after: boolean): string[] {
  if (dragId === targetId || !ids.includes(dragId) || !ids.includes(targetId)) return ids;
  const rest = ids.filter(id => id !== dragId);
  const at = rest.indexOf(targetId) + (after ? 1 : 0);
  return [...rest.slice(0, at), dragId, ...rest.slice(at)];
}
/**
 * 全体の並び(all)のうち、いま見えている一部(subset)だけを並べ替えた結果を、全体の並びに戻す。
 * 見えていない物の位置は動かさない(見えている物が入っていた場所に、新しい順で入れ直す)
 */
function mergeOrder(all: string[], subset: string[]): string[] {
  const inSubset = new Set(subset);
  let i = 0;
  return all.map(id => (inSubset.has(id) ? subset[i++] : id));
}
const SORT_STORAGE_KEY = 'mikonote_sort';
const SHOW_MINE_STORAGE_KEY = 'mikonote_show_mine_in_shared';
const loadSortKey = (): SortKey => {
  try {
    const v = localStorage.getItem(SORT_STORAGE_KEY);
    return v === 'created' || v === 'title' || v === 'manual' ? v : 'updated';
  } catch { return 'updated'; }
};

/**
 * 書きかけの控え(この端末のブラウザ内だけに置く)。
 * 「保存」を押す前に画面が閉じたり固まったりしても、次に開いたときに戻せるようにする。
 */
type NoteBackup =
  | { kind: 'new'; draft: NoteDraft; tagInput: string; savedAt: string }
  | { kind: 'edit'; draft: NoteEditDraft; tagInput: string; baseUpdatedAt: string; savedAt: string };
const backupKey = (userName: string) => `mikonote_backup_${userName}`;
const loadBackup = (userName: string): NoteBackup | null => {
  try {
    const raw = localStorage.getItem(backupKey(userName));
    if (!raw) return null;
    const b = JSON.parse(raw);
    return b && (b.kind === 'new' || b.kind === 'edit') && b.draft ? b as NoteBackup : null;
  } catch { return null; }
};
const storeBackup = (userName: string, b: NoteBackup | null) => {
  try {
    if (b) localStorage.setItem(backupKey(userName), JSON.stringify(b));
    else localStorage.removeItem(backupKey(userName));
  } catch { /* 容量不足などで控えを残せなくても、編集は続けられるようにする */ }
};

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** アナウンスのオプション(重要 / 確認の期限)を選ぶ欄。新規ノートと「アナウンスしますか?」の両方で使う */
const AnnounceOptionFields: React.FC<{
  important: boolean; due: string; dark: boolean;
  onChange: (next: { important: boolean; due: string }) => void;
}> = ({ important, due, dark, onChange }) => {
  const sub = dark ? 'text-slate-400' : 'text-slate-500';
  return (
    <div className={`rounded-lg border px-3 py-2 space-y-2 ${dark ? 'border-slate-600' : 'border-slate-200'}`}>
      <label className="flex flex-wrap items-center gap-x-2 gap-y-1 cursor-pointer">
        <input type="checkbox" checked={important} onChange={e => onChange({ important: e.target.checked, due })} className="w-4 h-4 accent-red-500" />
        <span className="text-sm font-bold text-red-500">重要</span>
        <span className={`text-xs ${sub}`}>まだ確認していない人には、Mykonos を開いたときに画面の中央に表示します</span>
      </label>
      <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-bold">確認の期限</span>
        <input
          type="date" value={due} onChange={e => onChange({ important, due: e.target.value })}
          className={`text-sm rounded-md border px-2 py-1 ${dark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-800'}`}
        />
        {due
          ? <button type="button" onClick={() => onChange({ important, due: '' })} className={`text-xs underline ${sub}`}>期限をなくす</button>
          : <span className={`text-xs ${sub}`}>なしでもかまいません</span>}
      </label>
    </div>
  );
};

/** アナウンスの「重要」「期限」の札(一覧や本文の上で使う) */
const AnnounceBadges: React.FC<{ note: Note; done?: boolean }> = ({ note, done = false }) => {
  const overdue = !done && isAnnounceOverdue(note.announceDue);
  return (
    <>
      {note.announceImportant && <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 whitespace-nowrap">重要</span>}
      {note.announceDue && (
        <span className={`text-[10px] font-bold rounded-full px-1.5 whitespace-nowrap border ${overdue ? 'border-red-500 text-red-500' : 'border-current opacity-80'}`}>
          {overdue ? '期限切れ' : '期限'} {formatAnnounceDue(note.announceDue)}
        </span>
      )}
    </>
  );
};

/**
 * たたむ(◀)/開く(▶)の三角。表示されるたびに、反対向きから180度まわって今の向きになる
 * (たたむ→開く、開く→たたむ で、ボタンがくるっと逆向きになったように見せる)
 */
const FoldArrow: React.FC<{ dir: 'left' | 'right'; className?: string }> = ({ dir, className = '' }) => (
  <svg viewBox="0 0 10 10" width="16" height="16" aria-hidden="true" className={`note-fold-arrow ${dir === 'left' ? 'note-fold-arrow-cw' : ''} ${className}`}>
    <path d={dir === 'left' ? 'M8 1 L2 5 L8 9 Z' : 'M2 1 L8 5 L2 9 Z'} fill="currentColor" />
  </svg>
);

/** 目次の1行(本文の「大見出し」「小見出し」) */
interface OutlineItem { index: number; level: 2 | 3; text: string }

/** 本文(HTML)から、見出し(大見出し=h2 / 小見出し=h3)を上から順に拾う。index は本文の中で何番目の見出しか */
function outlineOf(html: string): OutlineItem[] {
  if (!html || !/<h[23][\s>]/i.test(html)) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: OutlineItem[] = [];
  Array.from(doc.body.querySelectorAll('h2, h3')).forEach((h, index) => {
    const text = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text) out.push({ index, level: h.tagName === 'H2' ? 2 : 3, text });   // 文字のない見出しは目次に出さない
  });
  return out;
}

const outlineCache = new Map<string, { body: string; items: OutlineItem[] }>();
/** ノートの見出し(本文が前と同じなら、前に拾ったものを返す) */
function outlineOfNote(id: string, body: string): OutlineItem[] {
  const hit = outlineCache.get(id);
  if (hit && hit.body === body) return hit.items;
  const items = outlineOf(body);
  outlineCache.set(id, { body, items });
  return items;
}
/** 目次の開閉の動き: ▼が回る時間 / 目次が伸び縮みする時間(ミリ秒) */
const OUTLINE_SPIN_MS = 300;
const OUTLINE_SLIDE_MS = 220;

/** 開いているノートの本文を、index 番目の見出しのところまで動かし、見出しを一瞬光らせる */
function jumpToHeading(index: number): boolean {
  const body = document.querySelector('[data-note-body]');
  const el = body?.querySelectorAll('h2, h3')[index] as HTMLElement | undefined;
  if (!el) return false;
  // たてにスクロールする枠をさがす
  let scroller: HTMLElement | null = el.parentElement;
  while (scroller) {
    const oy = getComputedStyle(scroller).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && scroller.scrollHeight > scroller.clientHeight + 1) break;
    scroller = scroller.parentElement;
  }
  if (!scroller) { el.scrollIntoView({ block: 'start' }); }
  else {
    // 上に張り付く帯(編集中の道具の列など)に隠れないよう、その高さぶん下げる
    let offset = 0;
    scroller.querySelectorAll<HTMLElement>('*').forEach(s => {
      if (s.contains(el)) return;
      const cs = getComputedStyle(s);
      if (cs.position !== 'sticky' || cs.top === 'auto') return;
      const r = s.getBoundingClientRect();
      if (r.height > 0 && r.height < 240) offset = Math.max(offset, (parseFloat(cs.top) || 0) + r.height);
    });
    const top = scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset - 10;
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }
  try {
    el.animate(
      [{ backgroundColor: 'rgba(253,186,116,0.95)', boxShadow: '0 0 0 4px rgba(253,186,116,0.95)' }, { backgroundColor: 'transparent', boxShadow: '0 0 0 4px transparent' }],
      { duration: 1600, easing: 'ease-out' },
    );
  } catch { /* 光らせられなくても、場所へは動いている */ }
  return true;
}

/**
 * たてにスクロールする枠。上や下に隠れている部分があるときだけ、その側にうすい影(グラデーション)を出して、
 * 「まだ続きがある」ことが分かるようにする
 */
const ScrollFade: React.FC<{ dark: boolean; children: React.ReactNode }> = ({ dark, children }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const top = el.scrollTop > 2;
      const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
      setFade(f => (f.top === top && f.bottom === bottom ? f : { top, bottom }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    // 画像の読み込みや、画面の大きさ・本文の変化でも見直す
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, []);
  const shade = dark ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.16)';
  const edge = 'pointer-events-none absolute inset-x-0 h-6 z-[15] transition-opacity duration-200';
  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div ref={innerRef}>{children}</div>
      </div>
      <div aria-hidden="true" className={`${edge} top-0 ${fade.top ? 'opacity-100' : 'opacity-0'}`} style={{ background: `linear-gradient(to bottom, ${shade}, transparent)` }} />
      <div aria-hidden="true" className={`${edge} bottom-0 ${fade.bottom ? 'opacity-100' : 'opacity-0'}`} style={{ background: `linear-gradient(to top, ${shade}, transparent)` }} />
    </div>
  );
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
  /** 「アナウンスしますか?」で選ぶオプション(開くたびに、そのノートの今の設定から始める) */
  const [announceOpts, setAnnounceOpts] = useState<{ important: boolean; due: string }>({ important: false, due: '' });
  useEffect(() => {
    if (announceTarget) setAnnounceOpts({ important: announceTarget.announceImportant, due: announceTarget.announceDue ?? '' });
  }, [announceTarget]);
  const [confirmTarget, setConfirmTarget] = useState<Note | null>(null);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 「アナウンス・共同編集」の設定を開いているか */
  const [moreOpen, setMoreOpen] = useState(false);
  /** 「入れるフォルダ」の選択を開いているか */
  const [folderOpen, setFolderOpen] = useState(false);
  /** 一覧の「絞り込み」の欄を開いているか(ふだんは閉じておき、押したときだけ出す) */
  const [filterOpen, setFilterOpen] = useState(false);
  /** 「未確認の人に再通知」を送り終えたノートのID(ボタンの表示を「送りました」にする) */
  const [remindedId, setRemindedId] = useState<string | null>(null);
  /** 上のバーの「⋯」(削除など)を開いているか */
  const [menuOpen, setMenuOpen] = useState(false);
  /** 「リンクをコピー」を押した直後のノート(ボタンの表示を「コピーしました」にする) */
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const copyNoteLink = (n: Note) => {
    const url = noteLinkUrl(n.id);
    const done = () => {
      setCopiedLinkId(n.id);
      window.setTimeout(() => setCopiedLinkId(id => (id === n.id ? null : id)), 4000);
    };
    const fallback = () => {
      // 古いブラウザ向け: 見えない入力欄からコピーする
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch { setLocalError('リンクをコピーできませんでした'); }
      ta.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done).catch(fallback); else fallback();
  };
  /** ノートへのリンクをコピーするボタン(ミコポス・案件の備考・ほかのノートなどに貼ると、このノートへ飛べる) */
  const linkChip = (n: Note, cls: string) => (
    <>
      <button
        data-note-copy-link
        onClick={() => copyNoteLink(n)}
        title="このノートへのリンクをコピーします。ミコポス・案件の備考・ほかのノートやコメントに貼ると、押すだけでこのノートが開きます"
        className={cls}
      ><NoteIcon name="link" /> {copiedLinkId === n.id ? 'コピーしました' : 'リンクをコピー'}</button>
      {copiedLinkId === n.id && n.visibility === 'private' && (
        <span className="text-xs text-amber-600">このノートは「自分だけ」なので、ほかの人は開けません</span>
      )}
    </>
  );
  /** 歯車のメニュー(サブフォルダ・設定・削除)を開いているフォルダ */
  const [folderMenuId, setFolderMenuId] = useState<string | null>(null);
  /** 「表示する共有フォルダを選ぶ」画面を開いているか */
  const [sharedPickerOpen, setSharedPickerOpen] = useState(false);
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
      id: n.id, title: n.title, body: n.body, baseTitle: n.title, baseBody: n.body, folderId: n.folderId,
      visibility: n.visibility, sharedWith: [...n.sharedWith], tags: [...n.tags],
    });
  };
  const endEdit = () => { setEditingId(null); setEditDraft(null); };
  /** PC表示でノート一覧をバー状にたたむか(ノートを開いても自動ではたたまない。「たたむ」を押したときだけ) */
  const [listCollapsed, setListCollapsed] = useState(false);
  /** PC表示でフォルダ欄をバー状にたたむか(ノートを開くとたたまれ、バーを押すと開く) */
  const [foldersCollapsed, setFoldersCollapsed] = useState(!!initialNoteId);
  /** ノートを開いたとき: フォルダ欄だけをたたむ(ノート一覧は出したままにして、続けて別のノートを選べるようにする) */
  const foldPanes = () => { setFoldersCollapsed(true); };

  /** 一覧で目次(見出しの一覧)を開いているノート。選択中のノートをもう一度押すと開く */
  const [outlineOpenId, setOutlineOpenId] = useState<string | null>(null);

  // 別のノートを開いたら、公開範囲の設定パネルと目次は閉じる
  useEffect(() => { setSettingsOpen(false); setOutlineOpenId(cur => (cur === selectedId ? cur : null)); }, [selectedId]);

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
    // 通知などから別のノートへ切り替わるとき、書きかけがあれば控えに残して、あとで戻せるようにする
    if (hasUnsaved) {
      const b = makeBackup();
      if (b) { storeBackup(me.name, b); setRecovered(b); }
    }
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
  /** 自分で並べた順(ID → 何番目か) */
  const folderRank = useMemo(() => new Map(api.orders.folders.map((id, i) => [id, i])), [api.orders.folders]);
  const noteRank = useMemo(() => new Map(api.orders.notes.map((id, i) => [id, i])), [api.orders.notes]);
  /** フォルダの並び順: 自分で並べた物が先(並べた順)。並べていない物は、自分のフォルダ → 共有フォルダ(作った人ごと)の順 */
  const cmpFolders = (a: NoteFolder, b: NoteFolder) => {
    const ia = folderRank.get(a.id), ib = folderRank.get(b.id);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return -1;
    if (ib !== undefined) return 1;
    return Number(a.owner !== me.name) - Number(b.owner !== me.name)
      || a.owner.localeCompare(b.owner, 'ja') || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ja');
  };
  const topFolders = useMemo(
    () => myFolders.filter(f => !f.parentId || !myFolders.some(p => p.id === f.parentId)).sort(cmpFolders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myFolders, folderRank]
  );
  const childrenOf = (id: string) => myFolders.filter(f => f.parentId === id).sort(cmpFolders);
  const flatFolders = useMemo(() => {
    const out: { folder: NoteFolder; depth: number }[] = [];
    topFolders.forEach(f => {
      out.push({ folder: f, depth: 0 });
      childrenOf(f.id).forEach(c => out.push({ folder: c, depth: 1 }));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topFolders, myFolders, folderRank]);

  // ── ほかの人から共有されたフォルダ(見られるものだけ)。中のノートは、ノートごとの公開範囲で見られるものだけ並ぶ ──
  const sharedFolders = useMemo(
    () => {
      // 商材で公開されたフォルダの判定には、自分の最新の案内可能商材を使う
      const viewer = users.find(u => u.name === me.name) ?? me;
      return folders.filter(f => f.owner !== me.name && canView(f, viewer));
    },
    [folders, me, users]);
  /** 共有フォルダのうち、一番上の階層に並べるもの(親フォルダが見えないサブフォルダも、ここに入る) */
  const sharedTopFolders = useMemo(
    () => sharedFolders.filter(f => !f.parentId || !sharedFolders.some(p => p.id === f.parentId)).sort(cmpFolders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sharedFolders, folderRank]);
  const sharedChildrenOf = (id: string) => sharedFolders.filter(f => f.parentId === id).sort(cmpFolders);
  /** 共有フォルダ(サブフォルダを含む)に入っていて、自分が見られるノートの数 */
  const sharedFolderNoteCount = (folderId: string) => {
    const ids = new Set([folderId, ...sharedChildrenOf(folderId).map(c => c.id)]);
    return notes.filter(n => !!n.folderId && ids.has(n.folderId)).length;
  };
  /** 「シェアノート」に表示する、と自分で選んだ共有フォルダ */
  const shownSharedFolders = useMemo(
    () => sharedTopFolders.filter(f => api.shownFolders.get(f.id) === 'shared'),
    [sharedTopFolders, api.shownFolders]);
  /** 「マイノート」(自分のフォルダの並び)に表示する、と自分で選んだ共有フォルダ */
  const mineSharedFolders = useMemo(
    () => sharedTopFolders.filter(f => api.shownFolders.get(f.id) === 'mine'),
    [sharedTopFolders, api.shownFolders]);
  /** マイノートに並べるフォルダ(自分のフォルダ + マイノートに置くと選んだ共有フォルダ) */
  const mineTopFolders = useMemo(
    () => [...topFolders, ...mineSharedFolders].sort(cmpFolders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topFolders, mineSharedFolders, folderRank]);

  const myNotes = useMemo(() => notes.filter(n => n.owner === me.name), [notes, me.name]);
  const myFolderIds = useMemo(() => new Set(myFolders.map(f => f.id)), [myFolders]);
  /**
   * 自分から見た、このノートの置き場所(フォルダ)。
   * 自分のノートは原本の置き場所。共有されたノートは、自分が「自分のフォルダに入れた」先(入れていなければ null)
   */
  const folderOf = (n: Note): string | null => {
    if (n.owner === me.name) return n.folderId;
    const id = api.placements[n.id];
    return id && myFolderIds.has(id) ? id : null;
  };
  const otherNotes = useMemo(() => notes.filter(n => n.owner !== me.name), [notes, me.name]);
  /**
   * 「シェアノート」(アナウンス・共有されたノート)に、自分が作ったノートも出すか。
   * ふだんは出さない(受け取ったものだけを見る場所なので)。チェックを入れたときだけ出し、次に開いたときも覚えておく
   */
  const [showMineInShared, setShowMineInShared] = useState<boolean>(() => {
    try { return localStorage.getItem(SHOW_MINE_STORAGE_KEY) === '1'; } catch { return false; }
  });
  const changeShowMine = (on: boolean) => {
    setShowMineInShared(on);
    try { localStorage.setItem(SHOW_MINE_STORAGE_KEY, on ? '1' : '0'); } catch { /* 覚えられなくても切り替えはできる */ }
  };
  /** 「アナウンス(お知らせ)」に並べるノート(自分が非表示にしたものは除く) */
  const announceNotes = useMemo(
    () => notes.filter(n => n.isAnnouncement && !myHiddenIds.has(n.id) && (showMineInShared || n.owner !== me.name)),
    [notes, myHiddenIds, showMineInShared, me.name]);
  /** 「共有されたノート」に並べるノート(チェックを入れると、自分が共有しているノートも出す) */
  const sharedNotes = useMemo(
    () => (showMineInShared ? notes.filter(n => n.owner !== me.name || n.visibility !== 'private') : otherNotes),
    [notes, otherNotes, showMineInShared, me.name]);

  const folderNoteCount = (folderId: string) => {
    const ids = new Set([folderId, ...childrenOf(folderId).map(c => c.id)]);
    return notes.filter(n => { const f = folderOf(n); return !!f && ids.has(f); }).length;
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

  // 絞り込み(作った人・タグ)と並び順
  const [ownerFilter, setOwnerFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>(loadSortKey);
  const changeSort = (k: SortKey) => {
    setSortKey(k);
    try { localStorage.setItem(SORT_STORAGE_KEY, k); } catch { /* 覚えられなくても並び替えはできる */ }
  };
  // 見ている場所(フォルダなど)を変えたら、絞り込みは解除する
  const viewId = view.kind === 'folder' ? `folder:${view.folderId}` : view.kind;
  useEffect(() => { setOwnerFilter(''); setTagFilter(''); }, [viewId]);

  /** 絞り込み前の一覧(見ている場所 + 検索語) */
  const baseNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base: Note[];
    if (q) {
      base = notes;
    } else {
      switch (view.kind) {
        case 'pinned': base = myNotes.filter(n => n.pinned); break;
        case 'unsorted': base = myNotes.filter(n => !n.folderId); break;
        case 'mine': base = myNotes; break;
        case 'announce': base = announceNotes; break;
        case 'shared': base = sharedNotes; break;
        case 'folder': {
          if (sharedFolders.some(f => f.id === view.folderId)) {
            // ほかの人の共有フォルダ: 原本の置き場所で並べる(自分が見られるノートだけ)
            const ids = new Set([view.folderId, ...sharedFolders.filter(f => f.parentId === view.folderId).map(f => f.id)]);
            base = notes.filter(n => !!n.folderId && ids.has(n.folderId));
            break;
          }
          const ids = new Set([view.folderId, ...myFolders.filter(f => f.parentId === view.folderId).map(f => f.id)]);
          base = notes.filter(n => { const f = folderOf(n); return !!f && ids.has(f); });
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
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, myNotes, otherNotes, announceNotes, sharedNotes, myFolders, sharedFolders, view, search, myHiddenIds, api.placements]);

  // 絞り込みの選択肢(今の一覧に出てくる人・タグだけ。件数つき)
  const ownerOptions = useMemo(() => {
    const m = new Map<string, number>();
    baseNotes.forEach(n => m.set(n.owner, (m.get(n.owner) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja'));
  }, [baseNotes]);
  const tagOptions = useMemo(() => {
    const m = new Map<string, number>();
    baseNotes.forEach(n => n.tags.forEach(t => m.set(t, (m.get(t) ?? 0) + 1)));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ja'));
  }, [baseNotes]);
  // 選んでいた人・タグが一覧から無くなったら(削除など)、その絞り込みは無かったことにする
  const activeOwner = ownerOptions.some(([o]) => o === ownerFilter) ? ownerFilter : '';
  const activeTag = tagOptions.some(([t]) => t === tagFilter) ? tagFilter : '';
  const showOwnerFilter = ownerOptions.length > 1;
  const showTagFilter = tagOptions.length > 0;

  /** ノートの「自分で並べた順」: 並べたことのないノート(新しく届いた物)が先(更新が新しい順)。そのあとに、並べた順 */
  const cmpNotesManual = (a: Note, b: Note) => {
    const ia = noteRank.get(a.id), ib = noteRank.get(b.id);
    if (ia !== undefined && ib !== undefined) return ia - ib;
    if (ia !== undefined) return 1;
    if (ib !== undefined) return -1;
    return b.updatedAt.localeCompare(a.updatedAt);
  };
  const visibleNotes = useMemo(() => {
    let list = baseNotes;
    if (activeOwner) list = list.filter(n => n.owner === activeOwner);
    if (activeTag) list = list.filter(n => n.tags.includes(activeTag));
    const byKey = (a: Note, b: Note) =>
      sortKey === 'manual' ? cmpNotesManual(a, b)
      : sortKey === 'title' ? (a.title || '').localeCompare(b.title || '', 'ja') || b.updatedAt.localeCompare(a.updatedAt)
      : sortKey === 'created' ? b.createdAt.localeCompare(a.createdAt)
      : b.updatedAt.localeCompare(a.updatedAt);
    return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || byKey(a, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseNotes, activeOwner, activeTag, sortKey, noteRank]);

  // ── 並び替えモード(ドラッグで、ノートとフォルダを好きな順に並べる) ──
  const [reorderMode, setReorderMode] = useState(false);
  /** いま掴んでいる物(group = 同じ並びの中だけで動かせる) */
  const [dragItem, setDragItem] = useState<{ group: string; id: string } | null>(null);
  /** いま重なっている相手と、その前後どちらに入るか */
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const toggleReorder = () => {
    setDragItem(null); setDropAt(null);
    if (reorderMode) { setReorderMode(false); return; }
    // 並び替えを始めるときは、並び順を「自分で並べた順」にし、たたんであるフォルダ欄も開く
    if (sortKey !== 'manual') changeSort('manual');
    setFoldersCollapsed(false);
    setReorderMode(true);
  };
  /** ドラッグできる行に付ける設定。onMove: 動かした結果を保存する */
  const dragProps = (group: string, id: string, onMove: (dragId: string, targetId: string, after: boolean) => void): React.HTMLAttributes<HTMLDivElement> => {
    if (!reorderMode) return {};
    const isAfter = (e: React.DragEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); return e.clientY > r.top + r.height / 2; };
    return {
      draggable: true,
      onDragStart: e => { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch { /* 無くても動く */ } setDragItem({ group, id }); },
      onDragOver: e => {
        if (!dragItem || dragItem.group !== group || dragItem.id === id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const after = isAfter(e);
        setDropAt(p => (p && p.id === id && p.after === after ? p : { id, after }));
      },
      onDrop: e => {
        if (!dragItem || dragItem.group !== group || dragItem.id === id) return;
        e.preventDefault();
        onMove(dragItem.id, id, isAfter(e));
        setDragItem(null); setDropAt(null);
      },
      onDragEnd: () => { setDragItem(null); setDropAt(null); },
    };
  };
  /** 入る場所を示す線(重なっている行の上か下に出す) */
  const dropLine = (id: string) => (dropAt?.id === id && dragItem ? (
    <div aria-hidden="true" data-drop-line={dropAt.after ? 'after' : 'before'} className="absolute inset-x-0 h-[3px] bg-[#0193be] z-10 pointer-events-none rounded-full" style={dropAt.after ? { bottom: -2 } : { top: -2 }} />
  ) : null);
  const dragCls = (id: string) => (reorderMode ? `cursor-grab ${dragItem?.id === id ? 'opacity-40' : ''}` : '');
  const saveOrderSafe = (kind: 'notes' | 'folders', ids: string[]) => {
    api.saveOrder(kind, ids).catch((e: any) => setLocalError(e?.message ?? '並び順を保存できませんでした'));
  };
  /** ノートを動かす(いま見えている一覧の中で)。見えていないノートの位置は変えない */
  const moveNote = (dragId: string, targetId: string, after: boolean) => {
    const shown = visibleNotes.map(n => n.id);
    const moved = moveInList(shown, dragId, targetId, after);
    if (moved === shown) return;
    const all = [...notes].sort(cmpNotesManual).map(n => n.id);
    saveOrderSafe('notes', mergeOrder(all, moved));
  };
  /** フォルダを動かす(siblings = 同じ並びにあるフォルダ)。ほかのフォルダの位置は変えない */
  const moveFolder = (siblings: NoteFolder[]) => (dragId: string, targetId: string, after: boolean) => {
    const shown = siblings.map(f => f.id);
    const moved = moveInList(shown, dragId, targetId, after);
    if (moved === shown) return;
    const all = [...folders].sort(cmpFolders).map(f => f.id);
    saveOrderSafe('folders', mergeOrder(all, moved));
  };

  // 自分が非表示にしたアナウンス(「アナウンス(お知らせ)」一覧の最下部に別枠で出す)
  const hiddenAnnouncements = useMemo(
    () => notes.filter(n => n.isAnnouncement && myHiddenIds.has(n.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes, myHiddenIds]);

  // 「非表示のアナウンス」バーの開閉(初期は閉じる。開いている非表示アナウンスを選んでいる間は自動で開く)
  const [hiddenOpen, setHiddenOpen] = useState(false);

  // 非表示のアナウンスを開いたとき(通知からの遷移など)は、バーも一緒に開いて選択中のノートが見えるようにする
  useEffect(() => {
    if (selectedId && hiddenAnnouncements.some(n => n.id === selectedId)) setHiddenOpen(true);
  }, [selectedId, hiddenAnnouncements]);

  const selected = notes.find(n => n.id === selectedId) ?? null;
  const isOwner = !!selected && selected.owner === me.name;
  /** 本文を編集できるか(オーナー、または共同編集がオンのノート) */
  const canEdit = !!selected && (isOwner || selected.allowEdit);
  const isEditing = !!selected && canEdit && editingId === selected.id;
  /** 開いているノートの目次(編集中は、書いている途中の本文から拾う) */
  const selectedOutlineBody = selected ? (isEditing && editDraft && editDraft.id === selected.id ? editDraft.body : selected.body) : '';
  const selectedOutline = useMemo(() => outlineOf(selectedOutlineBody), [selectedOutlineBody]);
  // 別のノートに移ったら、開いていた設定やメニューは閉じる
  const selectedNoteId = selected?.id ?? null;
  useEffect(() => { setSettingsOpen(false); setMoreOpen(false); setFolderOpen(false); setMenuOpen(false); }, [selectedNoteId]);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** 編集中に他の人がこのノートを更新していたときの「上書きしますか」確認 */
  const [overwriteConfirm, setOverwriteConfirm] = useState(false);
  // 開いているノート(または新規下書き)があるときだけ、一覧をたためる
  // ノートを開いていなくても、◀▶ でたためる
  const listFolded = listCollapsed;
  const foldersFolded = foldersCollapsed;
  // 開いていたノートを閉じた(削除など)ときは、自動でたたんでいたフォルダ欄を開き直す
  const hasOpenNote = !!selected || !!draft;
  useEffect(() => { if (!hasOpenNote) setFoldersCollapsed(false); }, [hasOpenNote]);
  const currentFolder = view.kind === 'folder' ? folders.find(f => f.id === view.folderId) ?? null : null;
  // 見ていたフォルダが無くなった(削除された・共有が取り消された)ら、「すべて」に戻す
  const viewFolderGone = view.kind === 'folder' && !loading && !currentFolder;
  useEffect(() => { if (viewFolderGone) setView({ kind: 'mine' }); }, [viewFolderGone]);

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
    if (view.kind === 'shared' || view.kind === 'announce') setView({ kind: 'mine' });
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
    if (draft.announce) {
      if (draft.visibility === 'private') {
        setSettingsOpen(true);
        throw new Error('アナウンスするには、公開範囲を「自分だけ」以外にしてください');
      }
      if (getRecipients({ owner: me.name, visibility: draft.visibility, sharedWith: draft.sharedWith }, users).length === 0) {
        throw new Error('アナウンスの対象者がいません。公開範囲を確認してください');
      }
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
    let announceFailed = false;
    if (draft.announce) {
      // ノートは作成済みなので、アナウンスだけ失敗しても下書きには戻さない(二重に作らないため)
      try { await api.announce(note.id, { important: !!draft.announceImportant, due: draft.announceDue || null }); } catch { announceFailed = true; }
    }
    setDraft(null);
    if (!recovered) clearBackup();
    setTagInput('');
    setSearch('');
    endEdit();
    setSelectedId(note.id);
    setStep('note');
    if (announceFailed) throw new Error('ノートは保存しましたが、アナウンスに失敗しました。ノートを開いて、もう一度アナウンスしてください');
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

  // ── 書きかけの控え(保存し忘れ・画面が閉じたときの保険) ──────────
  /** 前回開いたときに保存されないまま残った書きかけ(戻すか捨てるかを選んでもらう) */
  const [recovered, setRecovered] = useState<NoteBackup | null>(() => loadBackup(me.name));
  /** 今の書きかけを控えの形にする(書きかけが無ければ null) */
  const makeBackup = (): NoteBackup | null => {
    const savedAt = new Date().toISOString();
    if (draft) return { kind: 'new', draft, tagInput, savedAt };
    if (selected && isEditing && editDraft) {
      return { kind: 'edit', draft: editDraft, tagInput, baseUpdatedAt: selected.updatedAt, savedAt };
    }
    return null;
  };
  const clearBackup = () => storeBackup(me.name, null);
  // 入力のたびに(少し待ってから)控えを更新する。変更が無い状態に戻ったら控えも消す
  useEffect(() => {
    if (recovered) return;   // 前回の書きかけをどうするか決めるまでは、控えに触らない
    if (!draft && !editDraft) return;   // 保存・破棄で閉じたときは、その場で明示的に消している
    if (!hasUnsaved) { clearBackup(); return; }
    const t = window.setTimeout(() => storeBackup(me.name, makeBackup()), 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recovered, hasUnsaved, draft, editDraft, tagInput, me.name]);

  /** 控えから書きかけを戻す */
  const restoreBackup = (b: NoteBackup) => {
    setRecovered(null);
    setLocalError(null);
    setSearch('');
    setSettingsOpen(false);
    setTagInput(b.tagInput ?? '');
    const folderOk = (id: string | null) => (id && myFolders.some(f => f.id === id) ? id : null);
    const target = b.kind === 'edit' ? notes.find(n => n.id === b.draft.id && (n.owner === me.name || n.allowEdit)) : undefined;
    if (b.kind === 'edit' && target) {
      setDraft(null);
      setView({ kind: 'mine' });
      setSelectedId(target.id);
      setEditingId(target.id);
      setEditDraft({ ...b.draft, folderId: folderOk(b.draft.folderId) });
    } else {
      // 新規ノートの書きかけ。編集していた元のノートが見つからないときも、新規ノートとして戻す
      setSelectedId(null);
      endEdit();
      if (view.kind === 'shared' || view.kind === 'announce') setView({ kind: 'mine' });
      setDraft({
        title: b.draft.title,
        body: b.draft.body,
        folderId: folderOk(b.draft.folderId),
        visibility: b.draft.visibility,
        sharedWith: b.draft.sharedWith ?? [],
        tags: b.draft.tags ?? [],
        pinned: b.kind === 'new' ? !!b.draft.pinned : false,
      });
    }
    foldPanes();
    setStep('note');
  };

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
    await api.announce(announceTarget.id, { important: announceOpts.important, due: announceOpts.due || null });
    setAnnounceTarget(null);
  });

  /** アナウンスの「確認しました」ダイアログで、キャンセル以外を選んだとき(確認済み+非表示。必要ならコピーも作る) */
  /** 「確認しました」→ 原本を自分のフォルダに入れて、アナウンスは非表示にする */
  const handleConfirmPlace = (folderId: string) => confirmTarget && run(async () => {
    const target = confirmTarget;
    await api.hideAnnouncement(target.id);
    try {
      await api.placeNote(target.id, folderId);
    } catch (e) {
      try { await api.unhideAnnouncement(target.id); } catch { /* 戻せなくてもアナウンス一覧の最下部から見られる */ }
      throw e;
    }
    setConfirmTarget(null);
    if (view.kind === 'announce' && selectedId === target.id) {
      setSelectedId(null);
      setStep('list');
    }
  });

  const handleConfirmHide = (copy: boolean) => confirmTarget && run(async () => {
    const target = confirmTarget;
    // 先に「確認済み+非表示」を記録する(DBの更新漏れなどで失敗したとき、コピーだけが増えないように)
    await api.hideAnnouncement(target.id);
    let created: Note | null = null;
    if (copy) {
      try {
        created = await api.copyToMine(target);
      } catch (e) {
        try { await api.unhideAnnouncement(target.id); } catch { /* 戻せなくてもアナウンス一覧の最下部から見られる */ }
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
      setSelectedId(null);   // 非表示にしたアナウンスは上の一覧から最下部の「非表示のアナウンス」へ移るので、開いたままにしない
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
  const handleSaveEdit = (force = false) => selected && editDraft && run(async () => {
    const n = selected;
    const dr = editDraft;
    // 編集している間に他の人が内容を更新していたら、上書きする前に確かめる
    const changedByOther = dr.baseTitle !== undefined && dr.baseBody !== undefined &&
      (n.title !== dr.baseTitle || n.body !== dr.baseBody);
    if (!force && changedByOther) { setOverwriteConfirm(true); return; }
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
    if (!recovered) clearBackup();
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

  const SideItem: React.FC<{ v: View; icon: React.ReactNode; label: React.ReactNode; count?: number; badge?: number; depth?: number; gearSpace?: boolean }> =
    ({ v, icon, label, count, badge, depth = 0, gearSpace = false }) => (
      <button
        onClick={() => selectView(v)}
        className={`w-full flex items-center gap-2 ${gearSpace ? 'pr-8' : 'pr-2'} py-1.5 rounded-md text-sm text-left transition ${isViewActive(v) ? activeRow : hoverRow}`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        <span className="flex-shrink-0">{icon}</span>
        <span className="truncate flex-1">{label}</span>
        {badge ? <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">{badge}</span> : null}
        {/* 0件は数字を出さない(数字が並びすぎて見づらくなるため) */}
        {count !== undefined && count > 0 && !badge ? <span className={`text-xs ${isViewActive(v) ? '' : muted}`}>{count}</span> : null}
      </button>
    );

  const renderFolder = (f: NoteFolder, depth: number): React.ReactNode => {
    const active = isViewActive({ kind: 'folder', folderId: f.id });
    return (
      <React.Fragment key={f.id}>
        <div
          data-reorder-folder={f.id}
          className={`relative ${dragCls(f.id)}`}
          {...dragProps(depth === 0 ? 'folders:mine-top' : `folders:child:${f.parentId}`, f.id, moveFolder(depth === 0 ? mineTopFolders : childrenOf(f.parentId ?? '')))}
        >
          {dropLine(f.id)}
          <SideItem
            v={{ kind: 'folder', folderId: f.id }}
            icon={<NoteIcon name="folder" />}
            label={f.visibility === 'private' ? f.name : <>{f.name} <VisibilityIcon visibility={f.visibility} /></>}
            count={folderNoteCount(f.id)}
            depth={depth}
            gearSpace={active}
          />
          {/* 選んでいるフォルダだけ、右はしに歯車を出す。押すと、サブフォルダ・設定・削除を選べる */}
          {active && (
            <>
              <button
                data-folder-gear
                onClick={() => setFolderMenuId(id => (id === f.id ? null : f.id))}
                title="フォルダの設定(サブフォルダ・名前や公開範囲・削除)"
                aria-label="フォルダの設定"
                aria-expanded={folderMenuId === f.id}
                className={`absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 inline-flex items-center justify-center rounded-md transition ${d ? 'hover:bg-white/15' : 'hover:bg-black/10'}`}
              ><NoteIcon name="settings" className="text-base" /></button>
              {folderMenuId === f.id && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setFolderMenuId(null)} />
                  <div data-folder-menu className={`absolute right-0 top-full mt-1 z-40 w-48 rounded-lg border shadow-xl py-1 text-sm ${d ? 'bg-[#1a2234] border-slate-600 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
                    {depth === 0 && (
                      <button className={`w-full text-left px-3 py-2 flex items-center gap-2 ${hoverRow}`} onClick={() => { setFolderMenuId(null); setFolderDlg({ mode: 'create', parent: f }); }}>
                        <PlusIcon className="w-4 h-4" />サブフォルダを作る
                      </button>
                    )}
                    <button className={`w-full text-left px-3 py-2 flex items-center gap-2 ${hoverRow}`} onClick={() => { setFolderMenuId(null); setFolderDlg({ mode: 'edit', folder: f }); }}>
                      <NoteIcon name="settings" className="text-base" />名前・公開範囲を変える
                    </button>
                    <button className="w-full text-left px-3 py-2 flex items-center gap-2 text-red-500 hover:bg-red-500/10" onClick={() => { setFolderMenuId(null); setDeleteFolderTarget(f); }}>
                      <TrashIcon className="w-4 h-4" />このフォルダを削除
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
        {depth === 0 && childrenOf(f.id).map(c => renderFolder(c, 1))}
      </React.Fragment>
    );
  };

  /** 共有フォルダの1行(見るだけ。名前の変更や削除はできない) */
  const renderSharedFolder = (f: NoteFolder, depth: number): React.ReactNode => (
    <React.Fragment key={f.id}>
      <div
        data-shared-folder={f.id}
        data-reorder-folder={f.id}
        title={`${f.owner} さんが共有しているフォルダ`}
        className={`relative ${dragCls(f.id)}`}
        {...(depth === 0
          ? (api.shownFolders.get(f.id) === 'mine'
            ? dragProps('folders:mine-top', f.id, moveFolder(mineTopFolders))
            : dragProps('folders:shared-top', f.id, moveFolder(shownSharedFolders)))
          : dragProps(`folders:child:${f.parentId}`, f.id, moveFolder(sharedChildrenOf(f.parentId ?? ''))))}
      >
        {dropLine(f.id)}
        <SideItem
          v={{ kind: 'folder', folderId: f.id }}
          icon={<NoteIcon name={depth === 0 ? 'folder-open' : 'folder'} />}
          label={f.name}
          count={sharedFolderNoteCount(f.id)}
          depth={depth}
        />
      </div>
      {depth === 0 && sharedChildrenOf(f.id).map(c => renderSharedFolder(c, 1))}
    </React.Fragment>
  );

  const viewTitle = (() => {
    if (search.trim()) return `検索結果「${search.trim()}」`;
    switch (view.kind) {
      case 'pinned': return <><NoteIcon name="star" /> ピン留め</>;
      case 'unsorted': return <><NoteIcon name="inbox" /> フォルダ未設定</>;
      case 'mine': return <><NoteIcon name="file-text" /> マイノート(すべて)</>;
      case 'announce': return <><NoteIcon name="megaphone" /> アナウンス(お知らせ)</>;
      case 'shared': return <><NoteIcon name="globe" /> 共有されたノート</>;
      case 'folder': return <><NoteIcon name="folder" /> {currentFolder?.name ?? 'フォルダ'}</>;
    }
  })();

  const unreadIdSet = new Set(unreadAnnouncements.map(n => n.id));
  const renderNoteRow = (n: Note) => {
    const preview = plainOf(n).replace(/\s+/g, ' ').slice(0, 70);
    const mine = n.owner === me.name;
    const unread = unreadIdSet.has(n.id);
    const active = n.id === selectedId;
    // 自分が出したアナウンスは「何人中何人が確認したか」を一覧にも出す
    let announceText = 'アナウンス';
    if (n.isAnnouncement && mine) {
      const recipients = getRecipients(n, users);
      const readNames = new Set(reads.filter(r => r.noteId === n.id).map(r => r.userName));
      announceText = `アナウンス中 ${recipients.filter(name => readNames.has(name)).length}/${recipients.length}`;
    }
    const visibilityText = n.visibility === 'members' ? sharedLabel(n.sharedWith)
      : n.visibility === 'private' ? '自分だけ'
      : n.visibility === 'public' ? '全員'
      : VISIBILITY_LABELS[n.visibility];
    // 選択中のノートをもう一度押すと、目次(見出しの一覧)を開閉する。編集中は、書いている途中の本文から拾う
    const showing = active && !draft;
    const outlineOpen = showing && outlineOpenId === n.id;
    const outline = showing ? selectedOutline : outlineOfNote(n.id, n.body);
    const hasOutline = outline.length > 0;
    /** ▼を押したとき: 開いているノートなら開閉、ほかのノートなら、そのノートを開いて目次も開く */
    const toggleOutline = () => {
      if (showing) { setOutlineOpenId(cur => (cur === n.id ? null : n.id)); return; }
      guard(() => { endEdit(); setSelectedId(n.id); setOutlineOpenId(n.id); foldPanes(); setStep('note'); });
    };
    return (
      <React.Fragment key={n.id}>
      <div
        data-reorder-note={n.id}
        className={`relative ${dragCls(n.id)}`}
        {...dragProps(`notes:${n.pinned ? 'pinned' : 'normal'}`, n.id, moveNote)}
      >
      {dropLine(n.id)}
      <button
        data-note-row={n.id}
        aria-expanded={showing ? outlineOpen : undefined}
        title={showing ? (outlineOpen ? 'もう一度押すと、目次を閉じます' : 'もう一度押すと、目次(見出しの一覧)を開きます') : undefined}
        onClick={() => {
          if (showing && step === 'note') { setOutlineOpenId(cur => (cur === n.id ? null : n.id)); return; }
          guard(() => { endEdit(); setSelectedId(n.id); foldPanes(); setStep('note'); });
        }}
        className={`w-full text-left pl-[9px] pr-3 py-2.5 border-b ${border} border-l-[3px] transition ${
          active ? `${d ? 'bg-[#0193be]/25' : 'bg-[#0193be]/10'} border-l-[#0193be]` : `border-l-transparent ${hoverRow}`}`}
      >
        {/* 1行目: タイトル(濃く) と 日付(右端に薄く)。見出しのあるノートは、右上の▼のぶんだけ右を空ける */}
        <div className={`flex items-baseline gap-1.5 ${hasOutline ? 'md:pr-6' : ''}`}>
          {n.pinned && <span className="text-amber-500 text-xs">★</span>}
          <span className={`truncate flex-1 text-sm font-semibold ${n.title ? '' : muted}`}>{n.title || '(無題)'}</span>
          {(api.commentInfo.unseen[n.id] ?? 0) > 0 && (
            <span data-comment-dot className="self-center flex-shrink-0 w-2 h-2 rounded-full bg-[#0193be]" title={`まだ見ていないコメントが${api.commentInfo.unseen[n.id]}件あります`} aria-label="まだ見ていないコメントがあります" />
          )}
          {unread && <AnnounceBadges note={n} />}
          {unread && <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 whitespace-nowrap">未確認</span>}
          <span className={`text-[11px] whitespace-nowrap ${muted}`}>{fmtDate(n.updatedAt)}</span>
        </div>
        {/* 2行目: 本文の出だし(中くらいの濃さ) */}
        <div className={`text-xs mt-0.5 truncate ${d ? 'text-slate-300' : 'text-slate-600'}`}>{preview || '(本文なし)'}</div>
        {/* 3行目: 補足(薄く)。アイコンだけでなく、ことばも添える */}
        <div className={`text-[11px] mt-1 flex items-center gap-2.5 whitespace-nowrap overflow-hidden ${muted}`}>
          {n.isAnnouncement && !unread && <span><NoteIcon name="megaphone" /> {announceText}</span>}
          <span title={VISIBILITY_LABELS[n.visibility]}><VisibilityIcon visibility={n.visibility} /> {visibilityText}</span>
          {!mine && <span className="truncate"><NoteIcon name="user" /> {n.owner}</span>}
          {(api.commentInfo.counts[n.id] ?? 0) > 0 && (
            <span data-comment-count title={`コメント ${api.commentInfo.counts[n.id]}件`}>💬 {api.commentInfo.counts[n.id]}</span>
          )}
          {n.tags.length > 0 && (
            <span className="truncate" title={n.tags.map(t => `#${t}`).join(' ')}>
              #{n.tags[0]}{n.tags.length > 1 ? ` +${n.tags.length - 1}` : ''}
            </span>
          )}
        </div>
      </button>
      {/* 見出しのあるノートには、右上に▼を出す(フォルダ欄の ◀▶ と同じ三角)。
          開くときも閉じるときも、先に目次が伸び縮みして、そのあとで▼が180度まわる */}
      {hasOutline && (
        <button
          type="button"
          data-outline-toggle={n.id}
          aria-expanded={outlineOpen}
          aria-label={outlineOpen ? '目次を閉じる' : '目次(見出しの一覧)を開く'}
          title={outlineOpen ? '目次を閉じます' : '目次(見出しの一覧)を開きます'}
          onClick={toggleOutline}
          className={`hidden md:inline-flex absolute right-1 top-1 items-center justify-center w-7 h-7 rounded-md ${muted} ${d ? 'hover:bg-white/10' : 'hover:bg-[#0193be]/15'}`}
        >
          <svg viewBox="0 0 10 10" width="16" height="16" aria-hidden="true" className="note-outline-arrow"
            style={{ transform: outlineOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: `transform ${OUTLINE_SPIN_MS}ms ease-out ${OUTLINE_SLIDE_MS}ms` }}>
            <path d="M1 2 L9 2 L5 8 Z" fill="currentColor" />
          </svg>
        </button>
      )}
      </div>
      {/* 目次(アコーディオン): 高さをなめらかに変えて開閉する。閉じているあいだは押せない・読み上げない */}
      {(showing || hasOutline) && (
        <div
          data-note-outline={n.id}
          data-open={outlineOpen ? 'true' : 'false'}
          aria-hidden={!outlineOpen}
          {...(outlineOpen ? {} : { inert: true })}
          style={{ display: 'grid', gridTemplateRows: outlineOpen ? '1fr' : '0fr', transition: `grid-template-rows ${OUTLINE_SLIDE_MS}ms ease` }}
        >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
        <div className={`border-b ${border} border-l-[3px] border-l-[#0193be] ${d ? 'bg-[#0193be]/10' : 'bg-[#0193be]/5'} py-1.5 max-h-80 overflow-y-auto`}>
          {outline.length === 0 ? (
            <div className={`px-3 py-1.5 text-xs ${muted}`}>見出しがありません(編集で「大見出し」「小見出し」を付けると、ここに並びます)</div>
          ) : outline.map(h => (
            <button
              key={h.index}
              type="button"
              data-outline-level={h.level}
              onClick={() => { jumpToHeading(h.index); }}
              title={`「${h.text}」へ移動`}
              className={`block w-full text-left truncate py-1.5 pr-3 leading-snug ${h.level === 2 ? 'pl-3 text-sm font-semibold' : 'pl-7 text-[13px]'} ${d ? 'text-slate-200 hover:bg-white/10' : 'text-slate-700 hover:bg-[#0193be]/15'}`}
            >
              <span className="text-[#0193be] mr-1">{h.level === 2 ? '▸' : '・'}</span>{h.text}
            </button>
          ))}
        </div>
        </div>
        </div>
      )}
      </React.Fragment>
    );
  };

  // ── 本文ペイン ─────────────────────────────────────────
  const renderDraftPane = (dr: NoteDraft) => {
    const patch = (p: Partial<NoteDraft>) => setDraft(cur => (cur ? { ...cur, ...p } : cur));
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {/* 未保存バー */}
        <div className={`sticky top-0 z-20 px-4 py-2.5 flex items-center gap-2 border-b ${d ? 'bg-amber-900/40 border-amber-700' : 'bg-amber-50 border-amber-300'}`}>
          <span className="text-sm font-bold text-amber-600 flex-1 min-w-0 truncate"><NoteIcon name="file-text" /> 新規ノート<span className={`ml-2 text-xs font-normal ${muted}`}>まだ保存されていません</span></span>
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
              <span className="font-bold"><VisibilityIcon visibility={dr.visibility} /> {VISIBILITY_LABELS[dr.visibility]}{dr.visibility === 'members' ? `(${sharedLabel(dr.sharedWith)})` : ''}</span>
              <AccordionArrow open={settingsOpen} />
            </button>
            <label className="inline-flex items-center gap-1.5">
              <span className={`text-xs ${muted}`}>フォルダ</span>
              <select
                value={dr.folderId ?? ''}
                onChange={e => patch({ folderId: e.target.value || null })}
                className={inputCls}
              >
                <option value="">未設定</option>
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

          <NoteAccordion open={settingsOpen} gap={12}>
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
          </NoteAccordion>

          {(() => {
            const count = dr.visibility === 'private' ? 0 : getRecipients({ owner: me.name, visibility: dr.visibility, sharedWith: dr.sharedWith }, users).length;
            return (
              <>
              <label className={`rounded-lg border px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 cursor-pointer ${dr.announce ? (d ? 'border-amber-600 bg-amber-900/20' : 'border-amber-300 bg-amber-50') : `${border} ${surface2}`}`}>
                <input
                  type="checkbox"
                  checked={!!dr.announce}
                  onChange={ev => {
                    const on = ev.target.checked;
                    patch({ announce: on });
                    // 「自分だけ」のままではアナウンスできないので、公開範囲を選ぶ欄を開く
                    if (on && dr.visibility === 'private') setSettingsOpen(true);
                  }}
                  className="w-4 h-4 accent-amber-500"
                />
                <span className="text-sm"><NoteIcon name="megaphone" /> <b>保存と同時にアナウンスする</b></span>
                <span className={`text-xs ${dr.announce && dr.visibility === 'private' ? 'text-amber-600 font-semibold' : muted}`}>
                  {!dr.announce
                    ? '読んでほしい人に通知し、誰が確認したかを見られます'
                    : dr.visibility === 'private'
                      ? '公開範囲を「自分だけ」以外にしてください'
                      : `保存すると、見られる ${count} 名に通知します`}
                </span>
              </label>
              {dr.announce && (
                <AnnounceOptionFields
                  important={!!dr.announceImportant}
                  due={dr.announceDue ?? ''}
                  dark={d}
                  onChange={next => patch({ announceImportant: next.important, announceDue: next.due })}
                />
              )}
              </>
            );
          })()}

          <NoteEditor
            key="draft"
            value={dr.body}
            editable
            toolbarTop={54}
            isDarkMode={d}
            onChange={html => patch({ body: html })}
            onUploadImage={file => uploadNoteImage(file, me.name)}
            onUploadFile={uploadNoteFile}
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
            <div className="text-4xl"><NoteIcon name="book" /></div>
            <div className="font-bold text-base">ノートを選んでください</div>
            <p className={`text-sm ${muted}`}>左の一覧からノートを選ぶか、新しく作成します。</p>
            <div className="flex justify-center gap-2 flex-wrap">
              <button onClick={handleNewNote} disabled={busy} className="px-4 py-2 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50">＋ 新規ノート</button>
              <button onClick={() => setHelpOpen(true)} className={`px-4 py-2 rounded-md text-sm font-semibold border ${border} ${hoverRow}`}><NoteIcon name="help" /> 使い方を見る</button>
            </div>
            <ul className={`text-left text-sm space-y-1.5 rounded-lg border ${border} ${surface2} p-4 ${d ? 'text-slate-300' : 'text-slate-600'}`}>
              <li><NoteIcon name="megaphone" /> <b>アナウンス</b>:読んでほしいノートを、みんなに通知して確認状況も見られます</li>
              <li><NoteIcon name="lock" /> <b>公開範囲</b>:自分だけ / 全員 / 管理者 / 選んだメンバー</li>
              <li><NoteIcon name="paperclip" /> 案件の備考は、詳細画面の「ノートに保存」から移せます</li>
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
    const readNames = new Set(reads.filter(r => r.noteId === n.id).map(r => r.userName));
    const readCount = recipients.filter(name => readNames.has(name)).length;
    const chip = 'inline-flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border transition whitespace-nowrap';
    const chipIdle = `${border} ${hoverRow}`;
    const chipOn = 'border-[#0193be] bg-[#0193be]/10 text-[#0193be]';
    const tagCls = `text-xs rounded-full px-2 py-0.5 ${d ? 'bg-slate-700' : 'bg-slate-200'}`;
    /** フォルダを選ぶ一覧。current: 今のフォルダ / noneLabel: 「入れない」の表示 / onPick: 選んだとき */
    const folderChoices = (current: string | null, noneLabel: string, hint: string, onPick: (folderId: string | null) => void) => {
      const item = (id: string | null, label: React.ReactNode, depth: number) => {
        const on = (current ?? null) === id;
        return (
          <button
            key={id ?? '__none__'}
            type="button"
            data-folder-choice={id ?? ''}
            aria-pressed={on}
            disabled={busy}
            onClick={() => { setFolderOpen(false); if (!on) onPick(id); }}
            className={`w-full flex items-center gap-2 py-1.5 pr-2 rounded-md text-sm text-left transition disabled:opacity-50 ${on ? activeRow : hoverRow}`}
            style={{ paddingLeft: 8 + depth * 16 }}
          >
            <span className="flex-shrink-0">{id ? <NoteIcon name="folder" /> : <NoteIcon name="inbox" />}</span>
            <span className="truncate flex-1">{label}</span>
            {on && <span className="text-xs flex-shrink-0">選択中</span>}
          </button>
        );
      };
      return (
        <div data-folder-choices className={`rounded-lg border ${border} ${d ? 'bg-[#1a2234]' : 'bg-white'} p-3 space-y-2`}>
          <div className={`text-xs ${muted}`}>{hint}</div>
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {item(null, noneLabel, 0)}
            {folderOptions.map(({ folder, depth }) => item(folder.id, folder.name, depth))}
          </div>
        </div>
      );
    };
    return (
      <div className={`flex-1 flex flex-col min-h-0 p-2 md:p-3 ${d ? 'bg-[#0f1624]' : 'bg-slate-100'}`}>
       {/* ノート1枚ぶんの枠: タイトル・設定・本文・日付をひとまとまりに見せる */}
       <div className={`flex flex-col min-h-0 overflow-hidden rounded-xl border shadow-sm ${d ? 'border-slate-600 bg-[#1a2234]' : 'border-slate-300 bg-white'}`}>
        {/* 上のバー: タイトルと主な操作。スクロールするのはこの下だけなので、常に見える */}
        <div
          style={{ height: 54 }}
          className={`relative z-20 shrink-0 px-3 flex items-center gap-2 border-b ${
            isEditing ? (d ? 'bg-[#16283a] border-sky-700' : 'bg-sky-50 border-sky-300') : `${d ? 'bg-[#1a2234]' : 'bg-white'} ${border}`
          }`}
        >
          <input
            value={shown.title}
            readOnly={!isEditing}
            onChange={ev => patchEdit({ title: ev.target.value })}
            placeholder={isEditing ? 'タイトル' : '(無題)'}
            title={isEditing ? undefined : shown.title}
            className={`flex-1 min-w-0 text-lg font-bold px-2 py-1 rounded-md border focus:outline-none ${
              isEditing
                ? `${d ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-300'} focus:border-[#0193be]`
                : 'bg-transparent border-transparent cursor-default truncate'
            }`}
          />
          {isOwner && (
            <button
              onClick={() => api.editNote(n.id, { pinned: !n.pinned }, { immediate: true })}
              title={n.pinned ? 'ピン留めを外す' : 'ピン留め'}
              className={`text-xl px-1 ${n.pinned ? 'text-amber-500' : muted}`}
            >{n.pinned ? '★' : '☆'}</button>
          )}
          {isEditing ? (
            <>
              <span className={`hidden lg:inline text-xs whitespace-nowrap ${editDirty ? 'text-amber-600' : muted}`}>
                {editDirty ? '未保存の変更があります' : '編集中'}
              </span>
              <button
                onClick={cancelEdit}
                disabled={busy}
                className={`text-sm px-3 py-1.5 rounded-md border whitespace-nowrap ${border} ${hoverRow} disabled:opacity-50`}
              >キャンセル</button>
              <button
                onClick={() => handleSaveEdit()}
                disabled={busy}
                className="text-sm px-5 py-1.5 rounded-md font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50 whitespace-nowrap"
              >{busy ? '保存中…' : '保存'}</button>
            </>
          ) : (
            <>
              {canEdit && (
                <button
                  onClick={() => { setSettingsOpen(false); setMoreOpen(false); setFolderOpen(false); setMenuOpen(false); beginEdit(n); }}
                  className="text-sm px-4 py-1.5 rounded-md font-bold text-white bg-[#0193be] hover:bg-[#017a9c] inline-flex items-center gap-1 whitespace-nowrap"
                ><NoteIcon name="pencil" /> 編集</button>
              )}
              {canEdit && (
                <button
                  onClick={() => setHistoryOpen(true)}
                  title="これまでに保存した内容を見て、前の版に戻せます"
                  className={`text-sm px-3 py-1.5 rounded-md border ${border} ${hoverRow} inline-flex items-center gap-1 whitespace-nowrap`}
                ><NoteIcon name="clock" /><span className="hidden sm:inline"> 履歴</span></button>
              )}
              {!isOwner && (
                <button onClick={handleCopy} disabled={busy} className={`${canEdit ? `border ${border} ${hoverRow}` : 'text-white bg-[#0193be] hover:bg-[#017a9c]'} text-sm px-3 py-1.5 rounded-md font-semibold disabled:opacity-50 whitespace-nowrap`}>
                  <NoteIcon name="copy" /><span className="hidden sm:inline"> {canEdit ? '自分用にコピー' : '自分用にコピーして編集'}</span><span className="sm:hidden"> コピー</span>
                </button>
              )}
              {isOwner && (
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(o => !o)}
                    aria-label="その他の操作" aria-expanded={menuOpen} title="その他の操作(削除など)"
                    className={`text-lg leading-none px-2.5 py-1.5 rounded-md border ${border} ${hoverRow}`}
                  >⋯</button>
                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                      <div className={`absolute right-0 top-full mt-1 z-40 w-52 rounded-lg border shadow-xl py-1 ${d ? 'bg-[#1a2234] border-slate-600' : 'bg-white border-slate-200'}`}>
                        <button
                          onClick={() => { setMenuOpen(false); setDeleteNoteTarget(n); }}
                          className="w-full text-left text-sm px-3 py-2 text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                        ><TrashIcon className="w-4 h-4" />このノートを削除</button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <ScrollFade key={n.id} dark={d}>
        {n.isAnnouncement && !isOwner && (
          <div className={`px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-b ${border} ${iRead ? (d ? 'bg-emerald-900/30' : 'bg-emerald-50') : (d ? 'bg-amber-900/30' : 'bg-amber-50')}`}>
            <span className="text-sm flex-1 min-w-[200px]">
              {iRead
                ? <><NoteIcon name="check-circle" /> {iHidden ? '確認済みで、アナウンスの一覧では非表示にしています' : 'このお知らせを確認済みです'}</>
                : <><NoteIcon name="megaphone" /> <span className="inline-flex items-center gap-1 align-middle mr-1"><AnnounceBadges note={n} /></span>{n.owner} さんからのアナウンスです。{n.announceDue ? `${formatAnnounceDue(n.announceDue)} までに、` : ''}内容を読んだら「確認しました」を押してください。</>}
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
              >アナウンスの一覧に戻す</button>
            )}
          </div>
        )}
        {n.isAnnouncement && isAdmin && !isOwner && (
          <div className={`px-4 py-2.5 border-b ${border}`}>
            <NoteReadStatus note={n} users={users} reads={reads} isDarkMode={d} />
          </div>
        )}

        <div>
          {/* 設定の要約(1行)。押すと、その場で変えられる */}
          {isOwner ? (
            <div className={`px-4 py-2 space-y-2 border-b ${border} ${surface2}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => { setMoreOpen(false); setFolderOpen(false); setSettingsOpen(o => !o); }}
                  title="このノートを誰が見られるかを変更します"
                  aria-expanded={settingsOpen}
                  className={`${chip} ${settingsOpen ? chipOn : chipIdle}`}
                >
                  <VisibilityIcon visibility={shown.visibility} />
                  <span className="font-bold">{VISIBILITY_LABELS[shown.visibility]}{shown.visibility === 'members' ? `(${sharedLabel(shown.sharedWith)})` : ''}</span>
                  <AccordionArrow open={settingsOpen} size={9} />
                </button>
                <button
                  data-note-folder-chip
                  onClick={() => { setSettingsOpen(false); setMoreOpen(false); setFolderOpen(o => !o); }}
                  title="このノートを入れるフォルダを変更します"
                  aria-expanded={folderOpen}
                  className={`${chip} ${folderOpen ? chipOn : chipIdle}`}
                >
                  <NoteIcon name="folder" />
                  <span className="truncate max-w-[9rem]">{(shown.folderId && folders.find(f => f.id === shown.folderId)?.name) || 'フォルダなし'}</span>
                  <AccordionArrow open={folderOpen} size={9} />
                </button>
                <button
                  onClick={() => { setSettingsOpen(false); setFolderOpen(false); setMoreOpen(o => !o); }}
                  title="アナウンス(読んだか確認する)と、共同編集の設定を開きます"
                  aria-expanded={moreOpen}
                  className={`${chip} ${moreOpen ? chipOn : n.isAnnouncement ? (d ? 'border-amber-600 bg-amber-900/20 text-amber-400' : 'border-amber-300 bg-amber-50 text-amber-700') : chipIdle}`}
                >
                  <NoteIcon name="megaphone" />
                  {n.isAnnouncement
                    ? <><span className="font-bold">アナウンス中 {readCount}/{recipients.length}人</span><AnnounceBadges note={n} done={readCount >= recipients.length} /></>
                    : <span>アナウンス</span>}
                  {n.visibility !== 'private' && <span>・共同編集{n.allowEdit ? ' オン' : ''}</span>}
                  <AccordionArrow open={moreOpen} size={9} />
                </button>
                {isEditing ? (
                  <div className="inline-flex items-center gap-1 flex-wrap">
                    {shown.tags.map(t => (
                      <span key={t} className={`inline-flex items-center gap-1 ${tagCls}`}>
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
                ) : n.tags.map(t => <span key={t} className={tagCls}>#{t}</span>)}
                {!isEditing && linkChip(n, `${chip} ${chipIdle}`)}
              </div>

              <NoteAccordion open={folderOpen} gap={8}>
                {folderChoices(shown.folderId ?? null, 'フォルダなし',
                  `このノートを入れるフォルダを選びます。${isEditing ? '「保存」を押すと反映されます。' : '選ぶとすぐに反映されます。'}`,
                  id => changeFolder(n.id, id))}
              </NoteAccordion>

              <NoteAccordion open={settingsOpen} gap={8}>
                <div className={`rounded-lg border ${border} ${d ? 'bg-[#1a2234]' : 'bg-white'} p-3 space-y-2`}>
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
              </NoteAccordion>

              <NoteAccordion open={moreOpen} gap={8}>
                <div className={`rounded-lg border ${border} ${d ? 'bg-[#1a2234]' : 'bg-white'} p-3 space-y-3`}>
                  {/* アナウンス */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    {n.visibility === 'private' ? (
                      <>
                        <span className="text-sm flex-1 min-w-[200px]"><NoteIcon name="megaphone" /> <b>アナウンス</b><span className={`ml-2 text-xs ${muted}`}>読んでほしい内容は、公開範囲を「自分だけ」以外にするとアナウンスできます</span></span>
                        <button onClick={() => { setMoreOpen(false); setSettingsOpen(true); }} className={`text-xs px-2.5 py-1 rounded-md border ${border} ${hoverRow}`}>公開範囲を変える</button>
                      </>
                    ) : n.isAnnouncement ? (
                      <>
                        <span className="text-sm font-bold text-amber-600 flex-1 min-w-[200px]"><NoteIcon name="megaphone" /> アナウンス中<span className={`ml-2 text-xs font-normal ${muted}`}>{n.announcedAt ? fmtDateTime(n.announcedAt) : ''}</span></span>
                        <button onClick={() => setAnnounceTarget(n)} disabled={editDirty} className={`text-xs px-2.5 py-1 rounded-md border ${border} ${hoverRow} disabled:opacity-50`} title={editDirty ? '先に「保存」してください' : '内容を直したときなど、全員にもう一度確認してもらいます(確認状況はリセットされます)'}>再アナウンスする</button>
                        <button
                          onClick={() => run(async () => { await api.remindUnread(n.id); setRemindedId(n.id); })}
                          disabled={busy || readCount >= recipients.length || remindedId === n.id}
                          className={`text-xs px-2.5 py-1 rounded-md border ${border} ${hoverRow} disabled:opacity-50`}
                          title="まだ確認していない人にだけ、もう一度通知します(確認済みの人には届かず、確認状況もそのままです)"
                        >{remindedId === n.id ? '再通知しました' : '未確認の人に再通知'}</button>
                        <button onClick={() => run(() => api.unannounce(n.id))} disabled={editDirty} className={`text-xs px-2.5 py-1 rounded-md border ${border} ${hoverRow} disabled:opacity-50`}>アナウンスをやめる</button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm flex-1 min-w-[200px]"><NoteIcon name="megaphone" /> <b>アナウンス</b><span className={`ml-2 text-xs ${muted}`}>通知を送り、誰が読んだかを確認できます</span></span>
                        <button onClick={() => setAnnounceTarget(n)} disabled={editDirty} title={editDirty ? '先に「保存」してください' : undefined} className="text-sm px-4 py-1.5 rounded-md font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50"><NoteIcon name="megaphone" /> アナウンスする</button>
                      </>
                    )}
                  </div>
                  {n.isAnnouncement && (
                    <NoteReadStatus note={n} users={users} reads={reads} isDarkMode={d} />
                  )}
                  {/* 共同編集 */}
                  {n.visibility !== 'private' && (
                    <label className={`pt-3 border-t ${border} flex flex-wrap items-center gap-x-2 gap-y-1 cursor-pointer`}>
                      <input
                        type="checkbox"
                        checked={n.allowEdit}
                        disabled={busy}
                        onChange={ev => { const on = ev.target.checked; void run(() => api.saveNote(n.id, { allowEdit: on })); }}
                        className="w-4 h-4 accent-[#0193be]"
                      />
                      <span className="text-sm"><NoteIcon name="users" /> <b>共同編集</b></span>
                      <span className={`text-xs ${muted}`}>オンにすると、このノートを見られる人もタイトルと本文を編集できます(公開範囲・削除・アナウンスは作った人だけ)</span>
                    </label>
                  )}
                </div>
              </NoteAccordion>
            </div>
          ) : (
            <div className={`px-4 py-2 border-b ${border} ${surface2}`}>
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className={`${chip} ${border}`}><VisibilityIcon visibility={n.visibility} /> {VISIBILITY_LABELS[n.visibility]}{n.visibility === 'members' ? `(${sharedLabel(n.sharedWith)})` : ''}</span>
              {n.allowEdit && n.visibility !== 'private' && <span className={`${chip} ${border}`}><NoteIcon name="users" /> 共同編集</span>}
              {api.placementsAvailable && flatFolders.length > 0 && (
                <button
                  data-note-place
                  onClick={() => setFolderOpen(o => !o)}
                  title="このノートを、自分のフォルダに入れます(自分にだけそう見えます。作った人の置き場所や内容は変わりません)"
                  aria-expanded={folderOpen}
                  className={`${chip} ${folderOpen ? chipOn : chipIdle}`}
                >
                  <NoteIcon name="folder" />
                  <span className="truncate max-w-[11rem]">{(folderOf(n) && folders.find(f => f.id === folderOf(n))?.name) || '自分のフォルダに入れる'}</span>
                  <AccordionArrow open={folderOpen} size={9} />
                </button>
              )}
              {n.tags.map(t => <span key={t} className={tagCls}>#{t}</span>)}
              {!canEdit && <span className={`text-xs ${muted}`}>読み取り専用です</span>}
              {!isEditing && linkChip(n, `${chip} ${chipIdle}`)}
            </div>
              {api.placementsAvailable && flatFolders.length > 0 && (
                <NoteAccordion open={folderOpen} gap={8}>
                  {folderChoices(folderOf(n), '自分のフォルダに入れない',
                    'このノートを入れる、自分のフォルダを選びます。自分にだけそう見えます(作った人の置き場所や内容は変わりません)。',
                    id => { void run(() => api.placeNote(n.id, id)); })}
                </NoteAccordion>
              )}
            </div>
          )}

          {n.isAnnouncement && isOwner && recipients.length === 0 && (
            <div className="px-4 pt-2 text-xs text-amber-600">※ アナウンスの対象者がいません(特定メンバーの選択を確認してください)。</div>
          )}

          {/* 元案件 */}
          {snap && (
            <div className={`mx-4 mt-3 rounded-lg border ${border} ${surface2} px-3 py-2 text-xs ${muted}`}>
              <div className="font-semibold mb-0.5"><NoteIcon name="paperclip" /> 元になった案件</div>
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

          {/* 本文(ノートごとに作り直す)。ノートの枠の中に、そのまま置く。
              コメント(「自分だけ」のノートと、編集中は出さない)は、本文の文字を選んで付けるものと、本文の下の欄がある */}
          <NoteComments
            key={n.id} note={n} me={me} isDarkMode={d} enabled={!isEditing && n.visibility !== 'private'}
            seen={api.commentSeenAvailable ? { ready: api.commentSeenLoaded, at: api.commentSeen[n.id] ?? null, watching: api.commentInfo.watching.has(n.id) } : null}
            onSeen={latest => { void api.markCommentsSeen(n.id, latest); }}
            onChanged={() => { void api.reloadCommentMeta(); }}
          >
          <div data-note-body className={isEditing ? 'p-3' : 'px-5 py-4 min-h-[10rem]'}>
            {(isEditing || n.body) && <NoteEditor
              key={n.id + (isEditing ? ':e' : ':r')}
              value={e ? e.body : n.body}
              editable={isEditing}
              isDarkMode={d}
              toolbarTop={0}
              onChange={html => patchEdit({ body: html })}
              onUploadImage={isEditing ? file => uploadNoteImage(file, me.name) : undefined}
              onUploadFile={isEditing ? uploadNoteFile : undefined}
              templates={isEditing ? templates : undefined}
              onError={setLocalError}
            />}
            {!isEditing && !n.body && (
              <div className={`text-sm text-left ${muted}`}>本文はまだありません。{canEdit ? '「編集」から書き込めます。' : ''}</div>
            )}
          </div>
          </NoteComments>

          {/* 作った人・日付(本文の下に小さく) */}
          <div className={`px-4 py-2 border-t ${border} ${surface2} rounded-b-xl text-xs ${muted} flex flex-wrap gap-x-4 gap-y-1`}>
            <span><NoteIcon name="user" /> {n.owner}</span>
            <span>作成 {fmtDateTime(n.createdAt)}</span>
            <span>更新 {fmtDateTime(n.updatedAt)}{n.updatedBy && n.updatedBy !== n.owner ? `(${n.updatedBy})` : ''}</span>
          </div>
        </div>
        </ScrollFade>
       </div>
      </div>
    );
  };

  const saveLabel: React.ReactNode = saveState === 'saving' ? '保存中…' : saveState === 'saved' ? '✓ 保存しました' : saveState === 'error' ? <><NoteIcon name="warning" /> 保存に失敗</> : '';

  return createPortal(
    <div className="fixed inset-0 z-[55] bg-black/60 flex items-stretch justify-center md:p-4" onClick={requestClose}>
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
          <h2 className="font-bodoni font-bold text-xl sm:text-2xl md:text-3xl leading-none tracking-wide whitespace-nowrap">Mikonote</h2>
          {/* 右寄せ: 検索・新規ノート・保存状態・ヘルプ・閉じる */}
          <div className="flex-1 min-w-0 flex items-center justify-end gap-2 md:gap-3">
            <div className="relative min-w-0 flex-1 sm:flex-none sm:w-[270px]">
              {/* 保存状態: 場所を取らず、検索窓の左に重ねて表示(出入りしてもボタンが動かない) */}
              {saveLabel && <span className="hidden md:block absolute right-full mr-3 top-1/2 -translate-y-1/2 text-xs opacity-90 whitespace-nowrap pointer-events-none">{saveLabel}</span>}
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
            <button onClick={() => setHelpOpen(true)} className="hidden sm:inline-flex items-center justify-center w-7 h-7 rounded-full border border-white/70 text-sm font-bold hover:bg-white/20" title="ノートの使い方" aria-label="ノートの使い方">?</button>
            <button onClick={requestClose} className="p-1 hover:bg-white/20 rounded" aria-label="閉じる"><XMarkIcon className="w-6 h-6" /></button>
          </div>
        </div>

        {shownError && !unavailable && (
          <div className="px-4 py-2 text-sm bg-red-50 text-red-700 border-b border-red-200 flex items-center gap-2">
            <span className="flex-1"><NoteIcon name="warning" /> {shownError}</span>
            <button onClick={() => { setLocalError(null); api.clearError(); }} className="font-bold" aria-label="エラーを閉じる">×</button>
          </div>
        )}

        {recovered && !unavailable && (() => {
          const b = recovered;
          const target = b.kind === 'edit' ? notes.find(n => n.id === b.draft.id && (n.owner === me.name || n.allowEdit)) : undefined;
          const changedSince = !!target && b.kind === 'edit' && target.updatedAt !== b.baseUpdatedAt;
          const stillLoading = loading && notes.length === 0;
          return (
            <div className={`px-4 py-2 text-sm border-b flex flex-wrap items-center gap-x-3 gap-y-1.5 ${d ? 'bg-amber-900/40 border-amber-700 text-amber-100' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
              <span className="flex-1 min-w-[220px]">
                <NoteIcon name="warning" /> 保存されていない書きかけが残っています:
                <b className="mx-1">「{b.draft.title || '(無題)'}」</b>
                <span className="text-xs opacity-80">
                  ({b.kind === 'edit' && target ? '編集の途中' : '新規ノート'}・{fmtDateTime(b.savedAt)} 時点)
                </span>
                {changedSince && <span className="block text-xs mt-0.5">※ このノートはその後に更新されています。復元して保存すると、書きかけの内容で上書きされます。</span>}
              </span>
              <button
                onClick={() => guard(() => restoreBackup(b))}
                disabled={busy || stillLoading}
                className="px-3 py-1 rounded-md text-sm font-bold text-white bg-[#0193be] hover:bg-[#017a9c] disabled:opacity-50"
              >復元する</button>
              <button
                onClick={() => { clearBackup(); setRecovered(null); }}
                disabled={busy}
                className={`px-3 py-1 rounded-md text-sm border ${d ? 'border-amber-600 hover:bg-amber-900/60' : 'border-amber-400 hover:bg-amber-100'} disabled:opacity-50`}
              >破棄する</button>
            </div>
          );
        })()}

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
              {/* マイノート: すべて・ピン留め・フォルダ未設定と、自分のフォルダ */}
              <div data-side-section="mine" className={`pl-2 pb-0.5 text-[11px] font-bold tracking-wide ${muted} flex items-center gap-0.5`}>
                <span className="flex-1">マイノート</span>
                <button
                  onClick={() => setFolderDlg({ mode: 'create', parent: null })}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded ${hoverRow}`}
                  title="フォルダを作る"
                  aria-label="フォルダを作る"
                ><PlusIcon className="w-4 h-4" /></button>
                {(
                  <button
                    onClick={() => setFoldersCollapsed(true)}
                    title="フォルダ欄をたたんで本文を広く表示します"
                    aria-label="フォルダ欄をたたむ"
                    className={`hidden md:inline-flex items-center justify-center w-8 h-8 rounded-md text-xs ${muted} ${hoverRow}`}
                  ><FoldArrow key={foldersFolded ? 'folded' : 'open'} dir="left" /></button>
                )}
              </div>
              <SideItem v={{ kind: 'mine' }} icon={<NoteIcon name="file-text" />} label="すべて" count={myNotes.length} />
              <SideItem v={{ kind: 'pinned' }} icon={<NoteIcon name="star" />} label="ピン留め" count={myNotes.filter(n => n.pinned).length} />
              <SideItem v={{ kind: 'unsorted' }} icon={<NoteIcon name="inbox" />} label="フォルダ未設定" count={myNotes.filter(n => !n.folderId).length} />
              {/* 自分のフォルダと、マイノートに置くと選んだ共有フォルダ(見るだけ)。並び替えモードで、まとめて好きな順にできる */}
              {mineTopFolders.map(f => (f.owner === me.name ? renderFolder(f, 0) : renderSharedFolder(f, 0)))}

              {/* シェアノート: アナウンス・共有されたノートと、表示すると選んだ共有フォルダ。
                  歯車は、共有されているフォルダがあるときだけ出す(数が増えすぎないよう、表示するものを自分で選ぶ) */}
              <div data-side-section="shared" className={`mx-1 mt-2 pl-1 pt-2 pb-0.5 border-t ${border} text-[11px] font-bold tracking-wide ${muted} flex items-center min-h-[2.25rem]`}>
                <span className="flex-1">シェアノート</span>
                {sharedTopFolders.length > 0 && (
                  <button
                    data-shared-folder-pick
                    onClick={() => setSharedPickerOpen(true)}
                    title={`共有フォルダを、フォルダ欄のどこに表示するかを選びます(${sharedTopFolders.length}件のうち${shownSharedFolders.length + mineSharedFolders.length}件を表示中)`}
                    aria-label="表示する共有フォルダを選ぶ"
                    className={`inline-flex items-center justify-center w-6 h-6 rounded ${hoverRow}`}
                  ><NoteIcon name="settings" className="text-base" /></button>
                )}
              </div>
              <SideItem v={{ kind: 'announce' }} icon={<NoteIcon name="megaphone" />} label="アナウンス(お知らせ)" badge={unreadAnnouncements.length} count={announceNotes.length} />
              <SideItem v={{ kind: 'shared' }} icon={<NoteIcon name="globe" />} label="共有されたノート" count={sharedNotes.length} />
              {shownSharedFolders.map(f => renderSharedFolder(f, 0))}

              {/* スマホでは右上の「？」が出ないので、ここから使い方を開けるようにしておく */}
              <div className="flex-1 sm:hidden" />
              <button
                onClick={() => setHelpOpen(true)}
                className={`sm:hidden mt-3 flex items-center gap-1.5 px-2 py-2 rounded-md text-sm font-semibold ${d ? 'text-sky-300' : 'text-[#0193be]'} ${hoverRow}`}
              ><NoteIcon name="help" /> ノートの使い方</button>

             </div>
            </aside>

            {/* ①' たたまれたフォルダバー(PCのみ・クリックで展開) */}
            {foldersFolded && (
              <button
                onClick={() => setFoldersCollapsed(false)}
                title="フォルダ欄を開く"
                aria-label="フォルダ欄を開く"
                className={`hidden md:flex w-9 flex-shrink-0 flex-col items-center gap-1 pt-2 border-r ${border} ${surface2} ${hoverRow} transition`}
              >
                <span className="h-8 flex items-center flex-shrink-0"><FoldArrow dir="right" className={d ? 'text-sky-300' : 'text-[#0193be]'} /></span>
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
                <button onClick={() => setStep('folders')} className={`md:hidden flex-shrink-0 text-xs font-semibold px-2 py-1 rounded border ${border}`}><NoteIcon name="folder-open" /> フォルダ</button>
                <span className="truncate flex-1">{viewTitle}</span>
                <span className={`text-xs font-normal ${muted}`}>{visibleNotes.length}件</span>
                {(
                  <button
                    onClick={() => setListCollapsed(true)}
                    title="一覧をたたんで本文を広く表示します"
                    aria-label="一覧をたたむ"
                    className={`hidden md:inline-flex flex-shrink-0 items-center justify-center w-8 h-8 rounded-md text-xs ${muted} ${hoverRow}`}
                  ><FoldArrow key={listFolded ? 'folded' : 'open'} dir="left" /></button>
                )}
              </div>
              {/* 絞り込み・並び順(小さなボタン。絞り込みの中身は押したときだけ出す) */}
              <div className={`px-2 py-1 border-b ${border} flex items-center gap-1.5`}>
                {(showOwnerFilter || showTagFilter) && (
                  <button
                    onClick={() => setFilterOpen(o => !o)}
                    aria-expanded={filterOpen}
                    title="作った人やタグで絞り込みます"
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border whitespace-nowrap transition ${
                      (activeOwner || activeTag) ? 'border-[#0193be] text-[#0193be] font-bold' : `${border} ${muted} ${hoverRow}`}`}
                  >絞り込み{(activeOwner || activeTag) ? `(${(activeOwner ? 1 : 0) + (activeTag ? 1 : 0)})` : ''} <AccordionArrow open={filterOpen} size={9} /></button>
                )}
                {(view.kind === 'announce' || view.kind === 'shared') && !search.trim() && (
                  <label
                    className={`inline-flex items-center gap-1 text-xs whitespace-nowrap cursor-pointer ${muted}`}
                    title="チェックを入れると、自分が作ったノートもこの一覧に出します"
                  >
                    <input
                      type="checkbox"
                      data-show-mine
                      checked={showMineInShared}
                      onChange={e => changeShowMine(e.target.checked)}
                      className="w-3.5 h-3.5 accent-[#0193be]"
                    />
                    自分のノートも表示
                  </label>
                )}
                <button
                  data-reorder-toggle
                  onClick={toggleReorder}
                  aria-pressed={reorderMode}
                  title={reorderMode ? '並び替えを終わります' : 'ノートとフォルダを、ドラッグして好きな順に並べ替えます(自分の画面だけの並びです)'}
                  className={`ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border whitespace-nowrap transition ${
                    reorderMode ? 'border-[#0193be] bg-[#0193be] text-white font-bold' : `${border} ${muted} ${hoverRow}`}`}
                >{reorderMode ? '並び替えを終わる' : '並び替え'}</button>
                <select
                  value={sortKey}
                  onChange={e => { const k = e.target.value as SortKey; changeSort(k); if (k !== 'manual') { setReorderMode(false); setDragItem(null); setDropAt(null); } }}
                  aria-label="並び順"
                  title="並び順(ピン留めしたノートは常に上に出ます)"
                  className={`text-xs bg-transparent border-0 rounded-md px-1 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0193be] ${muted}`}
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map(k => <option key={k} value={k} className={d ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-800'}>{SORT_LABELS[k]}</option>)}
                </select>
              </div>
              <NoteAccordion open={reorderMode}>
                <div data-reorder-hint className={`px-3 py-1.5 border-b ${border} text-xs leading-relaxed ${d ? 'bg-[#0193be]/20 text-sky-200' : 'bg-[#0193be]/10 text-[#01607a]'}`}>
                  ノートや、左のフォルダをドラッグして並べ替えられます。あなたの画面だけの並びです。
                </div>
              </NoteAccordion>
              <NoteAccordion open={filterOpen && (showOwnerFilter || showTagFilter)}>
                <div className={`px-2 py-1.5 border-b ${border} ${surface2} flex flex-wrap items-center gap-1.5`}>
                  {showOwnerFilter && (
                    <select
                      value={activeOwner}
                      onChange={e => setOwnerFilter(e.target.value)}
                      aria-label="作った人で絞り込む"
                      title="作った人で絞り込む"
                      className={`${inputCls} !py-1 !text-xs min-w-0 flex-1 basis-24 ${activeOwner ? '!border-[#0193be] font-bold' : ''}`}
                    >
                      <option value="">作った人: 全員</option>
                      {ownerOptions.map(([o, c]) => <option key={o} value={o}>{o === me.name ? `${o}(自分)` : o} ({c})</option>)}
                    </select>
                  )}
                  {showTagFilter && (
                    <select
                      value={activeTag}
                      onChange={e => setTagFilter(e.target.value)}
                      aria-label="タグで絞り込む"
                      title="タグで絞り込む"
                      className={`${inputCls} !py-1 !text-xs min-w-0 flex-1 basis-24 ${activeTag ? '!border-[#0193be] font-bold' : ''}`}
                    >
                      <option value="">タグ: すべて</option>
                      {tagOptions.map(([t, c]) => <option key={t} value={t}>#{t} ({c})</option>)}
                    </select>
                  )}
                  {(activeOwner || activeTag) && (
                    <button
                      onClick={() => { setOwnerFilter(''); setTagFilter(''); }}
                      className={`text-xs px-2 py-1 rounded border ${border} ${hoverRow} whitespace-nowrap`}
                    >解除</button>
                  )}
                </div>
              </NoteAccordion>
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
                    {(activeOwner || activeTag) ? '絞り込みに一致するノートがありません。' : search.trim() ? '一致するノートがありません。' : view.kind === 'announce' ? 'アナウンスされているノートはありません。' : 'ノートがありません。「＋ 新規ノート」で作成できます。'}
                  </div>
                ) : visibleNotes.map(n => renderNoteRow(n))}
                {/* 「アナウンス(お知らせ)」を開いているときだけ、一覧の一番下に非表示にしたアナウンスを出す */}
                {view.kind === 'announce' && !search.trim() && hiddenAnnouncements.length > 0 && (
                  <>
                    <button
                      onClick={() => setHiddenOpen(o => !o)}
                      aria-expanded={hiddenOpen}
                      className={`w-full flex items-center gap-1.5 px-3 py-2 text-xs font-bold tracking-wide border-b ${border} ${surface2} ${muted} ${hoverRow}`}
                    >
                      <NoteIcon name="chevron-right" className={`transition-transform duration-200 ${hiddenOpen ? 'rotate-90' : ''}`} />
                      <span className="flex-1 text-left">非表示のアナウンス（{hiddenAnnouncements.length}件）</span>
                    </button>
                    <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${hiddenOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="overflow-hidden min-h-0" {...(hiddenOpen ? {} : { inert: true } as object)}>
                        {hiddenAnnouncements.map(n => renderNoteRow(n))}
                      </div>
                    </div>
                  </>
                )}
              </div>
             </div>
            </section>

            {/* ②' たたまれた一覧バー(PCのみ・クリックで展開) */}
            {listFolded && (
              <button
                onClick={() => setListCollapsed(false)}
                title="ノート一覧を開く"
                aria-label="ノート一覧を開く"
                className={`hidden md:flex w-9 flex-shrink-0 flex-col items-center gap-1 pt-2 border-r ${border} ${surface2} ${hoverRow} transition`}
              >
                <span className="h-8 flex items-center flex-shrink-0"><FoldArrow dir="right" className={d ? 'text-sky-300' : 'text-[#0193be]'} /></span>
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

      {historyOpen && selected && (
        <NoteHistoryModal
          note={selected}
          isDarkMode={d}
          onClose={() => setHistoryOpen(false)}
          onRestore={async v => { await api.saveNote(selected.id, { title: v.title, body: v.body }); }}
        />
      )}

      <ConfirmationModal
        isOpen={overwriteConfirm}
        onClose={() => setOverwriteConfirm(false)}
        onConfirm={() => { setOverwriteConfirm(false); void handleSaveEdit(true); }}
        title="他の人がこのノートを更新しています"
        titleClassName="text-amber-600"
        confirmLabel="上書きして保存"
        cancelLabel="編集に戻る"
      >
        <p>あなたが編集している間に、{selected?.updatedBy && selected.updatedBy !== me.name ? `${selected.updatedBy} さんが` : '他の人が'}このノートを更新しました。</p>
        <p className="mt-2 text-sm">このまま保存すると、あなたの内容で上書きされます。相手の内容は「履歴」に残るので、あとで見たり戻したりできます。</p>
      </ConfirmationModal>

      {/* 表示する共有フォルダを選ぶ */}
      {sharedPickerOpen && (
        <NoteSharedFolderPicker
          entries={sharedTopFolders.map(f => ({ folder: f, childNames: sharedChildrenOf(f.id).map(c => c.name), noteCount: sharedFolderNoteCount(f.id) }))}
          shown={api.shownFolders}
          isDarkMode={d}
          onChange={(id, place) => { api.showSharedFolder(id, place).catch((e: any) => setLocalError(e?.message ?? '共有フォルダの表示設定を保存できませんでした')); }}
          onClose={() => setSharedPickerOpen(false)}
        />
      )}

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
          noteCount={folderDlg.mode === 'edit' ? (() => {
            const ids = new Set([folderDlg.folder.id, ...myFolders.filter(c => c.parentId === folderDlg.folder.id).map(c => c.id)]);
            return myNotes.filter(n => !!n.folderId && ids.has(n.folderId)).length;
          })() : 0}
          onClose={() => setFolderDlg(null)}
          onSubmit={async (name, visibility, sharedWith, applyToNotes) => {
            if (folderDlg.mode === 'create') {
              const f = await api.addFolder({ name, parentId: folderDlg.parent?.id ?? null, visibility, sharedWith });
              setView({ kind: 'folder', folderId: f.id });
              setSearch('');
            } else {
              const f = folderDlg.folder;
              if (name !== f.name) await api.renameFolder(f.id, name);
              const sameShared = JSON.stringify([...sharedWith].sort()) === JSON.stringify([...f.sharedWith].sort());
              if (visibility !== f.visibility || !sameShared) await api.setFolderVisibility(f.id, visibility, sharedWith);
              if (applyToNotes) await api.setNotesVisibilityInFolder(f.id, visibility, sharedWith);
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
          if (!recovered) clearBackup();   // 自分で「破棄」を選んだ書きかけは、控えも消す
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
        folders={api.placementsAvailable ? flatFolders.map(({ folder, depth }) => ({ id: folder.id, name: folder.name, depth })) : []}
        onPlaceAndHide={handleConfirmPlace}
        onCopyAndHide={() => handleConfirmHide(true)}
        onHide={() => handleConfirmHide(false)}
        onCancel={() => { setConfirmTarget(null); setLocalError(null); }}
      />

      <ConfirmationModal
        isOpen={!!announceTarget}
        onClose={() => setAnnounceTarget(null)}
        onConfirm={handleAnnounce}
        title={announceTarget?.isAnnouncement ? '再アナウンスしますか?' : 'アナウンスしますか?'}
        confirmLabel={announceTarget?.isAnnouncement ? '再アナウンスする' : 'アナウンスする'}
      >
        {announceTarget && (
          <>
            <p>「{announceTarget.title || '(無題)'}」を、閲覧できる {getRecipients({ ...announceTarget, announcedAt: null }, users).length} 名にアナウンスします。</p>
            <p className="mt-2 text-sm">対象の方にはプッシュ通知(通知を許可している場合)とヘッダーのバッジでお知らせし、「確認しました」の状況を確認できます。</p>
            {announceTarget.isAnnouncement && <p className="mt-2 text-sm text-amber-600">再アナウンスすると、これまでの確認状況はリセットされます。</p>}
            <div className="mt-3">
              <AnnounceOptionFields important={announceOpts.important} due={announceOpts.due} dark={false} onChange={setAnnounceOpts} />
            </div>
          </>
        )}
      </ConfirmationModal>
    </div>,
    document.body
  );
};

export default NotesPanel;
