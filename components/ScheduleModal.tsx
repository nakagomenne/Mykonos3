import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User } from '../types';
import { XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSave?: (userName: string, dates: string[]) => void;
  readOnly?: boolean;
}

const ScheduleModal: React.FC<ScheduleModalProps> = ({ isOpen, onClose, user, onSave, readOnly = false }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
        setSelectedDates(new Set(user.nonWorkingDays || []));
        setCurrentDate(new Date());
    }
  }, [isOpen, user]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const calendarGrid = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const grid = [];
    let day = 1;
    for (let i = 0; i < 6; i++) {
      const week = [];
      for (let j = 0; j < 7; j++) {
        if (i === 0 && j < firstDayOfMonth) {
          week.push(null);
        } else if (day > daysInMonth) {
          week.push(null);
        } else {
          week.push(new Date(year, month, day));
          day++;
        }
      }
      grid.push(week);
      if (day > daysInMonth) break;
    }
    return grid;
  }, [currentDate]);

  const handleDayClick = (date: Date) => {
    if (readOnly) return;
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    setSelectedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateStr)) {
        newSet.delete(dateStr);
      } else {
        newSet.add(dateStr);
      }
      return newSet;
    });
  };

  const handleSave = () => {
    if (onSave) {
        onSave(user.name, Array.from(selectedDates));
    }
    onClose();
  };

  const changeMonth = (amount: number) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev.getFullYear(), prev.getMonth() + amount, 1);
      return newDate;
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 transition-opacity duration-300 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col transform transition-all duration-300 scale-95 animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">{readOnly ? `${user.name}さんの非稼働日` : 'スケジュール設定 (非稼働日)'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 transition">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-slate-100 transition">
              <ChevronLeftIcon className="w-5 h-5 text-slate-600" />
            </button>
            <h3 className="text-lg font-semibold text-[#0193be]">
              {currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月
            </h3>
            <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-slate-100 transition">
              <ChevronRightIcon className="w-5 h-5 text-slate-600" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm">
            {['日', '月', '火', '水', '木', '金', '土'].map(day => (
              <div key={day} className="font-medium text-slate-500 py-2">{day}</div>
            ))}
            {calendarGrid.flat().map((date, index) => {
              if (!date) return <div key={`empty-${index}`} />;
              
              const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
              const isSelected = selectedDates.has(dateStr);
              const isToday = date.getTime() === today.getTime();

              let dayClasses = `text-slate-700 ${!readOnly ? 'hover:bg-slate-100' : ''}`;
              if (isSelected) {
                dayClasses = `bg-slate-400 text-white ${!readOnly ? 'hover:bg-slate-500' : ''}`;
              } else if (isToday) {
                dayClasses = 'bg-[#0193be] text-white font-bold';
              }

              if(readOnly) {
                dayClasses += ' cursor-default';
              }

              const buttonClasses = [
                'w-10 h-10 flex items-center justify-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0193be]',
                dayClasses,
              ].filter(Boolean).join(' ');

              return (
                <div key={dateStr} className="py-1 flex justify-center items-center">
                  <button onClick={() => handleDayClick(date)} className={buttonClasses} disabled={readOnly}>
                    {date.getDate()}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end items-center gap-3">
            {readOnly ? (
                 <button 
                  onClick={onClose} 
                  className="bg-[#0193be] text-white font-bold py-2 px-5 rounded-lg hover:bg-[#017a9a] transition"
                >
                  閉じる
                </button>
            ) : (
                <>
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
                </>
            )}
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

export default ScheduleModal;