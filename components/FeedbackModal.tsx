import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FeedbackType } from '../types';
import { XMarkIcon, ExclamationCircleIcon, LightBulbIcon, SpeechBubbleIcon } from './icons';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (type: FeedbackType, title: string, body: string) => Promise<void>;
}

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: React.ReactNode; color: string }[] = [
  {
    value: 'bug',
    label: 'バグ報告',
    icon: <ExclamationCircleIcon className="w-5 h-5" />,
    color: 'border-red-400 bg-red-50 text-red-600',
  },
  {
    value: 'request',
    label: '機能要望',
    icon: <LightBulbIcon className="w-5 h-5" />,
    color: 'border-yellow-400 bg-yellow-50 text-yellow-600',
  },
  {
    value: 'other',
    label: 'その他',
    icon: <SpeechBubbleIcon className="w-5 h-5" />,
    color: 'border-slate-400 bg-slate-50 text-slate-600',
  },
];

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(type, title.trim(), body.trim());
      setIsDone(true);
      setTimeout(() => {
        setIsDone(false);
        setTitle('');
        setBody('');
        setType('bug');
        onClose();
      }, 1500);
    } catch (err: any) {
      alert(`送信に失敗しました: ${err?.message ?? err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[300] animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-[#0193be]">バグ報告 / 要望</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {isDone ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <svg className="w-14 h-14 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-slate-600 font-medium">送信しました！</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* 種別選択 */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">種別</label>
              <div className="flex gap-2">
                {TYPE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border-2 text-xs font-semibold transition ${
                      type === opt.value
                        ? opt.color + ' border-current'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {opt.icon}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* タイトル */}
            <div>
              <label htmlFor="fb-title" className="block text-sm font-medium text-slate-600 mb-1">
                タイトル <span className="text-red-500">*</span>
              </label>
              <input
                id="fb-title"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例: 案件一覧が表示されない"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0193be] focus:border-[#0193be] transition"
                required
                autoFocus
              />
            </div>

            {/* 詳細 */}
            <div>
              <label htmlFor="fb-body" className="block text-sm font-medium text-slate-600 mb-1">
                詳細（任意）
              </label>
              <textarea
                id="fb-body"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="再現手順や要望の詳細を記入してください"
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0193be] focus:border-[#0193be] transition"
              />
            </div>

            {/* ボタン */}
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !title.trim()}
                className="px-5 py-2 text-sm font-bold text-white bg-[#0193be] rounded-lg hover:bg-[#017a9a] disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {isSubmitting ? '送信中…' : '送信する'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default FeedbackModal;
