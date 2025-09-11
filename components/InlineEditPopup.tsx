
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CallRequest, ListType, Rank, User } from '../types';
import { LIST_TYPE_OPTIONS, RANK_OPTIONS, ALL_TIME_OPTIONS, PRECHECK_ALL_TIME_OPTIONS, SPECIAL_TIME_OPTIONS_TOP, PRECHECK_SPECIAL_TIME_OPTIONS_TOP, TIME_SLOTS, NON_PRECHECK_RANK_OPTIONS } from '../constants';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import AlertModal from './AlertModal';

type EditableField = 'dateTime' | 'listType' | 'rank' | 'notes' | 'assignee' | 'requester';

interface InlineEditPopupProps {
  field: EditableField;
  call: CallRequest;
  onSave: (updatedData: Partial<Omit<CallRequest, 'id'>>) => void;
  onClose: () => void;
  targetRect: DOMRect;
  members: string[];
  users: User[];
  isPrecheckTheme?: boolean;
}

const FIELD_TITLES: Record<EditableField, string> = {
    dateTime: '日時を編集',
    listType: 'リスト種別を編集',
    rank: 'ランクを編集',
    notes: '備考を編集',
    assignee: '担当者を編集',
    requester: '依頼者を編集',
};


const InlineEditPopup: React.FC<InlineEditPopupProps> = ({ field, call, onSave, onClose, targetRect, members, users, isPrecheckTheme = false }) => {
    const popupRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });
    const today = useMemo(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }, []);

    const [date, setDate] = useState(call.dateTime.split('T')[0]);
    const [time, setTime] = useState(call.dateTime.split('T')[1]);
    const [listType, setListType] = useState<ListType | ''>(call.listType);
    const [rank, setRank] = useState<Rank>(call.rank);
    const [notes, setNotes] = useState(call.notes);
    const [member, setMember] = useState(call.assignee);
    const [requester, setRequester] = useState(call.requester);

    const [isAlertOpen, setIsAlertOpen] = useState(false);
    const [alertContent, setAlertContent] = useState({ title: '', message: '' });

    // Calendar state
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [calendarDisplayDate, setCalendarDisplayDate] = useState(new Date(call.dateTime.split('T')[0] + 'T00:00:00'));
    const dateInputRef = useRef<HTMLDivElement>(null);
    const calendarRef = useRef<HTMLDivElement>(null);
    const [calendarPosition, setCalendarPosition] = useState<{ top: number; left: number } | null>(null);

    const assigneeNonWorkingDays = useMemo(() => {
        const user = users.find(u => u.name === call.assignee);
        return new Set(user?.nonWorkingDays || []);
    }, [call.assignee, users]);

    const timeOptions = isPrecheckTheme ? PRECHECK_ALL_TIME_OPTIONS : ALL_TIME_OPTIONS;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                popupRef.current && !popupRef.current.contains(event.target as Node) &&
                (!calendarRef.current || !calendarRef.current.contains(event.target as Node))
            ) {
                onClose();
            }
             if (
                isCalendarOpen &&
                dateInputRef.current && !dateInputRef.current.contains(event.target as Node) &&
                calendarRef.current && !calendarRef.current.contains(event.target as Node)
            ) {
                setIsCalendarOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose, isCalendarOpen]);

    useEffect(() => {
      if (popupRef.current) {
        const popupRect = popupRef.current.getBoundingClientRect();
        let top = targetRect.bottom + window.scrollY + 4;
        let left = targetRect.left + window.scrollX;

        if (left + popupRect.width > window.innerWidth) {
            left = window.innerWidth - popupRect.width - 8;
        }
        if (top + popupRect.height > window.innerHeight) {
            top = targetRect.top + window.scrollY - popupRect.height - 4;
        }
        
        setPosition({ top, left });
      }
    }, [targetRect]);


    const handleSave = () => {
        let updatedData: Partial<Omit<CallRequest, 'id'>> = {};
        switch (field) {
            case 'dateTime':
                const specialTimesForToday = isPrecheckTheme ? PRECHECK_SPECIAL_TIME_OPTIONS_TOP : SPECIAL_TIME_OPTIONS_TOP;
                if (specialTimesForToday.includes(time) && date !== today) {
                    setAlertContent({ title: '日付エラー', message: `「${time}」が選択されている場合、日付は本日である必要があります。` });
                    setIsAlertOpen(true);
                    return;
                }
                updatedData = { dateTime: `${date}T${time}` };
                break;
            case 'listType':
                updatedData = { listType };
                break;
            case 'rank':
                updatedData = { rank };
                break;
            case 'notes':
                updatedData = { notes };
                break;
            case 'assignee':
                updatedData = { assignee: member };
                break;
            case 'requester':
                updatedData = { requester };
                break;
        }
        onSave(updatedData);
    };
    
    const getOptionsWithCurrent = (options: string[], currentValue: string) => {
        const optionSet = new Set(options);
        if (!optionSet.has(currentValue)) {
          optionSet.add(currentValue);
        }
        return Array.from(optionSet);
    };

    const calendarGrid = useMemo(() => {
        const year = calendarDisplayDate.getFullYear();
        const month = calendarDisplayDate.getMonth();
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
    }, [calendarDisplayDate]);

    const mainColorClass = isPrecheckTheme ? 'text-[#118f82]' : 'text-[#0193be]';
    const mainRingClass = isPrecheckTheme ? 'focus:ring-[#118f82]' : 'focus:ring-[#0193be]';
    const mainBorderClass = isPrecheckTheme ? 'focus:border-[#118f82]' : 'focus:border-[#0193be]';
    const mainBgClass = isPrecheckTheme ? 'bg-[#118f82]' : 'bg-[#0193be]';
    const mainHoverBgClass = isPrecheckTheme ? 'hover:bg-[#0e7268]' : 'hover:bg-[#017a9a]';

    const rankOptionsForPopup = useMemo(() => {
        const options = isPrecheckTheme ? RANK_OPTIONS : NON_PRECHECK_RANK_OPTIONS;
        if (!options.includes(call.rank)) {
            return [call.rank, ...options];
        }
        return options;
    }, [isPrecheckTheme, call.rank]);

    const CalendarPopup = (
    <div
      ref={calendarRef}
      className="fixed z-[60] bg-white rounded-lg shadow-xl border border-slate-200 p-3 w-72"
      style={calendarPosition ? { top: `${calendarPosition.top}px`, left: `${calendarPosition.left}px` } : {}}
      onClick={e => e.stopPropagation()}
    >
        <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setCalendarDisplayDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-1 rounded-full hover:bg-slate-100 transition">
                <ChevronLeftIcon className="w-5 h-5 text-slate-600" />
            </button>
            <div className="font-semibold text-slate-700">
                {calendarDisplayDate.getFullYear()}年 {calendarDisplayDate.getMonth() + 1}月
            </div>
            <button type="button" onClick={() => setCalendarDisplayDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-1 rounded-full hover:bg-slate-100 transition">
                <ChevronRightIcon className="w-5 h-5 text-slate-600" />
            </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['日', '月', '火', '水', '木', '金', '土'].map(day => (
                <div key={day} className="font-medium text-slate-500 py-1">{day}</div>
            ))}
            {calendarGrid.flat().map((dayDate, index) => {
                if (!dayDate) return <div key={`empty-${index}`} />;
                
                const dateStr = `${dayDate.getFullYear()}-${(dayDate.getMonth() + 1).toString().padStart(2, '0')}-${dayDate.getDate().toString().padStart(2, '0')}`;
                const isNonWorking = assigneeNonWorkingDays.has(dateStr);
                const isSelected = dateStr === date;
                
                const localToday = new Date();
                localToday.setHours(0,0,0,0);
                const dayDateObj = new Date(dayDate);
                dayDateObj.setHours(0,0,0,0);

                const isTodayDate = dayDateObj.getTime() === localToday.getTime();
                const isPast = dayDateObj < localToday;
                const isDisabled = isNonWorking || isPast;

                let daySpecificClasses = 'text-slate-700 hover:bg-sky-100';

                if (isDisabled) {
                    daySpecificClasses = 'bg-slate-200 text-slate-400 cursor-not-allowed';
                } else if (isSelected) {
                    daySpecificClasses = `${mainBgClass} text-white font-bold ${mainHoverBgClass}`;
                } else if (isTodayDate) {
                    daySpecificClasses = `${mainBgClass} text-white font-bold ${mainHoverBgClass}`;
                }

                const buttonClasses = [
                    `w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${mainRingClass}`,
                    daySpecificClasses,
                ].filter(Boolean).join(' ');


                return (
                    <div key={dateStr} className="py-1 flex justify-center items-center">
                        <button 
                            type="button"
                            onClick={() => {
                                setDate(dateStr);
                                setIsCalendarOpen(false);
                            }} 
                            className={buttonClasses}
                            disabled={isDisabled}
                        >
                            {dayDate.getDate()}
                        </button>
                    </div>
                );
            })}
        </div>
    </div>
    );

    const renderField = () => {
        switch (field) {
            case 'dateTime':
                return (
                    <>
                        <div className={`flex items-center border border-slate-300 rounded-md shadow-sm focus-within:ring-1 ${isPrecheckTheme ? 'focus-within:ring-[#118f82] focus-within:border-[#118f82]' : 'focus-within:ring-[#0193be] focus-within:border-[#0193be]'} transition`}>
                            <div ref={dateInputRef} className="relative w-1/2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isCalendarOpen) {
                                            setIsCalendarOpen(false);
                                        } else {
                                            if (popupRef.current) {
                                                const popupRect = popupRef.current.getBoundingClientRect();
                                                const calendarHeight = 320; 
                                                const calendarWidth = 288;
                                                let top = popupRect.top;
                                                let left = popupRect.left - calendarWidth - 8;
                                                
                                                if(left < 0){
                                                  left = popupRect.right + 8
                                                }
                                                if(left + calendarWidth > window.innerWidth){
                                                  left = window.innerWidth - calendarWidth - 8
                                                }
                                                if (top + calendarHeight > window.innerHeight) {
                                                    top = window.innerHeight - calendarHeight - 8;
                                                }
                                                if (top < 0) top = 8;
                                                
                                                setCalendarPosition({ top, left });
                                            }
                                            setCalendarDisplayDate(new Date(date + 'T00:00:00'));
                                            setIsCalendarOpen(true);
                                        }
                                    }}
                                    className={`w-full text-left px-3 py-1.5 border-0 rounded-l-md focus:ring-0 ${mainColorClass} disabled:bg-slate-100 disabled:cursor-not-allowed`}
                                >
                                    {date}
                                </button>
                            </div>
                            <select value={time} onChange={(e) => setTime(e.target.value)} className={`w-1/2 px-2 py-1.5 border-0 border-l border-slate-300 rounded-r-md bg-white focus:ring-0 transition ${mainColorClass}`}>
                                {timeOptions.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                            </select>
                        </div>
                        {isCalendarOpen && createPortal(CalendarPopup, document.body)}
                    </>
                );
            case 'listType':
                return (
                    <select value={listType} onChange={(e) => setListType(e.target.value as ListType)} className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
                        {LIST_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                );
            case 'rank':
                return (
                    <select value={rank} onChange={(e) => setRank(e.target.value as Rank)} className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
                        {rankOptionsForPopup.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                );
            case 'notes':
                return (
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`} autoFocus></textarea>
                );
            case 'assignee':
                const assigneeOptions = getOptionsWithCurrent(members, call.assignee);
                return (
                     <select value={member} onChange={(e) => setMember(e.target.value)} className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
                        {assigneeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                );
            case 'requester':
                const requesterOptions = getOptionsWithCurrent(members, call.requester);
                return (
                     <select value={requester} onChange={(e) => setRequester(e.target.value)} className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
                        {requesterOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                );
            default:
                return null;
        }
    };
    
    return (
      <>
        {createPortal(
            <div 
              ref={popupRef}
              className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-2 w-80 animate-fade-in"
              style={{ top: position.top, left: position.left }}
              onClick={e => e.stopPropagation()}
            >
                <h4 className={`font-bold text-md mb-1 ${mainColorClass}`}>{FIELD_TITLES[field]}</h4>
                <div className="space-y-2">
                    {renderField()}
                    <div className="flex justify-end gap-2 pt-1">
                        <button onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition">キャンセル</button>
                        <button onClick={handleSave} className={`px-3 py-1.5 text-sm font-medium text-white ${mainBgClass} rounded-md ${mainHoverBgClass} transition`}>保存</button>
                    </div>
                </div>
                <style>{`
                    @keyframes fade-in {
                        from { opacity: 0; transform: translateY(-10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .animate-fade-in {
                        animation: fade-in 0.15s ease-out forwards;
                    }
                `}</style>
            </div>,
            document.body
        )}
        <AlertModal
            isOpen={isAlertOpen}
            onClose={() => setIsAlertOpen(false)}
            title={alertContent.title}
        >
            <p>{alertContent.message}</p>
        </AlertModal>
      </>
    );
};

export default InlineEditPopup;
