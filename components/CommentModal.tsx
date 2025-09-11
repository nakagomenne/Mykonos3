import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (isOpen) {
      setComment(initialComment);
    }
  }, [isOpen, initialComment]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(comment);
    onClose();
  };

  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 transition-opacity duration-300 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col transform transition-all duration-300 scale-95 animate-fade-in-up" 
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">コメント設定</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 transition">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6">
          <div className="flex justify-between items-center mb-2">
            <label htmlFor="user-comment" className="block text-sm font-medium text-slate-700">
                コメント (30文字まで)
            </label>
            <button onClick={() => setComment('')} className="text-sm text-[#0193be] hover:underline">
              クリア
            </button>
          </div>
          <div className="relative">
              <input
                  type="text"
                  id="user-comment"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={30}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition"
              />
              <div className="absolute bottom-2 right-2 text-xs text-slate-400 pointer-events-none">
                  {comment.length} / 30
              </div>
          </div>
        </div>
        
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end items-center gap-3">
            <button 
              onClick={onClose} 
              className="bg-white text-slate-700 border border-slate-300 font-bold py-2 px-5 rounded-lg hover:bg-slate-50 transition"
            >
                キャンセル
            </button>
            <button 
              onClick={handleSave} 
              className="bg-[#0193be] text-white font-bold py-2 px-5 rounded-lg hover:bg-[#017a9a] transition"
            >
                保存
            </button>
        </div>
      </div>
      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.3s ease-out forwards;
        }
      `}</style>
    </div>,
    document.body
  );
};

export default CommentModal;
