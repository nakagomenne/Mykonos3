// ============================================================
// ノートの本文の「ここ」に付けたコメントの、場所の扱い
//   - 本文(HTML)は書き換えない。コメント側に「どの文字に付けたか」(その文字と、前後の文字)を覚えておき、
//     表示するときに本文の中から探して、▼ の目印を重ねる
//   - 本文が書き換わって、その文字が見つからなくなったコメントは「場所が分からない」として扱う
// ============================================================
import { createContext } from 'react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

/** コメントを付けた場所(コメントのID と、付けた文字・その前後の文字) */
export interface CommentAnchor {
  id: string;
  text: string;
  prefix: string;
  suffix: string;
  /** まだ見ていないコメントが付いているか(▼ をオレンジにする) */
  fresh?: boolean;
}

/** 本文で選んだ範囲から作る、新しいコメントの場所 */
export interface NewCommentAnchor {
  text: string;
  prefix: string;
  suffix: string;
  /** 選んだ範囲の画面上の位置(小窓を出す場所) */
  rect: DOMRect;
}

/** 本文(NoteEditor)とコメント欄(NoteComments)をつなぐ窓口 */
export interface NoteCommentBridge {
  anchors: CommentAnchor[];
  /** 本文の準備ができたら、選んでいる範囲を調べる関数を渡す(片付けるときは null) */
  setEditorApi: (api: { anchorFromSelection: () => NewCommentAnchor | null } | null) => void;
  /** 本文の中に場所が見つかったコメントのIDを知らせる */
  onResolved: (ids: string[]) => void;
}

export const NoteCommentContext = createContext<NoteCommentBridge | null>(null);

/** 前後の文字として覚えておく長さ */
const CONTEXT_LEN = 24;
/** コメントを付けられる文字数の上限 */
export const COMMENT_ANCHOR_MAX = 300;

/** 本文を1本の文字列にしたものと、各文字の本文中の位置(段落の切れ目は改行。位置は -1) */
function docTextMap(doc: PMNode): { text: string; pos: number[] } {
  const parts: string[] = [];
  const pos: number[] = [];
  let len = 0;
  let lastIsBreak = true;
  const pushBreak = () => {
    if (lastIsBreak) return;
    parts.push('\n'); pos.push(-1); len++; lastIsBreak = true;
  };
  doc.descendants((node, p) => {
    if (node.isText) {
      const t = node.text ?? '';
      for (let i = 0; i < t.length; i++) pos.push(p + i);
      parts.push(t);
      len += t.length;
      if (t.length) lastIsBreak = false;
    } else if (node.isBlock || node.type.name === 'hardBreak') {
      pushBreak();
    }
    return true;
  });
  return { text: parts.join(''), pos };
}

const commonSuffixLen = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a.charCodeAt(a.length - 1 - n) === b.charCodeAt(b.length - 1 - n)) n++;
  return n;
};
const commonPrefixLen = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a.charCodeAt(n) === b.charCodeAt(n)) n++;
  return n;
};

export interface ResolvedAnchor { id: string; from: number; to: number; fresh: boolean }

/** コメントの場所を、今の本文の中から探す(同じ文字が何回も出るときは、前後の文字がいちばん合うところ) */
export function resolveAnchors(doc: PMNode, anchors: CommentAnchor[]): ResolvedAnchor[] {
  if (anchors.length === 0) return [];
  const { text, pos } = docTextMap(doc);
  const out: ResolvedAnchor[] = [];
  for (const a of anchors) {
    if (!a.text) continue;
    let best = -1;
    let bestScore = -1;
    for (let idx = text.indexOf(a.text); idx !== -1; idx = text.indexOf(a.text, idx + 1)) {
      const score = commonSuffixLen(text.slice(Math.max(0, idx - CONTEXT_LEN), idx), a.prefix)
        + commonPrefixLen(text.slice(idx + a.text.length, idx + a.text.length + CONTEXT_LEN), a.suffix);
      if (score > bestScore) { best = idx; bestScore = score; }
    }
    if (best === -1) continue;
    const from = pos[best];
    const last = pos[best + a.text.length - 1];
    if (from < 0 || last < 0) continue;
    out.push({ id: a.id, from, to: last + 1, fresh: !!a.fresh });
  }
  return out;
}

/** 本文で今選んでいる範囲から、コメントを付ける場所を作る(本文の外・何も選んでいないときは null) */
export function anchorFromSelection(view: EditorView): NewCommentAnchor | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!view.dom.contains(range.startContainer) || !view.dom.contains(range.endContainer)) return null;
  let from: number;
  let to: number;
  try {
    from = view.posAtDOM(range.startContainer, range.startOffset);
    to = view.posAtDOM(range.endContainer, range.endOffset);
  } catch {
    return null;
  }
  if (from > to) [from, to] = [to, from];
  const { text, pos } = docTextMap(view.state.doc);
  let i = 0;
  while (i < pos.length && (pos[i] < 0 || pos[i] < from)) i++;
  let j = pos.length - 1;
  while (j >= 0 && (pos[j] < 0 || pos[j] >= to)) j--;
  // 前後の空白・改行は含めない
  while (i <= j && /\s/.test(text[i])) i++;
  while (j >= i && /\s/.test(text[j])) j--;
  if (i > j) return null;
  return {
    text: text.slice(i, j + 1),
    prefix: text.slice(Math.max(0, i - CONTEXT_LEN), i),
    suffix: text.slice(j + 1, j + 1 + CONTEXT_LEN),
    rect: range.getBoundingClientRect(),
  };
}

const anchorsKey = new PluginKey('noteCommentAnchors');

const mark = (id: string, fresh: boolean): HTMLElement => {
  const el = document.createElement('span');
  el.className = fresh ? 'note-cmt-mark note-cmt-mark-new' : 'note-cmt-mark';
  el.dataset.cmt = id;
  el.setAttribute('aria-hidden', 'true');
  el.contentEditable = 'false';
  el.textContent = '▼';
  return el;
};

/**
 * コメントの付いた場所に、小さな ▼ を前後に出す(▼本文▼)。本文そのものは変えない。
 * storage.anchors を入れ替えたあと、tr.setMeta('noteCommentAnchors', true) を流すと描き直す
 */
export const CommentAnchorExtension = Extension.create<Record<string, never>, { anchors: CommentAnchor[] }>({
  name: 'noteCommentAnchors',
  addStorage() {
    return { anchors: [] };
  },
  addProseMirrorPlugins() {
    const storage = this.storage;
    const build = (doc: PMNode): DecorationSet => {
      const resolved = resolveAnchors(doc, storage.anchors);
      if (resolved.length === 0) return DecorationSet.empty;
      const decos: Decoration[] = [];
      for (const r of resolved) {
        decos.push(Decoration.widget(r.from, () => mark(r.id, r.fresh), { side: -1, key: `cmt-s-${r.id}-${r.fresh ? 'n' : 'o'}`, ignoreSelection: true }));
        decos.push(Decoration.inline(r.from, r.to, { class: 'note-cmt-range', 'data-cmt': r.id }));
        decos.push(Decoration.widget(r.to, () => mark(r.id, r.fresh), { side: 1, key: `cmt-e-${r.id}-${r.fresh ? 'n' : 'o'}`, ignoreSelection: true }));
      }
      return DecorationSet.create(doc, decos);
    };
    return [
      new Plugin<DecorationSet>({
        key: anchorsKey,
        state: {
          init: (_config, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged || tr.getMeta('noteCommentAnchors') ? build(tr.doc) : old),
        },
        props: {
          decorations(state) { return anchorsKey.getState(state); },
        },
      }),
    ];
  },
});
