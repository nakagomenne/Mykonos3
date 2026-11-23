import { Node, mergeAttributes } from '@tiptap/core';

// ────────────────────────────────────────────────────────────
// ノート本文に入れる「音声」と「動画(外部リンクの埋め込み)」
//  - 音声: Storage に置いたファイルを、ノートの中で再生する
//  - 動画: YouTube / Google ドライブ / Vimeo のリンクを、ノートの中で再生する
//          (動画そのものは Mykonos に保存しない = 容量を使わない)
// ────────────────────────────────────────────────────────────

/** 動画のリンクを、埋め込み用の URL に直す。対応していないリンクは null */
export function toVideoEmbedUrl(input: string): string | null {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const id = (s: string | null | undefined) => (s && /^[\w-]{6,80}$/.test(s) ? s : null);

  // YouTube: watch?v=ID / youtu.be/ID / shorts/ID / live/ID / embed/ID
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    const parts = url.pathname.split('/').filter(Boolean);
    const vid = host === 'youtu.be'
      ? id(parts[0])
      : id(url.searchParams.get('v')) ?? (['shorts', 'live', 'embed'].includes(parts[0]) ? id(parts[1]) : null);
    if (!vid) return null;
    const t = parseInt((url.searchParams.get('t') ?? url.searchParams.get('start') ?? '').replace(/s$/, ''), 10);
    return `https://www.youtube-nocookie.com/embed/${vid}${t > 0 ? `?start=${t}` : ''}`;
  }
  // Google ドライブ: /file/d/ID/view など、または open?id=ID
  if (host === 'drive.google.com') {
    const m = url.pathname.match(/\/file\/d\/([\w-]+)/);
    const fid = id(m?.[1]) ?? id(url.searchParams.get('id'));
    return fid ? `https://drive.google.com/file/d/${fid}/preview` : null;
  }
  // Vimeo: vimeo.com/123456 / player.vimeo.com/video/123456
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = url.pathname.match(/\/(\d{6,12})(?:\/|$)/);
    return m ? `https://player.vimeo.com/video/${m[1]}` : null;
  }
  return null;
}

/** 本文に保存されている埋め込み URL が、こちらで作った形のものか(それ以外は表示しない) */
function isSafeEmbedUrl(src: string | null | undefined): src is string {
  return !!src && (
    /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]+(\?start=\d+)?$/.test(src) ||
    /^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/preview$/.test(src) ||
    /^https:\/\/player\.vimeo\.com\/video\/\d+$/.test(src)
  );
}

function isSafeMediaUrl(src: string | null | undefined): src is string {
  return !!src && /^https:\/\//i.test(src);
}

/** 貼り付けただけで動画として入れるリンクか(YouTube・Vimeo。ドライブは動画以外もあるのでボタンから) */
export function isAutoEmbedVideoUrl(text: string): boolean {
  const t = text.trim();
  if (!/^https?:\/\/\S+$/.test(t)) return false;
  const embed = toVideoEmbedUrl(t);
  return !!embed && !embed.startsWith('https://drive.google.com/');
}

const AUDIO_EXTS = new Set(['mp3', 'm4a', 'wav', 'aac', 'ogg', 'oga', 'opus', 'flac', 'weba', 'amr', 'wma']);

/** 音声ファイルか(種類の申告、または拡張子で判定) */
export function isAudioFile(file: { type: string; name: string }): boolean {
  if (file.type.startsWith('audio/')) return true;
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  return AUDIO_EXTS.has(ext);
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteAudio: { setNoteAudio: (attrs: { src: string; name: string }) => ReturnType };
    noteVideo: { setNoteVideo: (attrs: { src: string }) => ReturnType };
  }
}

/** 音声: 再生バー + ファイル名 */
export const NoteAudio = Node.create({
  name: 'noteAudio',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null, rendered: false },
      name: { default: '', rendered: false },
    };
  },

  parseHTML() {
    return [{
      tag: 'div[data-note-audio]',
      getAttrs: el => {
        const node = el as HTMLElement;
        const src = node.querySelector('audio')?.getAttribute('src');
        if (!isSafeMediaUrl(src)) return false;
        return { src, name: node.getAttribute('data-name') ?? '' };
      },
    }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, name } = node.attrs as { src: string | null; name: string };
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-note-audio': '', 'data-name': name, class: 'note-audio' }),
      ['div', { class: 'note-audio-name' }, name || '音声'],
      ['audio', { controls: 'true', preload: 'metadata', src: isSafeMediaUrl(src) ? src : '' }],
    ];
  },

  addCommands() {
    return {
      setNoteAudio: attrs => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
    };
  },
});

/** 動画: 外部サービスのプレーヤーを埋め込む */
export const NoteVideo = Node.create({
  name: 'noteVideo',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return { src: { default: null, rendered: false } };
  },

  parseHTML() {
    return [{
      tag: 'div[data-note-video]',
      getAttrs: el => {
        const src = (el as HTMLElement).querySelector('iframe')?.getAttribute('src');
        return isSafeEmbedUrl(src) ? { src } : false;
      },
    }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const src = node.attrs.src as string | null;
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-note-video': '', class: 'note-video' }),
      ['iframe', {
        src: isSafeEmbedUrl(src) ? src : 'about:blank',
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
        allowfullscreen: 'true',
        loading: 'lazy',
        referrerpolicy: 'strict-origin-when-cross-origin',
        title: '動画',
      }],
    ];
  },

  addCommands() {
    return {
      setNoteVideo: attrs => ({ commands }) => commands.insertContent({ type: this.name, attrs }),
    };
  },
});
