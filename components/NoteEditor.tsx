import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { TextStyle, Color, BackgroundColor, FontSize } from '@tiptap/extension-text-style';
import { TextAlign } from '@tiptap/extension-text-align';
import { NoteIcon } from './NoteIcons';
import { NoteAudio, NoteVideo, toVideoEmbedUrl, isAutoEmbedVideoUrl } from './noteMedia';
import { getNoteLinkApi, noteIdFromUrl } from './noteLinks';
import { CommentAnchorExtension, NoteCommentContext, anchorFromSelection, resolveAnchors } from './noteCommentAnchors';

interface NoteEditorProps {
  /** 本文(HTML) */
  value: string;
  onChange?: (html: string) => void;
  /** 画像ファイルをアップロードして公開URLを返す */
  onUploadImage?: (file: File) => Promise<string>;
  /** 画像以外のファイル(PDF・Excel など)をアップロードして、URL と表示名を返す */
  onUploadFile?: (file: File) => Promise<{ url: string; name: string; kind?: 'audio' | 'file' }>;
  editable?: boolean;
  isDarkMode?: boolean;
  placeholder?: string;
  /** 定型文を挿入するボタンを出す場合に渡す(プレーンテキストを挿入) */
  templates?: { id: string; name: string; body: string }[];
  /** 上部のエラー表示 */
  onError?: (message: string) => void;
  /** ツールバーを固定表示するときの上端からの距離(px)。上に固定バーがある場合に指定 */
  toolbarTop?: number;
}

/** プレーンテキスト(改行区切り)を段落のHTMLに変換 */
export function plainTextToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\r?\n/)
    .map(line => `<p>${line ? esc(line) : ''}</p>`)
    .join('');
}

