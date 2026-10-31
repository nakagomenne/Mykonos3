import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';

interface NoteEditorProps {
  /** 本文(HTML) */
  value: string;
  onChange?: (html: string) => void;
  /** 画像ファイルをアップロードして公開URLを返す */
  onUploadImage?: (file: File) => Promise<string>;
  editable?: boolean;
  isDarkMode?: boolean;
  placeholder?: string;
  /** 定型文を挿入するボタンを出す場合に渡す(プレーンテキストを挿入) */
  templates?: { id: string; name: string; body: string }[];
  /** 上部のエラー表示 */
  onError?: (message: string) => void;
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
    .replace(/<\/(p|h[1-6]|li|tr|blockquote)>/gi, '$&\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '$& ');
  return (el.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

/** ツールバーの1行(ラベル + ボタン群)。再描画で作り直されないようコンポーネント外に定義 */
const ToolRow: React.FC<{ label: string; dark: boolean; children: React.ReactNode }> = ({ label, dark, children }) => (
  <div className="flex flex-wrap items-center gap-0.5">
    <span className={`w-16 shrink-0 text-[11px] font-semibold ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
    {children}
  </div>
);

const NoteEditor: React.FC<NoteEditorProps> = ({
  value, onChange, onUploadImage, editable = true, isDarkMode = false,
  placeholder = 'ここに本文を入力…(画像は貼り付け・ドラッグでも追加できます)', templates, onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);

  // onUploadImage / onError は props が変わっても editor を作り直さないよう ref 経由で参照
  const uploadRef = useRef(onUploadImage);
  const errorRef = useRef(onError);
  const changeRef = useRef(onChange);
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

  const editor = useEditor({
    editable,
    content: value,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editorProps: {
      attributes: { class: 'note-prose' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
        if (files.length === 0 || !uploadRef.current) return false;
        event.preventDefault();
        if (editorRef.current) void insertImages(editorRef.current, files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'));
        if (files.length === 0 || !uploadRef.current) return false;
        event.preventDefault();
        if (editorRef.current) void insertImages(editorRef.current, files);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      // 空のときは <p></p> ではなく空文字で保存する
      changeRef.current?.(ed.isEmpty ? '' : ed.getHTML());
    },
  });

  // handlePaste/handleDrop から最新の editor を参照するための ref
  const editorRef = useRef<Editor | null>(null);
  useEffect(() => { editorRef.current = editor; }, [editor]);

  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);

  // 読み取り専用のときは、外部(他の人の編集・Realtime)からの本文変更を反映する
  // (編集可能なときは入力中のカーソルが飛ぶため反映しない)
  useEffect(() => {
    if (!editor || editable) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (current !== value) editor.commands.setContent(value || '', { emitUpdate: false });
  }, [editor, editable, value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: !!ed?.isActive('bold'),
      italic: !!ed?.isActive('italic'),
      strike: !!ed?.isActive('strike'),
      h2: !!ed?.isActive('heading', { level: 2 }),
      h3: !!ed?.isActive('heading', { level: 3 }),
      bullet: !!ed?.isActive('bulletList'),
      ordered: !!ed?.isActive('orderedList'),
      task: !!ed?.isActive('taskList'),
      quote: !!ed?.isActive('blockquote'),
      inTable: !!ed?.isActive('table'),
      canUndo: !!ed?.can().undo(),
      canRedo: !!ed?.can().redo(),
    }),
  });

  if (!editor) return null;

  const btn = (active: boolean, disabled = false) =>
    `px-2.5 py-1.5 rounded text-[13px] font-medium transition select-none whitespace-nowrap ${
      disabled ? 'opacity-30 cursor-not-allowed'
      : active ? (isDarkMode ? 'bg-[#0193be] text-white' : 'bg-[#0193be] text-white')
      : (isDarkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-200')
    }`;
  const run = (fn: () => boolean) => (e: React.MouseEvent) => { e.preventDefault(); fn(); };

  const mutedText = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const frame = editable
    ? `rounded-lg border-2 transition-colors ${isDarkMode ? 'border-slate-600 focus-within:border-[#0193be] bg-[#0f172a]' : 'border-slate-300 focus-within:border-[#0193be] bg-white'}`
    : '';

  return (
    <div className={`note-editor flex flex-col min-h-0 ${frame} ${isDarkMode ? 'note-editor-dark' : ''}`}>
      {editable && (
        <div className={`sticky top-0 z-10 rounded-t-md border-b ${isDarkMode ? 'bg-[#1a2234] border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
          {/* 常に表示する細いバー(書式メニューの開閉 + 元に戻す/やり直し) */}
          <div className="flex items-center gap-1 px-2 py-1.5">
            <button
              type="button"
              aria-expanded={toolsOpen}
              title="文字の装飾・箇条書き・表・画像などのメニューを開閉します"
              onClick={() => setToolsOpen(o => !o)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium border transition whitespace-nowrap ${
                toolsOpen
                  ? 'bg-[#0193be] border-[#0193be] text-white'
                  : isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-700' : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-100'
              }`}
            >
              <span>🛠 書式・添付</span>
              <span className="text-[10px]">{toolsOpen ? '▲' : '▼'}</span>
            </button>
            <button type="button" title="元に戻す" disabled={!state?.canUndo} className={btn(false, !state?.canUndo)}
              onMouseDown={run(() => editor.chain().focus().undo().run())}>↩</button>
            <button type="button" title="やり直し" disabled={!state?.canRedo} className={btn(false, !state?.canRedo)}
              onMouseDown={run(() => editor.chain().focus().redo().run())}>↪</button>
            {uploading && <span className={`text-xs ml-1 ${mutedText}`}>⏳ 画像を送信中…</span>}
            {!toolsOpen && !uploading && (
              <span className={`hidden sm:inline text-xs ml-1 truncate ${mutedText}`}>見出し・箇条書き・表・画像など</span>
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
              </ToolRow>
              <ToolRow dark={isDarkMode} label="リスト">
                <button type="button" title="箇条書き" className={btn(!!state?.bullet)}
                  onMouseDown={run(() => editor.chain().focus().toggleBulletList().run())}>• 箇条書き</button>
                <button type="button" title="番号付きリスト" className={btn(!!state?.ordered)}
                  onMouseDown={run(() => editor.chain().focus().toggleOrderedList().run())}>1. 番号付き</button>
                <button type="button" title="チェックリスト" className={btn(!!state?.task)}
                  onMouseDown={run(() => editor.chain().focus().toggleTaskList().run())}>☑ チェックリスト</button>
              </ToolRow>
              <ToolRow dark={isDarkMode} label="挿入">
                <button type="button" title="引用" className={btn(!!state?.quote)}
                  onMouseDown={run(() => editor.chain().focus().toggleBlockquote().run())}>❝ 引用</button>
                <button type="button" title="区切り線" className={btn(false)}
                  onMouseDown={run(() => editor.chain().focus().setHorizontalRule().run())}>― 区切り線</button>
                <button type="button" title="表を挿入" className={btn(!!state?.inTable)}
                  onMouseDown={run(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>▦ 表</button>
                {onUploadImage && (
                  <>
                    <button type="button" title="画像を添付(貼り付け・ドラッグでも追加できます)" className={btn(false, uploading)} disabled={uploading}
                      onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click(); }}>
                      🖼 画像を添付
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
                {templates && templates.length > 0 && (
                  <div className="relative">
                    <button type="button" title="定型文を挿入" className={btn(isTemplateOpen)}
                      onMouseDown={e => { e.preventDefault(); setIsTemplateOpen(o => !o); }}>📋 定型文</button>
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
