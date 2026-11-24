// ============================================================
// ノートへのリンク(ノートリンク)
//   - リンクの形は URL:  https://(このアプリ)/?note=(ノートのID)
//     Mykonos の中に貼ると「ノートのタイトル」の小さなボタンに変わり、押すとその場でノートが開く。
//     Mykonos の外(チャットなど)に貼っても、押すと Mykonos が開いてそのノートへ進む
//   - 見られないノート(公開範囲に入っていない・削除された)は、タイトルを出さない
// ============================================================
import React, { useSyncExternalStore } from 'react';
import { NoteIcon } from './NoteIcons';

/** ノートリンクにあたる URL(アプリのアドレスは問わない。?note=ID が付いているもの) */
const NOTE_LINK_SOURCE = 'https?:\\/\\/[^\\s/?#]+\\/?\\?note=([\\w-]{2,64})';
const linkRe = () => new RegExp(NOTE_LINK_SOURCE, 'gi');

/** このノートへのリンク */
export const noteLinkUrl = (noteId: string): string => `${window.location.origin}/?note=${noteId}`;

/** URL がノートリンクなら、ノートのIDを返す */
export function noteIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = new RegExp(`^${NOTE_LINK_SOURCE}$`, 'i').exec(url.trim());
  return m ? m[1] : null;
}

/** 文字数を数えるとき用: ノートリンクの分を除いた長さ */
export const lengthWithoutNoteLinks = (text: string): number => text.replace(linkRe(), '').length;
/** ノートリンクが占めている文字数 */
export const noteLinksLength = (text: string): number => text.length - lengthWithoutNoteLinks(text);

// ── アプリ全体で共有する窓口(App が登録し、各画面が使う) ──
export interface NoteLinkApi {
  /** ノートの一覧を読み込み終えたか */
  ready: boolean;
  /** 見られるノートならタイトル、見られないノートなら null */
  titleOf: (noteId: string) => string | null;
  /** そのノートを開く */
  open: (noteId: string) => void;
}
let current: NoteLinkApi | null = null;
const listeners = new Set<() => void>();
export function setNoteLinkApi(api: NoteLinkApi | null): void {
  current = api;
  listeners.forEach(l => l());
}
export const getNoteLinkApi = (): NoteLinkApi | null => current;
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useNoteLinkApi = (): NoteLinkApi | null => useSyncExternalStore(subscribe, getNoteLinkApi);

/**
 * 文字だけの場所(一覧の1行・通知など)用: ノートリンクを「📝タイトル」に置き換える。
 * titleOf を渡さない / 見られないノートは「📝ノート」
 */
export function replaceNoteLinks(text: string, titleOf?: (noteId: string) => string | null): string {
  if (!text || !text.includes('?note=')) return text;
  return text.replace(linkRe(), (_all, id: string) => `📝${(titleOf?.(id) || 'ノート')}`);
}

/** ノートへ飛ぶ小さなボタン(文の中に置く) */
export const NoteLinkChip: React.FC<{ noteId: string }> = ({ noteId }) => {
  const api = useNoteLinkApi();
  const title = api?.titleOf(noteId) ?? null;
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: '100%', verticalAlign: 'bottom',
    padding: '0 7px', borderRadius: 999, border: '1px solid currentColor', fontSize: '0.92em', lineHeight: 1.5,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', background: 'transparent', color: 'inherit',
  };
  if (!api || title === null) {
    // 読み込み中は「ノート」、読み込み終わっても見つからなければ「見られません」
    const pending = !api || !api.ready;
    return (
      <span data-note-link={noteId} data-note-link-state={pending ? 'loading' : 'hidden'} style={{ ...base, opacity: 0.6 }} title={pending ? undefined : 'このノートは削除されたか、公開範囲に入っていません'}>
        <NoteIcon name="file-text" />{pending ? 'ノート' : 'ノート(見られません)'}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-note-link={noteId}
      data-note-link-state="open"
      onClick={e => { e.preventDefault(); e.stopPropagation(); api.open(noteId); }}
      title={`ノート「${title || '(無題)'}」を開く`}
      style={{ ...base, cursor: 'pointer', fontWeight: 700 }}
    >
      <NoteIcon name="file-text" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{title || '(無題)'}</span>
    </button>
  );
};

/**
 * 文章の中のノートリンクを、ボタンに変えて表示する。
 * renderText: リンク以外の部分の表示(メンションに色をつける、など)。省くと、そのまま出す
 */
export const NoteLinkText: React.FC<{ text: string; renderText?: (part: string) => React.ReactNode }> = ({ text, renderText }) => {
  if (!text || !text.includes('?note=')) return <>{renderText ? renderText(text) : text}</>;
  const out: React.ReactNode[] = [];
  const re = linkRe();
  let last = 0;
  let key = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) {
      const part = text.slice(last, m.index);
      out.push(<React.Fragment key={key++}>{renderText ? renderText(part) : part}</React.Fragment>);
    }
    out.push(<NoteLinkChip key={key++} noteId={m[1]} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const part = text.slice(last);
    out.push(<React.Fragment key={key++}>{renderText ? renderText(part) : part}</React.Fragment>);
  }
  return <>{out}</>;
};
