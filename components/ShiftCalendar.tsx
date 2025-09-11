import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User, AvailabilityStatus } from '../types';
import { ChevronLeftIcon, ChevronRightIcon, UserIcon, XMarkIcon } from './icons';
import { AVAILABILITY_STATUS_STYLES } from '../constants';

interface ShiftCalendarProps {
  users: User[];
  onSelectMemberWithDate: (memberName: string, date: Date) => void;
}

interface PopupData {
  date: Date;
  members: User[];
  position: { top: number; left: number };
  isToday: boolean;
}

const ShiftCalendar: React.FC<ShiftCalendarProps> = ({ users, onSelectMemberWithDate }) => {
  const [displayDate, setDisplayDate] = useState(new Date());
  const [popupData, setPopupData] = useState<PopupData | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<'回線' | '水' | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const changeMonth = (amount: number) => {
    setDisplayDate(prev => new Date(prev.getFullYear(), prev.getMonth() + amount, 1));
  };

  useEffect(() => {
    if (!popupData) {
      setSelectedProduct(null);
    }
  }, [popupData]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPopupData(null);
      }
    };
    const handleClickOutsidePopup = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setPopupData(null);
      }
    };

    if (popupData) {
      document.addEventListener('keydown', handleEscape);
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutsidePopup);
      }, 0);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutsidePopup);
    };
  }, [popupData]);

  const calendarGrid = useMemo(() => {
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const grid: (Date | null)[][] = [];
    let day = 1;
    for (let i = 0; i < 6; i++) {
      const week: (Date | null)[] = [];
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
  }, [displayDate]);

  const handleDayClick = (date: Date, event: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedProduct(null);
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    const workingMembers = users.filter(user => !(user.nonWorkingDays || []).includes(dateStr));

    const rect = event.currentTarget.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;

    const popupWidth = 224; // w-56
    const popupHeight = 300; // estimated max height

    if (left + popupWidth > window.innerWidth - 16) {
      left = rect.right + window.scrollX - popupWidth;
    }
    if (top + popupHeight > window.innerHeight - 16) {
      top = rect.top + window.scrollY - popupHeight - 8;
    }

    const isTodayClicked = date.getTime() === today.getTime();

    setPopupData({
      date,
      members: workingMembers,
      position: { top: Math.max(8, top), left: Math.max(8, left) },
      isToday: isTodayClicked,
    });
  };

  const handleMemberSelect = (memberName: string) => {
    if (popupData) {
      onSelectMemberWithDate(memberName, popupData.date);
      setPopupData(null);
    }
  };

  return (
    <div className="bg-white max-w-md mx-auto">
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => changeMonth(-1)} className="p-2 rounded-full hover:bg-slate-100 transition">
          <ChevronLeftIcon className="w-5 h-5 text-slate-600" />
        </button>
        <h3 className="text-base font-semibold text-[#0193be]">
          {displayDate.getFullYear()}年 {displayDate.getMonth() + 1}月
        </h3>
        <button onClick={() => changeMonth(1)} className="p-2 rounded-full hover:bg-slate-100 transition">
          <ChevronRightIcon className="w-5 h-5 text-slate-600" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {['日', '月', '火', '水', '木', '金', '土'].map(day => (
          <div key={day} className="font-medium text-slate-500 py-1">{day}</div>
        ))}
        {calendarGrid.flat().map((date, index) => {
          if (!date) return <div key={`empty-${index}`} />;
          
          const isToday = date.getTime() === today.getTime();
          const buttonClasses = [
            'w-9 h-9 flex items-center justify-center rounded-full text-sm',
            'transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0193be]',
            isToday ? 'bg-[#0193be] text-white font-bold' : 'text-slate-700 hover:bg-sky-100 hover:text-sky-700',
          ].filter(Boolean).join(' ');

          return (
            <div key={date.toISOString()} className="py-1 flex justify-center">
              <button onClick={(e) => handleDayClick(date, e)} className={buttonClasses}>
                {date.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      {popupData && createPortal(
        <div 
            ref={popupRef}
            className="fixed z-[60] bg-white rounded-lg shadow-xl border border-slate-200 w-56 animate-fade-in-up flex flex-col"
            style={{ top: popupData.position.top, left: popupData.position.left }}
            onClick={e => e.stopPropagation()}
        >
          {!selectedProduct ? (
            <>
              <div className="p-2 border-b flex justify-between items-center flex-shrink-0">
                <h4 className="text-sm font-semibold text-[#0193be]">
                  {popupData.date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })} - 商材を選択
                </h4>
                <button onClick={() => setPopupData(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-full">
                    <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <div className="p-2 space-y-1">
                <button 
                  onClick={() => setSelectedProduct('回線')}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition rounded-md"
                >
                  回線
                </button>
                <button 
                  onClick={() => setSelectedProduct('水')}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition rounded-md"
                >
                  水
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-2 border-b flex justify-between items-center flex-shrink-0">
                <button onClick={() => setSelectedProduct(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-full">
                    <ChevronLeftIcon className="w-4 h-4" />
                </button>
                <h4 className="text-sm font-semibold text-[#0193be]">
                    {selectedProduct} 対応可能
                </h4>
                <button onClick={() => setPopupData(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded-full">
                    <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
              <ul className="max-h-64 overflow-y-auto">
                {(() => {
                  const productToFilter = selectedProduct;
                  let filteredMembers = popupData.members.filter(member => 
                      (member.availableProducts || []).includes(productToFilter)
                  );
                  
                  if (popupData.isToday) {
                      const statusOrder: Record<AvailabilityStatus, number> = {
                          '受付可': 1,
                          '受付不可': 2,
                          '当日受付不可': 3,
                          '非稼働': 4,
                      };
                      filteredMembers.sort((a, b) => {
                          const statusA = statusOrder[a.availabilityStatus] || 99;
                          const statusB = statusOrder[b.availabilityStatus] || 99;
                          if (statusA !== statusB) {
                              return statusA - statusB;
                          }
                          return a.name.localeCompare(b.name);
                      });
                  }
                  
                  if (filteredMembers.length > 0) {
                    return filteredMembers.map(member => (
                      <li key={member.name}>
                        <button 
                          onClick={() => handleMemberSelect(member.name)} 
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 transition"
                        >
                          {member.profilePicture ? (
                              <img src={member.profilePicture} alt={member.name} className="w-6 h-6 rounded-full object-cover" />
                          ) : (
                              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                  <UserIcon className="w-4 h-4"/>
                              </div>
                          )}
                          <span>{member.name}</span>
                          {popupData.isToday && (
                              <span
                                  className={`ml-auto block h-2.5 w-2.5 rounded-full ${AVAILABILITY_STATUS_STYLES[member.availabilityStatus].bg}`}
                                  title={`稼働状況: ${member.availabilityStatus}`}
                              />
                          )}
                        </button>
                      </li>
                    ));
                  } else {
                    return <li className="p-3 text-sm text-slate-500 text-center">対応可能なメンバーがいません</li>;
                  }
                })()}
              </ul>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default ShiftCalendar;