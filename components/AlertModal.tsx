import React from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from './icons';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const AlertModal: React.FC<AlertModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[70] transition-opacity duration-300 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col transform transition-all duration-300 scale-95 animate-fade-in-up" 
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-yellow-600">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 transition">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 text-slate-600">
          {children}
        </div>
        
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end items-center gap-3">
            <button 
              onClick={onClose} 
              className="bg-[#0193be] text-white font-bold py-2 px-5 rounded-lg hover:bg-[#017a9a] transition"
            >
                OK
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

export default AlertModal;