/** 本文HTMLからプレーンテキストを取り出す(一覧のプレビュー・検索用) */
export function htmlToPlainText(html: string): string {
  if (!html) return '';
  const el = document.createElement('div');
  // <img> を残すと detached な要素でも画像を取りに行ってしまうため、先に除去する
  el.innerHTML = html
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<(audio|iframe)\b[^>]*>(<\/\1>)?/gi, ' ')
    .replace(/<\/(p|h[1-6]|li|tr|blockquote|div)>/gi, '$&\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '$& ');
  return (el.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

/** 文字サイズの選択肢(「標準」は指定なし = 15px) */
const FONT_SIZES: { label: string; value: string }[] = [
  { label: '小', value: '12px' },
  { label: '標準', value: '' },
  { label: '大', value: '18px' },
  { label: '特大', value: '24px' },
];
/** すぐ選べる文字色(明るい画面でも暗い画面でも読める色) */
const TEXT_COLORS: { label: string; value: string }[] = [
  { label: '赤', value: '#dc2626' },
  { label: 'オレンジ', value: '#ea580c' },
  { label: '緑', value: '#16a34a' },
  { label: '水色', value: '#0193be' },
  { label: '青', value: '#2563eb' },
  { label: '紫', value: '#9333ea' },
  { label: 'ピンク', value: '#db2777' },
  { label: 'グレー', value: '#64748b' },
];
/** すぐ選べるマーカー(文字の背景色) */
const MARKER_COLORS: { label: string; value: string }[] = [
  { label: '黄', value: '#fef08a' },
  { label: '緑', value: '#bbf7d0' },
  { label: '水色', value: '#bae6fd' },
  { label: 'ピンク', value: '#fbcfe8' },
  { label: 'オレンジ', value: '#fed7aa' },
  { label: 'グレー', value: '#e2e8f0' },
];

/** 色の表記を #rrggbb にそろえる(ブラウザは rgb(…) で返すことがあるため) */
function toHex(color: string | undefined): string {
  if (!color) return '';
  const m = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return color.toLowerCase();
  return '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('');
}

/** ツールバーの1行(ラベル + ボタン群)。再描画で作り直されないようコンポーネント外に定義 */
const ToolRow: React.FC<{ label: string; dark: boolean; children: React.ReactNode }> = ({ label, dark, children }) => (
  <div className="flex flex-wrap items-center gap-0.5">
    <span className={`w-16 shrink-0 text-[11px] font-semibold ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
    {children}
  </div>
);

const NoteEditor: React.FC<NoteEditorProps> = ({
  value, onChange, onUploadImage, onUploadFile, editable = true, isDarkMode = false,
  placeholder = 'ここに本文を入力…(画像は貼り付け・ドラッグでも追加できます)', templates, onError, toolbarTop = 0,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  /** 動画リンクの入力欄(開いているとき文字列、閉じているとき null) */
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState('');
  // handlePaste/handleDrop から最新の editor を参照するための ref
  const editorRef = useRef<Editor | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  /** 開いている色えらびの小窓(文字色 / マーカー) */
  const [palette, setPalette] = useState<'color' | 'marker' | null>(null);

  // onUploadImage / onError は props が変わっても editor を作り直さないよう ref 経由で参照
  const uploadRef = useRef(onUploadImage);
  const uploadFileRef = useRef(onUploadFile);
  useEffect(() => { uploadFileRef.current = onUploadFile; }, [onUploadFile]);
  const errorRef = useRef(onError);
  const changeRef = useRef(onChange);
  const lastHtmlRef = useRef(value);
  useEffect(() => { uploadRef.current = onUploadImage; }, [onUploadImage]);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);

  const insertImages = useCallback(async (editor: Editor, files: File[]) => {
    if (!uploadRef.current) return;
    setUploading(true);
    try {
      for (const file of files) {
        const url = await uploadRef.current(file);
        editor.chain().focus().setImage({ src: url, alt: file.name }).run();
      }
    } catch (e: any) {
      errorRef.current?.(e?.message ?? '画像のアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  }, []);

  /** 画像以外のファイルを送信して、本文にダウンロード用のリンクとして入れる */
  const insertFiles = useCallback(async (editor: Editor, files: File[]) => {
    if (!uploadFileRef.current) return;
    setUploading(true);
    try {
      for (const file of files) {
        const { url, name, kind } = await uploadFileRef.current(file);
        if (kind === 'audio') {
          // 音声はノートの中でそのまま再生できる形で入れる
          editor.chain().focus().setNoteAudio({ src: url, name }).run();
          continue;
        }
        editor.chain().focus()
          .insertContent({ type: 'text', text: name, marks: [{ type: 'link', attrs: { href: url } }] })
          .insertContent(' ')
          .run();
      }
    } catch (e: any) {
      errorRef.current?.(e?.message ?? 'ファイルのアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  }, []);

  /** 貼り付け・ドラッグ・選択されたファイルを、画像とそれ以外に分けて追加する */
  const addFiles = useCallback((all: File[]): boolean => {
    const images = uploadRef.current ? all.filter(f => f.type.startsWith('image/')) : [];
    const others = uploadFileRef.current ? all.filter(f => !f.type.startsWith('image/')) : [];
    if (images.length === 0 && others.length === 0) return false;
    const ed = editorRef.current;
    if (ed) void (async () => {
      if (images.length) await insertImages(ed, images);
      if (others.length) await insertFiles(ed, others);
    })();
    return true;
  }, [insertImages, insertFiles]);

  const editor = useEditor({
    editable,
    content: value,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // リンク(添付ファイル・URL): 閲覧中はクリックで別タブに開く。編集中はクリックしても開かない
        link: {
          openOnClick: 'whenNotEditable',
          autolink: true,
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        },
      }),
      // 画像は、四すみの丸をドラッグして大きさを変えられる(たてよこの比は保つ)
      Image.configure({
        inline: false,
        allowBase64: false,
        resize: {
          enabled: true,
          directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
          minWidth: 60,
          minHeight: 30,
          alwaysPreserveAspectRatio: true,
        },
      }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      TextStyle,
      Color,
      BackgroundColor,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      NoteAudio,
      NoteVideo,
      CommentAnchorExtension,
    ],
    editorProps: {
      attributes: { class: 'note-prose' },
      // 文字としてコピーしたとき、段落・箇条書きの間に空行が入らないようにする(1段落 = 1行)
      clipboardTextSerializer: slice => {
        const lines: string[] = [];
        slice.content.descendants(node => {
          if (!node.isTextblock) return true;
          lines.push(node.textBetween(0, node.content.size, '', leaf => (leaf.type.name === 'hardBreak' ? '\n' : '')));
          return false;
        });
        return lines.join('\n');
      },
      handlePaste: (_view, event) => {
        // YouTube などの動画リンクだけを貼ったときは、ノートの中で再生できる形で入れる
        const pasted = event.clipboardData?.getData('text/plain') ?? '';
        // ノートリンクだけを貼ったときは、長い URL ではなく「📝 ノートのタイトル」という文字のリンクにする
        const linkedNoteId = event.clipboardData?.files?.length ? null : noteIdFromUrl(pasted);
        if (linkedNoteId && editorRef.current) {
          event.preventDefault();
          const title = getNoteLinkApi()?.titleOf(linkedNoteId) || 'ノート';
          editorRef.current.chain().focus()
            .insertContent({ type: 'text', text: `📝 ${title}`, marks: [{ type: 'link', attrs: { href: pasted.trim() } }] })
            .insertContent(' ')
            .run();
          return true;
        }
        if (!event.clipboardData?.files?.length && isAutoEmbedVideoUrl(pasted)) {
          const src = toVideoEmbedUrl(pasted);
          if (src && editorRef.current) {
            event.preventDefault();
            editorRef.current.chain().focus().setNoteVideo({ src }).run();
            return true;
          }
        }
        if (!addFiles(Array.from(event.clipboardData?.files ?? []))) return false;
        event.preventDefault();
        return true;
      },
      handleDrop: (_view, event) => {
        if (!addFiles(Array.from((event as DragEvent).dataTransfer?.files ?? []))) return false;
        event.preventDefault();
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      // 空のときは <p></p> ではなく空文字で保存する
      const html = ed.isEmpty ? '' : ed.getHTML();
      // 開いただけ(内容が変わっていない)ときは保存しない
      if (html === lastHtmlRef.current) return;
      lastHtmlRef.current = html;
      changeRef.current?.(html);
    },
  });

  useEffect(() => { editorRef.current = editor; }, [editor]);

  // 編集可/不可の切り替えでは更新イベントを出さない(開いただけで「変更あり」と見なされるのを防ぐ)
  useEffect(() => { if (editor && !editor.isDestroyed) editor.setEditable(editable, false); }, [editor, editable]);

  // エディタが整形した後のHTMLを「現在の内容」の基準にする(開いただけでは変更扱いにしない)
  useEffect(() => {
    // 画面の読み込み直後は、作り直される前の(もう使えない)エディタが渡ってくることがあるので、その場合は何もしない
    if (editor && !editor.isDestroyed) lastHtmlRef.current = editor.isEmpty ? '' : editor.getHTML();
  }, [editor]);

  // 読み取り専用のときは、外部(他の人の編集・Realtime)からの本文変更を反映する
  // (編集可能なときは入力中のカーソルが飛ぶため反映しない)
  useEffect(() => {
    if (!editor || editor.isDestroyed || editable) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (current !== value) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, editable, value]);

  // ── 本文の場所に付けたコメント(見ているときだけ)。▼ の目印を出し、選んだ範囲をコメント欄に渡す ──
  const commentBridge = useContext(NoteCommentContext);
  const commentAnchors = !editable && commentBridge ? commentBridge.anchors : null;
  const onCommentResolved = commentBridge?.onResolved;
  const setCommentEditorApi = commentBridge?.setEditorApi;
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const anchors = commentAnchors ?? [];
    const storage = (editor.storage as any).noteCommentAnchors as { anchors: typeof anchors } | undefined;
    if (!storage) return;
    if (storage.anchors.length === 0 && anchors.length === 0) { onCommentResolved?.([]); return; }
    storage.anchors = anchors;
    editor.view.dispatch(editor.state.tr.setMeta('noteCommentAnchors', true).setMeta('addToHistory', false));
    onCommentResolved?.(resolveAnchors(editor.state.doc, anchors).map(r => r.id));
    // value: 本文が(ほかの人の編集で)変わったら、場所を探し直す
  }, [editor, commentAnchors, onCommentResolved, value]);
  useEffect(() => {
    if (!editor || editable || !setCommentEditorApi) return;
    setCommentEditorApi({ anchorFromSelection: () => (editor.isDestroyed ? null : anchorFromSelection(editor.view)) });
    return () => setCommentEditorApi(null);
  }, [editor, editable, setCommentEditorApi]);

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: !!ed?.isActive('bold'),
      italic: !!ed?.isActive('italic'),
      strike: !!ed?.isActive('strike'),
      underline: !!ed?.isActive('underline'),
      fontSize: (ed?.getAttributes('textStyle').fontSize as string | undefined) ?? '',
      color: toHex(ed?.getAttributes('textStyle').color as string | undefined),
      marker: toHex(ed?.getAttributes('textStyle').backgroundColor as string | undefined),
      alignCenter: !!ed?.isActive({ textAlign: 'center' }),
      alignRight: !!ed?.isActive({ textAlign: 'right' }),
      h2: !!ed?.isActive('heading', { level: 2 }),
      h3: !!ed?.isActive('heading', { level: 3 }),
      bullet: !!ed?.isActive('bulletList'),
      ordered: !!ed?.isActive('orderedList'),
      task: !!ed?.isActive('taskList'),
      quote: !!ed?.isActive('blockquote'),
      inTable: !!ed?.isActive('table'),
      imageSelected: !!ed?.isActive('image'),
      canUndo: !!ed?.can().undo(),
      canRedo: !!ed?.can().redo(),
    }),
  });

  if (!editor) return null;

  /**
   * 選んでいる画像の大きさを変える。ratio は本文の幅に対する割合(null は元の大きさに戻す)。
   * たてよこの比は、元の画像のまま保つ
   */
  const setImageSize = (ratio: number | null) => {
    const dom = editor.view.nodeDOM(editor.state.selection.from) as HTMLElement | null;
    const img = (dom?.tagName === 'IMG' ? dom : dom?.querySelector?.('img')) as HTMLImageElement | null | undefined;
    if (!img) return;
    if (ratio === null) {
      img.style.width = '';
      img.style.height = '';
      editor.chain().focus().updateAttributes('image', { width: null, height: null }).run();
      return;
    }
    const root = editor.view.dom as HTMLElement;
    const cs = getComputedStyle(root);
    const full = root.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (full < 60) return;   // 本文の幅がまだ決まっていないとき(画面の切り替え中など)は、何もしない
    const natural = img.naturalWidth > 0 && img.naturalHeight > 0
      ? img.naturalHeight / img.naturalWidth
      : (img.offsetWidth > 0 ? img.offsetHeight / img.offsetWidth : 1);
    const width = Math.max(60, Math.round(full * ratio));
    const height = Math.max(1, Math.round(width * natural));
    img.style.width = `${width}px`;
    img.style.height = `${height}px`;
    editor.chain().focus().updateAttributes('image', { width, height }).run();
  };

  const btn = (active: boolean, disabled = false) =>
    `px-2.5 py-1.5 rounded text-[13px] font-medium transition select-none whitespace-nowrap ${
      disabled ? 'opacity-30 cursor-not-allowed'
      : active ? (isDarkMode ? 'bg-[#0193be] text-white' : 'bg-[#0193be] text-white')
      : (isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200')
    }`;
  const run = (fn: () => boolean) => (e: React.MouseEvent) => { e.preventDefault(); fn(); };

  const mutedText = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  const submitVideo = () => {
    const src = toVideoEmbedUrl(videoUrl ?? '');
    if (!src) {
      setVideoError('YouTube・Google ドライブ・Vimeo の動画リンクを貼ってください');
      return;
    }
    editor.chain().focus().setNoteVideo({ src }).run();
    setVideoUrl(null);
    setVideoError('');
  };
  const frame = editable
    ? `rounded-lg border-2 transition-colors ${isDarkMode ? 'border-slate-600 focus-within:border-[#0193be] bg-[#141b2b]' : 'border-slate-300 focus-within:border-[#0193be] bg-slate-50'}`
    : '';

  return (
    <div
      className={`note-editor flex flex-col min-h-0 ${frame} ${isDarkMode ? 'note-editor-dark' : ''}`}
      onClickCapture={e => {
        // 見ているとき: 本文の中のノートリンクは、別のタブを開かずに、その場でそのノートを開く
        if (editable) return;
        const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
        const id = a ? noteIdFromUrl(a.getAttribute('href')) : null;
        const api = id ? getNoteLinkApi() : null;
        if (!id || !api) return;
        e.preventDefault();
        e.stopPropagation();
        if (api.titleOf(id) === null) { window.alert('このノートは見られません(削除されたか、公開範囲に入っていません)'); return; }
        api.open(id);
      }}
    >
      {editable && (
        <div style={{ top: toolbarTop }} className={`sticky z-10 rounded-t-md border-b ${isDarkMode ? 'bg-[#1a2234] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
          {/* 常に表示する細いバー(書式メニューの開閉 + 元に戻す/やり直し) */}
          <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
            {/* 色えらびの小窓を開いている間、外側を押したら閉じる */}
            {palette && (
              <div className="fixed inset-0 z-20" onMouseDown={e => { e.preventDefault(); setPalette(null); }} />
            )}
            {/* よく使う書式(文字を選んでから押す) */}
            <select
              value={FONT_SIZES.some(f => f.value === (state?.fontSize ?? '')) ? (state?.fontSize ?? '') : 'custom'}
              onChange={e => {
                const v = e.target.value;
                if (v === 'custom') return;
                if (v) editor.chain().focus().setFontSize(v).run();
                else editor.chain().focus().unsetFontSize().run();
              }}
              title="文字の大きさ(文字を選んでから変えます)"
              aria-label="文字の大きさ"
              className={`px-1.5 py-1.5 rounded-md text-[13px] border ${isDarkMode ? 'bg-slate-800 border-slate-600 text-slate-200' : 'bg-white border-slate-300 text-slate-700'}`}
            >
              {FONT_SIZES.map(f => <option key={f.label} value={f.value}>{f.label}</option>)}
              {!FONT_SIZES.some(f => f.value === (state?.fontSize ?? '')) && <option value="custom">{parseInt(state?.fontSize ?? '', 10) || '?'}</option>}
            </select>
            <button type="button" title="太字" className={`${btn(!!state?.bold)} font-bold`}
              onMouseDown={run(() => editor.chain().focus().toggleBold().run())}>B</button>
            <div className="relative">
              <button type="button" title="文字の色" aria-expanded={palette === 'color'} className={btn(palette === 'color')}
                onMouseDown={e => { e.preventDefault(); setPalette(p => (p === 'color' ? null : 'color')); }}>
                <span className="font-bold" style={{ borderBottom: `3px solid ${state?.color || (isDarkMode ? '#e2e8f0' : '#1e293b')}` }}>A</span> 色
              </button>
              {palette === 'color' && (
                <div className={`absolute left-0 top-full mt-1 z-30 w-48 p-2 rounded-lg border shadow-xl ${isDarkMode ? 'bg-[#1a2234] border-slate-600' : 'bg-white border-slate-200'}`}>
                  <div className="grid grid-cols-4 gap-1.5">
                    {TEXT_COLORS.map(c => (
                      <button key={c.value} type="button" title={c.label} aria-label={`文字色: ${c.label}`}
                        className={`h-8 rounded-md border text-sm font-bold ${state?.color === c.value ? 'ring-2 ring-[#0193be]' : ''} ${isDarkMode ? 'border-slate-600 bg-slate-800' : 'border-slate-200 bg-white'}`}
                        style={{ color: c.value }}
                        onMouseDown={e => { e.preventDefault(); editor.chain().focus().setColor(c.value).run(); setPalette(null); }}>A</button>
                    ))}
                  </div>
                  <button type="button" className={`mt-2 w-full text-xs py-1.5 rounded-md border ${isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setPalette(null); }}>色を元に戻す</button>
                </div>
              )}
            </div>
            <div className="relative">
              <button type="button" title="マーカー(文字の背景に色をつけます)" aria-expanded={palette === 'marker'} className={btn(palette === 'marker')}
                onMouseDown={e => { e.preventDefault(); setPalette(p => (p === 'marker' ? null : 'marker')); }}>
                <span className="px-1 rounded-sm text-slate-800" style={{ backgroundColor: state?.marker || '#fef08a' }}>あ</span> マーカー
              </button>
              {palette === 'marker' && (
                <div className={`absolute left-0 top-full mt-1 z-30 w-48 p-2 rounded-lg border shadow-xl ${isDarkMode ? 'bg-[#1a2234] border-slate-600' : 'bg-white border-slate-200'}`}>
                  <div className="grid grid-cols-3 gap-1.5">
                    {MARKER_COLORS.map(c => (
                      <button key={c.value} type="button" title={c.label} aria-label={`マーカー: ${c.label}`}
                        className={`h-8 rounded-md border border-slate-300 text-sm text-slate-800 ${state?.marker === c.value ? 'ring-2 ring-[#0193be]' : ''}`}
                        style={{ backgroundColor: c.value }}
                        onMouseDown={e => { e.preventDefault(); editor.chain().focus().setBackgroundColor(c.value).run(); setPalette(null); }}>あ</button>
                    ))}
                  </div>
                  <button type="button" className={`mt-2 w-full text-xs py-1.5 rounded-md border ${isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                    onMouseDown={e => { e.preventDefault(); editor.chain().focus().unsetBackgroundColor().run(); setPalette(null); }}>マーカーを消す</button>
                </div>
              )}
            </div>
            <span className={`mx-0.5 h-5 w-px ${isDarkMode ? 'bg-slate-600' : 'bg-slate-300'}`} aria-hidden="true" />
            <button
              type="button"
              aria-expanded={toolsOpen}
              title="見出し・箇条書き・表・画像・添付や、細かい文字の設定を開閉します"
              onClick={() => setToolsOpen(o => !o)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border transition whitespace-nowrap ${
                toolsOpen
                  ? 'bg-[#0193be] border-[#0193be] text-white'
                  : isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-100'
              }`}
            >
              <span><NoteIcon name="wrench" /> もっと(書式・添付)</span>
              <span className="text-[10px]">{toolsOpen ? '▲' : '▼'}</span>
            </button>
            <button type="button" title="元に戻す" disabled={!state?.canUndo} className={btn(false, !state?.canUndo)}
              onMouseDown={run(() => editor.chain().focus().undo().run())}><NoteIcon name="undo" /></button>
            <button type="button" title="やり直し" disabled={!state?.canRedo} className={btn(false, !state?.canRedo)}
              onMouseDown={run(() => editor.chain().focus().redo().run())}><NoteIcon name="redo" /></button>
            {uploading && <span className={`text-xs ml-1 ${mutedText}`}><NoteIcon name="clock" /> 送信中…</span>}
            {!toolsOpen && !uploading && (
              <span className={`hidden lg:inline text-xs ml-1 truncate ${mutedText}`}>見出し・箇条書き・表・画像・細かい設定</span>
            )}
          </div>

          {toolsOpen && (
            <div className="px-2 pb-2 pt-0.5 space-y-1">
              <ToolRow dark={isDarkMode} label="見出し">
                <button type="button" title="大きな見出し" className={btn(!!state?.h2)}
                  onMouseDown={run(() => editor.chain().focus().toggleHeading({ level: 2 }).run())}>大見出し</button>
                <button type="button" title="小さな見出し" className={btn(!!state?.h3)}
                  onMouseDown={run(() => editor.chain().focus().toggleHeading({ level: 3 }).run())}>小見出し</button>
              </ToolRow>
              <ToolRow dark={isDarkMode} label="文字">
                <button type="button" title="太字(選択した文字を太くします)" className={`${btn(!!state?.bold)} font-bold`}
                  onMouseDown={run(() => editor.chain().focus().toggleBold().run())}>B 太字</button>
                <button type="button" title="斜体" className={`${btn(!!state?.italic)} italic`}
                  onMouseDown={run(() => editor.chain().focus().toggleItalic().run())}>I 斜体</button>
                <button type="button" title="取り消し線" className={`${btn(!!state?.strike)} line-through`}
                  onMouseDown={run(() => editor.chain().focus().toggleStrike().run())}>S 取消線</button>
                <button type="button" title="下線" className={`${btn(!!state?.underline)} underline`}
                  onMouseDown={run(() => editor.chain().focus().toggleUnderline().run())}>U 下線</button>
              </ToolRow>
              <ToolRow dark={isDarkMode} label="そろえ">
                <button type="button" title="左にそろえる" className={btn(!state?.alignCenter && !state?.alignRight)}
                  onMouseDown={run(() => editor.chain().focus().unsetTextAlign().run())}>左</button>
                <button type="button" title="中央にそろえる" className={btn(!!state?.alignCenter)}
                  onMouseDown={run(() => editor.chain().focus().setTextAlign('center').run())}>中央</button>
                <button type="button" title="右にそろえる" className={btn(!!state?.alignRight)}
                  onMouseDown={run(() => editor.chain().focus().setTextAlign('right').run())}>右</button>
              </ToolRow>
              <ToolRow dark={isDarkMode} label="詳しく">
                <label className={`inline-flex items-center gap-1 px-1.5 text-[13px] ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`} title="文字の大きさを数字で指定します(10〜48)">
                  サイズ
                  <input
                    type="number" min={10} max={48} step={1}
                    value={parseInt(state?.fontSize ?? '', 10) || 15}
                    onChange={e => {
                      const n = Math.round(Number(e.target.value));
                      if (!Number.isFinite(n) || n < 10 || n > 48) return;
                      if (n === 15) editor.chain().unsetFontSize().run();
                      else editor.chain().setFontSize(`${n}px`).run();
                    }}
                    className={`w-14 px-1 py-1 rounded border text-[13px] ${isDarkMode ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-800'}`}
                  />
                </label>
                <label className={`inline-flex items-center gap-1 px-1.5 text-[13px] cursor-pointer ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`} title="文字の色を自由に選びます">
                  文字色
                  <input type="color" value={/^#[0-9a-f]{6}$/i.test(state?.color ?? '') ? state!.color : '#1e293b'}
                    onChange={e => editor.chain().setColor(e.target.value).run()}
                    className="w-7 h-7 p-0 border-0 bg-transparent cursor-pointer" />
                </label>
                <label className={`inline-flex items-center gap-1 px-1.5 text-[13px] cursor-pointer ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`} title="マーカー(背景)の色を自由に選びます">
                  マーカー色
                  <input type="color" value={/^#[0-9a-f]{6}$/i.test(state?.marker ?? '') ? state!.marker : '#fef08a'}
                    onChange={e => editor.chain().setBackgroundColor(e.target.value).run()}
                    className="w-7 h-7 p-0 border-0 bg-transparent cursor-pointer" />
                </label>
                <button type="button" title="選んだ文字の装飾(太字・色・大きさなど)をすべて外します" className={btn(false)}
                  onMouseDown={run(() => editor.chain().focus().unsetAllMarks().run())}>装飾をすべて外す</button>
              </ToolRow>
              <ToolRow dark={isDarkMode} label="リスト">
                <button type="button" title="箇条書き" className={btn(!!state?.bullet)}
                  onMouseDown={run(() => editor.chain().focus().toggleBulletList().run())}>• 箇条書き</button>
                <button type="button" title="番号付きリスト" className={btn(!!state?.ordered)}
                  onMouseDown={run(() => editor.chain().focus().toggleOrderedList().run())}>1. 番号付き</button>
                <button type="button" title="チェックリスト" className={btn(!!state?.task)}
                  onMouseDown={run(() => editor.chain().focus().toggleTaskList().run())}><NoteIcon name="check-square" /> チェックリスト</button>
              </ToolRow>
              <ToolRow dark={isDarkMode} label="挿入">
                <button type="button" title="引用" className={btn(!!state?.quote)}
                  onMouseDown={run(() => editor.chain().focus().toggleBlockquote().run())}><NoteIcon name="quote" /> 引用</button>
                <button type="button" title="区切り線" className={btn(false)}
                  onMouseDown={run(() => editor.chain().focus().setHorizontalRule().run())}>― 区切り線</button>
                <button type="button" title="表を挿入" className={btn(!!state?.inTable)}
                  onMouseDown={run(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}><NoteIcon name="table" /> 表</button>
                {onUploadImage && (
                  <>
                    <button type="button" title="画像を添付(貼り付け・ドラッグでも追加できます)" className={btn(false, uploading)} disabled={uploading}
                      onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click(); }}>
                      <NoteIcon name="image" /> 画像を添付
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        if (files.length) void insertImages(editor, files);
                      }}
                    />
                  </>
                )}
                {onUploadFile && (
                  <>
                    <button type="button" title="音声ファイル(録音など)を添付。ノートの中で再生できます(ドラッグでも追加できます。50MBまで)" className={btn(false, uploading)} disabled={uploading}
                      onMouseDown={e => { e.preventDefault(); audioInputRef.current?.click(); }}>
                      ♪ 音声を添付
                    </button>
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.opus,.flac"
                      multiple
                      className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        if (files.length) void insertFiles(editor, files);
                      }}
                    />
                    <button type="button" title="PDF・Excel などのファイルを添付(ドラッグでも追加できます。20MBまで)" className={btn(false, uploading)} disabled={uploading}
                      onMouseDown={e => { e.preventDefault(); attachInputRef.current?.click(); }}>
                      <NoteIcon name="paperclip" /> ファイルを添付
                    </button>
                    <input
                      ref={attachInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={e => {
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        if (files.length) addFiles(files);
                      }}
                    />
                  </>
                )}
                <div className="relative">
                  <button type="button" title="YouTube・Google ドライブ・Vimeo の動画リンクを貼ると、ノートの中で再生できます" aria-expanded={videoUrl !== null} className={btn(videoUrl !== null)}
                    onMouseDown={e => { e.preventDefault(); setVideoError(''); setVideoUrl(v => (v === null ? '' : null)); }}>▶ 動画リンク</button>
                  {videoUrl !== null && (
                    <div className={`absolute left-0 top-full mt-1 z-30 w-80 max-w-[85vw] p-3 rounded-lg border shadow-xl ${isDarkMode ? 'bg-[#1a2234] border-slate-600' : 'bg-white border-slate-200'}`}>
                      <div className={`text-xs mb-1.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>動画のリンクを貼ってください(YouTube・Google ドライブ・Vimeo)</div>
                      <input
                        type="url" autoFocus value={videoUrl} placeholder="https://…"
                        onChange={e => { setVideoUrl(e.target.value); setVideoError(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitVideo(); } if (e.key === 'Escape') setVideoUrl(null); }}
                        className={`w-full px-2 py-1.5 rounded border text-sm ${isDarkMode ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-800'}`}
                      />
                      {videoError && <div className="text-xs text-red-500 mt-1">{videoError}</div>}
                      <div className={`text-[11px] mt-1.5 ${mutedText}`}>ドライブの動画は、見せたい人に共有されている必要があります。</div>
                      <div className="flex justify-end gap-2 mt-2">
                        <button type="button" className={`px-3 py-1.5 rounded-md text-xs border ${isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-100'}`}
                          onClick={() => setVideoUrl(null)}>キャンセル</button>
                        <button type="button" className="px-3 py-1.5 rounded-md text-xs font-bold text-white bg-[#0193be] hover:bg-[#017a9c]"
                          onClick={submitVideo}>ノートに入れる</button>
                      </div>
                    </div>
                  )}
                </div>
                {templates && templates.length > 0 && (
                  <div className="relative">
                    <button type="button" title="定型文を挿入" className={btn(isTemplateOpen)}
                      onMouseDown={e => { e.preventDefault(); setIsTemplateOpen(o => !o); }}><NoteIcon name="clipboard" /> 定型文</button>
                    {isTemplateOpen && (
                      <div className={`absolute left-0 top-full mt-1 z-20 w-56 max-h-60 overflow-y-auto rounded-lg border shadow-xl ${isDarkMode ? 'bg-[#1a2234] border-slate-600' : 'bg-white border-slate-200'}`}>
                        {templates.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            className={`block w-full text-left px-3 py-2 text-sm truncate ${isDarkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-100'}`}
                            onMouseDown={e => {
                              e.preventDefault();
                              editor.chain().focus().insertContent(plainTextToHtml(t.body)).run();
                              setIsTemplateOpen(false);
                            }}
                          >{t.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </ToolRow>
            </div>
          )}

          {/* 画像を選んでいるときだけ出る、大きさの操作(閉じていても使えるように常時表示) */}
          {state?.imageSelected && (
            <div data-image-size-row className={`flex flex-wrap items-center gap-0.5 px-2 pb-2 ${toolsOpen ? 'pt-1 border-t ' + (isDarkMode ? 'border-slate-700' : 'border-slate-200') : ''}`}>
              <span className={`w-16 shrink-0 text-[11px] font-semibold ${mutedText}`}>画像の大きさ</span>
              <button type="button" title="本文の幅の4分の1" className={btn(false)} onMouseDown={run(() => setImageSize(0.25))}>小</button>
              <button type="button" title="本文の幅の半分" className={btn(false)} onMouseDown={run(() => setImageSize(0.5))}>中</button>
              <button type="button" title="本文の幅の4分の3" className={btn(false)} onMouseDown={run(() => setImageSize(0.75))}>大</button>
              <button type="button" title="本文の幅いっぱい" className={btn(false)} onMouseDown={run(() => setImageSize(1))}>幅いっぱい</button>
              <button type="button" title="大きさの指定をやめて、元の大きさに戻します" className={btn(false)} onMouseDown={run(() => setImageSize(null))}>元の大きさ</button>
              <span className={`ml-1 text-[11px] ${mutedText}`}>画像の四すみの丸をドラッグしても変えられます</span>
            </div>
          )}

          {/* 表の中にカーソルがあるときだけ出る表の操作(閉じていても使えるように常時表示) */}
          {state?.inTable && (
            <div className={`flex flex-wrap items-center gap-0.5 px-2 pb-2 ${toolsOpen ? 'pt-1 border-t ' + (isDarkMode ? 'border-slate-700' : 'border-slate-200') : ''}`}>
              <span className={`w-16 shrink-0 text-[11px] font-semibold ${mutedText}`}>表の操作</span>
              <button type="button" className={btn(false)} onMouseDown={run(() => editor.chain().focus().addRowAfter().run())}>＋行</button>
              <button type="button" className={btn(false)} onMouseDown={run(() => editor.chain().focus().addColumnAfter().run())}>＋列</button>
              <button type="button" className={btn(false)} onMouseDown={run(() => editor.chain().focus().deleteRow().run())}>－行</button>
              <button type="button" className={btn(false)} onMouseDown={run(() => editor.chain().focus().deleteColumn().run())}>－列</button>
              <button type="button" className={btn(false)} onMouseDown={run(() => editor.chain().focus().toggleHeaderRow().run())}>見出し行</button>
              <button type="button" className={`${btn(false)} !text-red-500`} onMouseDown={run(() => editor.chain().focus().deleteTable().run())}>表を削除</button>
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default NoteEditor;
