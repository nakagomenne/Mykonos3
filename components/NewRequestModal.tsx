import React, { useState, useEffect } from 'react';
import CallRequestForm from './CallRequestForm';
import { CallRequest, User } from '../types';
import { XMarkIcon, PhoneIcon } from './icons';

interface NewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCall: (call: Omit<CallRequest, 'id' | 'status'>) => boolean;
  currentUser: string;
  users: User[];
  formResetCounter: number;
}

const NewRequestModal: React.FC<NewRequestModalProps> = ({ isOpen, onClose, onAddCall, currentUser, users, formResetCounter }) => {
  const [shouldRender, setShouldRender] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
    } else {
      // When isOpen becomes false, start animation and then unmount after 300ms
      const timeoutId = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const animationClass = isOpen ? 'animate-reveal-from-top-right' : 'animate-hide-to-top-right';

  return (
    // The backdrop container uses responsive padding to match the header's content area.
    // `justify-end items-start` positions the modal box in the top-right of this padded area.
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-end items-start p-4 sm:p-6 lg:p-8 z-50 transition-opacity duration-300" onClick={onClose}>
      {/* 
        - `mt-1` is precisely calculated to align the modal's top edge with the "New Request" button's top edge.
        - `clip-path` and `opacity` animation reveals/hides the content from the top-right corner.
        - `max-h` is adjusted to account for the new top position, preventing viewport overflow.
      */}
      <div 
        className={`bg-slate-50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[calc(100vh-2.75rem)] flex flex-col ${animationClass} mt-1`}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-200 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <PhoneIcon className="w-6 h-6 text-[#0193be]" />
            <h2 className="text-2xl font-bold text-[#0193be]">新規架電依頼</h2>
          </div>
          <button onClick={onClose} className="text-[#0193be]/80 hover:text-[#0193be] transition">
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          <CallRequestForm onAddCall={onAddCall} currentUser={currentUser} users={users} formResetCounter={formResetCounter} />
        </div>
      </div>
       <style>{`
        @keyframes reveal-from-top-right {
          from { 
            clip-path: polygon(100% 0, 100% 0, 100% 0, 100% 0);
            opacity: 0;
          }
          to {
            clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
            opacity: 1;
          }
        }
        .animate-reveal-from-top-right {
          animation: reveal-from-top-right 0.3s ease-out forwards;
        }

        @keyframes hide-to-top-right {
          from { 
            clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
            opacity: 1;
          }
          to {
            clip-path: polygon(100% 0, 100% 0, 100% 0, 100% 0);
            opacity: 0;
          }
        }
        .animate-hide-to-top-right {
          animation: hide-to-top-right 0.3s ease-in forwards;
        }
      `}</style>
    </div>
  );
};

export default NewRequestModal;