import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from './icons';

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (comment: string) => void;
  initialComment: string;
}

const CommentModal: React.FC<CommentModalProps> = ({ isOpen, onClose, onSave, initialComment }) => {
  const [comment, setComment] = useState(initialComment);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setComment(initialComment);
      // フォーカスを少し遅らせてアニメーション後に当てる
      setTimeout(() => textareaRef.current?.focus(), 150);
    }
  }, [isOpen, initialComment]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(comment);
    onClose();
  };

  const remaining = 120 - comment.length;
  const isNearLimit = remaining <= 20;
  const isOverLimit = remaining < 0;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-50 cm-overlay"
      onClick={onClose}
    >
      <div
        className="cm-modal w-full max-w-sm flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── ヘッダー ── */}
        <div className="cm-header">
          {/* 装飾背景サークル */}
          <div className="cm-deco-circle cm-deco-circle-1" />
          <div className="cm-deco-circle cm-deco-circle-2" />

          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* Mikoposアイコン */}
              <div className="cm-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-bold text-base leading-tight tracking-wide" style={{ fontFamily: "'Ribeye Marrow', cursive" }}>Mikopos</p>
                <p className="text-white/70 text-[11px] leading-tight">ミコをポスト</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="cm-close-btn"
              aria-label="閉じる"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── 本文エリア ── */}
        <div className="cm-body">
          {/* ラベル行 */}
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="user-miko" className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              内容
            </label>
            <button
              onClick={() => { setComment(''); textareaRef.current?.focus(); }}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
            >
              クリア
            </button>
          </div>

          {/* テキストエリア */}
          <div className="cm-textarea-wrap">
            <textarea
              ref={textareaRef}
              id="user-miko"
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={120}
              rows={4}
              placeholder="今日のひとことをポストしよう…"
              className="cm-textarea"
            />
            {/* 文字カウンター */}
            <div className={`cm-counter ${isOverLimit ? 'cm-counter-over' : isNearLimit ? 'cm-counter-near' : ''}`}>
              {remaining}
            </div>
          </div>

          {/* プレビュー：入力中だけ表示 */}
          {comment.trim() && (
            <div className="cm-preview">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">プレビュー</p>
              <p className="text-sm text-slate-700 leading-relaxed">{comment}</p>
            </div>
          )}
        </div>

        {/* ── フッター ── */}
        <div className="cm-footer">
          <button onClick={onClose} className="cm-btn-cancel">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={isOverLimit}
            className="cm-btn-post"
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
            </svg>
            ポスト
          </button>
        </div>
      </div>

      <style>{`
        /* ── オーバーレイ ── */
        .cm-overlay {
          background: rgba(15, 23, 42, 0.65);
          backdrop-filter: blur(6px);
          animation: cm-fadein 0.2s ease-out forwards;
        }
        @keyframes cm-fadein {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── モーダル本体 ── */
        .cm-modal {
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 32px 64px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08);
          animation: cm-slideup 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }
        @keyframes cm-slideup {
          from { opacity: 0; transform: translateY(24px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }

        /* ── ヘッダー ── */
        .cm-header {
          padding: 18px 20px 16px;
          background: linear-gradient(135deg, #f472b6 0%, #a855f7 50%, #6366f1 100%);
          position: relative;
          overflow: hidden;
        }
        .cm-deco-circle {
          position: absolute;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 70%);
        }
        .cm-deco-circle-1 { width: 100px; height: 100px; top: -40px; right: -20px; }
        .cm-deco-circle-2 { width: 60px;  height: 60px;  bottom: -25px; left: -10px; opacity: 0.6; }

        .cm-icon-wrap {
          width: 36px; height: 36px;
          border-radius: 10px;
          background: rgba(255,255,255,0.2);
          display: flex; align-items: center; justify-content: center;
          backdrop-filter: blur(4px);
          flex-shrink: 0;
        }
        .cm-close-btn {
          width: 30px; height: 30px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          display: flex; align-items: center; justify-content: center;
          color: white;
          transition: background 0.15s;
        }
        .cm-close-btn:hover { background: rgba(255,255,255,0.35); }

        /* ── 本文 ── */
        .cm-body {
          background: #ffffff;
          padding: 20px;
        }

        .cm-textarea-wrap {
          position: relative;
        }
        .cm-textarea {
          width: 100%;
          padding: 12px 14px;
          padding-bottom: 28px;
          border: 1.5px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
          font-size: 14px;
          line-height: 1.65;
          color: #1e293b;
          resize: none;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          font-family: inherit;
        }
        .cm-textarea::placeholder { color: #94a3b8; }
        .cm-textarea:focus {
          border-color: #a855f7;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(168,85,247,0.12);
        }

        .cm-counter {
          position: absolute;
          bottom: 8px; right: 12px;
          font-size: 11px;
          font-weight: 600;
          color: #94a3b8;
          transition: color 0.2s;
          pointer-events: none;
        }
        .cm-counter-near { color: #f59e0b; }
        .cm-counter-over { color: #ef4444; }

        /* プレビュー */
        .cm-preview {
          margin-top: 12px;
          padding: 10px 14px;
          background: linear-gradient(135deg, #fdf4ff, #eff6ff);
          border: 1px solid #e9d5ff;
          border-radius: 10px;
        }

        /* ── フッター ── */
        .cm-footer {
          background: #f8fafc;
          border-top: 1px solid #f1f5f9;
          padding: 14px 20px;
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
        }
        .cm-btn-cancel {
          padding: 8px 18px;
          border-radius: 10px;
          border: 1.5px solid #e2e8f0;
          background: white;
          color: #64748b;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.15s;
        }
        .cm-btn-cancel:hover { background: #f1f5f9; border-color: #cbd5e1; }

        .cm-btn-post {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 20px;
          border-radius: 10px;
          background: linear-gradient(135deg, #a855f7, #6366f1);
          color: white;
          font-size: 13px;
          font-weight: 700;
          transition: all 0.15s;
          box-shadow: 0 4px 12px rgba(168,85,247,0.35);
        }
        .cm-btn-post:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(168,85,247,0.45);
        }
        .cm-btn-post:active:not(:disabled) { transform: translateY(0); }
        .cm-btn-post:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; }
      `}</style>
    </div>,
    document.body
  );
};

export default CommentModal;
