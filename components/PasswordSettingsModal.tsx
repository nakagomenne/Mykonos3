import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon, LockClosedIcon } from './icons';
import { MASTER_PASSWORD } from '../constants';

interface PasswordSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newPassword: string) => void;
  currentUserPassword?: string;
}

const PasswordSettingsModal: React.FC<PasswordSettingsModalProps> = ({ isOpen, onClose, onSave, currentUserPassword }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    setError('');
    if (currentPassword !== currentUserPassword && currentPassword !== MASTER_PASSWORD) {
      setError('現在のパスワードが正しくありません。');
      return;
    }
    if (!newPassword) {
      setError('新しいパスワードを入力してください。');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('新しいパスワードが一致しません。');
      return;
    }
    onSave(newPassword);
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
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <LockClosedIcon className="w-5 h-5 text-slate-600" />
            パスワード設定
          </h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 transition">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="current-password"  className="block text-sm font-medium text-slate-700 mb-1">現在のパスワード</label>
            <input id="current-password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition"/>
          </div>
          <div>
            <label htmlFor="new-password"  className="block text-sm font-medium text-slate-700 mb-1">新しいパスワード</label>
            <input id="new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition"/>
          </div>
          <div>
            <label htmlFor="confirm-password"  className="block text-sm font-medium text-slate-700 mb-1">新しいパスワード (確認)</label>
            <input id="confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition"/>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
        
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end items-center gap-3">
            <button 
              onClick={onClose} 
              className="bg-white text-slate-700 border border-slate-300 font-bold py-2 px-4 rounded-lg hover:bg-slate-50 transition"
            >
                キャンセル
            </button>
            <button 
              onClick={handleSave} 
              className="bg-[#0193be] text-white font-bold py-2 px-4 rounded-lg hover:bg-[#017a9a] transition"
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

export default PasswordSettingsModal;
