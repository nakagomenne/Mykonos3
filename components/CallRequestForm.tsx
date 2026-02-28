import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CallRequest, ListType, Rank, User } from '../types';
import { RANK_OPTIONS, TIME_SLOTS, AVAILABILITY_STATUS_STYLES, ALL_TIME_OPTIONS, PRECHECK_ALL_TIME_OPTIONS, SPECIAL_TIME_OPTIONS_TOP, PRECHECK_SPECIAL_TIME_OPTIONS_TOP, LIST_TYPE_OPTIONS, PRECHECK_RANK_OPTIONS, PRECHECKER_ASSIGNEE_NAME, NON_PRECHECK_RANK_OPTIONS } from '../constants';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';
import AlertModal from './AlertModal';

interface CallRequestFormProps {
  onAddCall: (call: Omit<CallRequest, 'id' | 'status' | 'createdAt'>) => boolean;
  defaultAssignee?: string;
  currentUser: string;
  users: User[];
  formResetCounter: number;
  onAssigneeChange?: (assignee: string) => void;
  enableProductFiltering?: boolean;
  assigneeNonWorkingDays?: string[];
  isPrecheckMode?: boolean;
  isPrecheckTheme?: boolean;
  prefilledDate?: string | null;
  onPrefillConsumed?: () => void;
  isDarkMode?: boolean;
}

const getInitialDateTime = () => {
    const now = new Date();
    
    const nextSlotToday = TIME_SLOTS.find(slot => {
        const [slotHour, slotMinute] = slot.split(':').map(Number);
        const slotDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), slotHour, slotMinute);
        return slotDate > now;
    });

    if (nextSlotToday) {
        return {
            date: now.toISOString().split('T')[0],
            time: nextSlotToday,
        };
    } else {
        const tomorrow = new Date();
        tomorrow.setDate(now.getDate() + 1);
        return {
            date: tomorrow.toISOString().split('T')[0],
            time: TIME_SLOTS[0] || '',
        };
    }
};

const getListTypeForAssignee = (
    assigneeName: string | undefined, 
    users: User[]
): ListType | '' => {
    if (!assigneeName) return '';
    
    const user = users.find(u => u.name === assigneeName);
    if (!user || !user.availableProducts || user.availableProducts.length === 0) return '';

    const hasKaisen = user.availableProducts.includes('回線');
    const hasMizu = user.availableProducts.includes('水');
    
    if (hasKaisen && hasMizu) return '';
    if (hasKaisen) return '回線';
    if (hasMizu) return 'MF';
    
    return '';
};


const CallRequestForm: React.FC<CallRequestFormProps> = ({ onAddCall, defaultAssignee, currentUser, users, formResetCounter, onAssigneeChange, enableProductFiltering = false, isPrecheckMode = false, isPrecheckTheme = false, prefilledDate = null, onPrefillConsumed = () => {}, isDarkMode = false }) => {
  const [customerId, setCustomerId] = useState('');
  const [assignee, setAssignee] = useState(defaultAssignee || '');
  const [listType, setListType] = useState<ListType | ''>(isPrecheckMode ? '回線' : '');
  const [rank, setRank] = useState<Rank | ''>('');
  
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  
  const [notes, setNotes] = useState('');
  
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarDisplayDate, setCalendarDisplayDate] = useState(new Date());
  const dateInputRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [calendarPosition, setCalendarPosition] = useState<{ top: number; left: number } | null>(null);

  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertContent, setAlertContent] = useState({ title: '', message: '' });

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);
  
  const assigneeNonWorkingDays = useMemo(() => {
      const user = users.find(u => u.name === assignee);
      return new Set(user?.nonWorkingDays || []);
  }, [assignee, users]);
  
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

  const timeOptions = isPrecheckMode ? PRECHECK_ALL_TIME_OPTIONS : ALL_TIME_OPTIONS;

  const rankOptionsToDisplay = isPrecheckMode ? PRECHECK_RANK_OPTIONS : NON_PRECHECK_RANK_OPTIONS;

  useEffect(() => {
    if (prefilledDate) {
        setDate(prefilledDate);
        setTime('11:00');
        if (onPrefillConsumed) {
            onPrefillConsumed();
        }
    }
  }, [prefilledDate, onPrefillConsumed]);

  const filteredUsers = useMemo(() => {
    if (isPrecheckMode) {
        return users; // App.tsx will already have filtered to pre-checkers
    }
    if (!enableProductFiltering || !listType) {
      return users;
    }
    if (listType === '回線') {
      return users.filter(user => (user.availableProducts || []).includes('回線'));
    }
    if (['MF', 'OK', 'NG'].includes(listType)) {
      return users.filter(user => (user.availableProducts || []).includes('水'));
    }
    return users;
  }, [users, listType, enableProductFiltering, isPrecheckMode]);
  
  const filteredListTypeOptions = useMemo(() => {
    if (isPrecheckMode) {
        return ['回線'];
    }
    if (!enableProductFiltering || !assignee) {
      return LIST_TYPE_OPTIONS;
    }
    const selectedUser = users.find(user => user.name === assignee);
    if (!selectedUser || !selectedUser.availableProducts || selectedUser.availableProducts.length === 0) {
      return [];
    }
    
    const options: ListType[] = [];
    if (selectedUser.availableProducts.includes('回線')) {
      options.push('回線');
    }
    if (selectedUser.availableProducts.includes('水')) {
      options.push('MF', 'OK', 'NG');
    }
    return options;
  }, [assignee, users, enableProductFiltering, isPrecheckMode]);

  useEffect(() => {
    if (enableProductFiltering && assignee && !defaultAssignee) {
      const isAssigneeValid = filteredUsers.some(user => user.name === assignee);
      if (!isAssigneeValid) {
        setAssignee('');
      }
    }
  }, [filteredUsers, assignee, defaultAssignee, enableProductFiltering]);

  useEffect(() => {
    if (enableProductFiltering && listType && !filteredListTypeOptions.includes(listType as ListType)) {
        setListType('');
    }
  }, [assignee, listType, filteredListTypeOptions, enableProductFiltering]);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(event.target as Node)) {
        setIsAssigneeDropdownOpen(false);
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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCalendarOpen]);

  const resetForm = useCallback(() => {
    setCustomerId('');
    setRank('');
    setNotes('');

    const newAssignee = defaultAssignee || '';
    setAssignee(newAssignee);
    
    if (isPrecheckMode) {
        setListType('回線');
        setDate(new Date().toISOString().split('T')[0]);
        setTime('このあとOK');
        return;
    }

    setListType(getListTypeForAssignee(newAssignee, users));

    const isMineView = defaultAssignee === currentUser;
    const isOthersViewContext = !isMineView;

    if (isOthersViewContext && newAssignee) {
        const assigneeUser = users.find(u => u.name === newAssignee);
        if (assigneeUser && assigneeUser.availabilityStatus === '受付可') {
            setDate(new Date().toISOString().split('T')[0]);
            setTime('このあとOK');
            return;
        }
    }

    const newDefaultDateTime = getInitialDateTime();
    setDate(newDefaultDateTime.date);
    setTime(newDefaultDateTime.time);
  }, [defaultAssignee, isPrecheckMode, users, currentUser]);
  
  useEffect(() => {
    resetForm();
  }, [resetForm]);


  useEffect(() => {
    if (formResetCounter > 0) {
      resetForm();
    }
  }, [formResetCounter, resetForm]);

  useEffect(() => {
    if (onAssigneeChange) {
      onAssigneeChange(assignee);
    }
  }, [assignee, onAssigneeChange]);

  useEffect(() => {
    if (enableProductFiltering && !prefilledDate && !isPrecheckMode) {
        const assigneeUser = users.find(u => u.name === assignee);
        if (assigneeUser && assigneeUser.availabilityStatus === '受付可') {
            setDate(new Date().toISOString().split('T')[0]);
            setTime('このあとOK');
        } else {
            const newDefaultDateTime = getInitialDateTime();
            setDate(newDefaultDateTime.date);
            setTime(newDefaultDateTime.time);
        }
    }
  }, [assignee, users, enableProductFiltering, prefilledDate, isPrecheckMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !assignee || !listType || !rank || !date || !time) {
        setAlertContent({ title: '入力エラー', message: '必須項目をすべて入力してください。' });
        setIsAlertOpen(true);
        return;
    }

    const specialTimesForToday = isPrecheckMode ? PRECHECK_SPECIAL_TIME_OPTIONS_TOP : SPECIAL_TIME_OPTIONS_TOP;
    if (specialTimesForToday.includes(time) && date !== today) {
        setAlertContent({ title: '日付エラー', message: `「${time}」が選択されている場合、日付は本日である必要があります。` });
        setIsAlertOpen(true);
        return;
    }
      
    const success = onAddCall({
      customerId,
      requester: currentUser,
      assignee,
      listType,
      rank,
      dateTime: `${date}T${time}`,
      notes,
    });
    
    if (success) {
      resetForm();
    }
  };
  
  const showAssigneeField = defaultAssignee !== PRECHECKER_ASSIGNEE_NAME;
  const isAssigneeDisabled = !!defaultAssignee && showAssigneeField;


  const mainColorClass = isPrecheckTheme ? 'text-[#118f82]' : 'text-[#0193be]';
  const mainColorClassLight = isPrecheckTheme ? 'text-[#118f82]/80' : 'text-[#0193be]/80';
  const mainRingClass = isPrecheckTheme ? 'focus:ring-[#118f82]' : 'focus:ring-[#0193be]';
  const mainBorderClass = isPrecheckTheme ? 'focus:border-[#118f82]' : 'focus:border-[#0193be]';
  const mainBgClass = isPrecheckTheme ? 'bg-[#118f82]' : 'bg-[#0193be]';
  const mainHoverBgClass = isPrecheckTheme ? 'hover:bg-[#0e7268]' : 'hover:bg-[#017a9a]';

  // ダークモード用フィールドスタイル
  const darkFieldBg    = isDarkMode ? 'bg-[#0f1623]' : 'bg-white';
  const darkFieldBorder = isDarkMode ? 'border-slate-600' : 'border-slate-300';
  const darkFieldText  = isDarkMode ? mainColorClass : mainColorClass;
  const darkFieldDisabled = isDarkMode
    ? 'disabled:bg-[#0a0e16] disabled:text-slate-500 disabled:cursor-not-allowed'
    : 'disabled:bg-slate-100 disabled:cursor-not-allowed';
  const darkDropdownBg = isDarkMode ? 'bg-[#0f1623] border-slate-600' : 'bg-white border-slate-200';
  const darkDropdownHover = isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100';
  const darkClearBtn   = isDarkMode
    ? 'bg-[#0f1623] text-slate-300 border border-slate-600 hover:bg-slate-700'
    : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50';
  
  const CalendarPopup = (
    <div
      ref={calendarRef}
      className={`fixed z-20 rounded-lg shadow-xl border p-3 w-72 ${isDarkMode ? 'bg-[#0f1623] border-slate-600' : 'bg-white border-slate-200'}`}
      style={calendarPosition ? { top: `${calendarPosition.top}px`, left: `${calendarPosition.left}px` } : {}}
    >
        <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setCalendarDisplayDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className={`p-1 rounded-full transition ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                <ChevronLeftIcon className={`w-5 h-5 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`} />
            </button>
            <div className={`font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                {calendarDisplayDate.getFullYear()}年 {calendarDisplayDate.getMonth() + 1}月
            </div>
            <button type="button" onClick={() => setCalendarDisplayDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className={`p-1 rounded-full transition ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                <ChevronRightIcon className={`w-5 h-5 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`} />
            </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {['日', '月', '火', '水', '木', '金', '土'].map(day => (
                <div key={day} className={`font-medium py-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{day}</div>
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

                let daySpecificClasses = isDarkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-sky-100';

                if (isDisabled) {
                    daySpecificClasses = isDarkMode ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-200 text-slate-400 cursor-not-allowed';
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

  return (
    <>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label htmlFor="customerId" className={`block text-sm font-medium ${mainColorClassLight} mb-1`}>顧客ID <span className="text-red-500">*</span></label>
          <input type="text" id="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className={`w-full px-3 py-2 border ${darkFieldBorder} rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition ${mainColorClass} ${darkFieldBg}`} autoComplete="off"/>
        </div>
        {showAssigneeField && (
          <div className="md:col-span-2 relative" ref={assigneeDropdownRef}>
            <label htmlFor="assignee-button" className={`block text-sm font-medium ${mainColorClassLight} mb-1`}>担当者 <span className="text-red-500">*</span></label>
            <input type="hidden" name="assignee" value={assignee} required />
            <button 
              type="button"
              id="assignee-button"
              onClick={() => !isAssigneeDisabled && setIsAssigneeDropdownOpen(prev => !prev)}
              className={`w-full px-3 py-2 border ${darkFieldBorder} rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition ${darkFieldBg} ${mainColorClass} ${darkFieldDisabled} flex justify-between items-center text-left`}
              disabled={isAssigneeDisabled}
              aria-haspopup="listbox"
              aria-expanded={isAssigneeDropdownOpen}
            >
              <span>{assignee || '--'}</span>
              <ChevronDownIcon className={`w-5 h-5 text-slate-400 transition-transform ${isAssigneeDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isAssigneeDropdownOpen && (
                <div className={`absolute z-10 mt-1 w-full rounded-md shadow-lg border max-h-60 overflow-auto ${darkDropdownBg}`}>
                    <ul role="listbox" aria-labelledby="assignee-button">
                        {filteredUsers.map(user => {
                            const status = user.availabilityStatus;
                            const statusStyle = AVAILABILITY_STATUS_STYLES[status];
                            return (
                                <li
                                    key={user.name}
                                    onClick={() => {
                                        setAssignee(user.name);
                                        setIsAssigneeDropdownOpen(false);
                                    }}
                                    className={`px-3 py-2 ${darkDropdownHover} cursor-pointer flex items-center gap-2 ${mainColorClass}`}
                                    role="option"
                                    aria-selected={assignee === user.name}
                                >
                                    <span>{user.name}</span>
                                    <span
                                        className={`block h-2.5 w-2.5 rounded-full ${statusStyle.bg}`}
                                        title={`稼働状況: ${status}`}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
          </div>
        )}
        <div>
          <label htmlFor="listType" className={`block text-sm font-medium ${mainColorClassLight} mb-1`}>リスト種別 <span className="text-red-500">*</span></label>
          <select 
            id="listType" 
            value={listType} 
            onChange={(e) => setListType(e.target.value as ListType)} 
            required 
            disabled={isPrecheckMode}
            className={`w-full px-3 py-2 border ${darkFieldBorder} rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition ${darkFieldBg} ${mainColorClass} ${darkFieldDisabled}`}
          >
            <option value="" disabled>--</option>
            {filteredListTypeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
        <div>
            <label htmlFor="rank" className={`block text-sm font-medium ${mainColorClassLight} mb-1`}>ランク <span className="text-red-500">*</span></label>
            <select id="rank" value={rank} onChange={(e) => setRank(e.target.value as Rank)} required className={`w-full px-3 py-2 border ${darkFieldBorder} rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition ${darkFieldBg} ${mainColorClass}`}>
                <option value="" disabled>--</option>
                {rankOptionsToDisplay.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="date" className={`block text-sm font-medium ${mainColorClassLight} mb-1`}>予定日時 <span className="text-red-500">*</span></label>
          <div className={`flex items-center border ${darkFieldBorder} rounded-md shadow-sm focus-within:ring-1 ${isPrecheckTheme ? 'focus-within:ring-[#118f82] focus-within:border-[#118f82]' : 'focus-within:ring-[#0193be] focus-within:border-[#0193be]'} transition ${darkFieldBg}`}>
              <div ref={dateInputRef} className="relative w-1/2">
                  <button 
                      type="button"
                      id="date" 
                      onClick={() => {
                          if (isCalendarOpen) {
                              setIsCalendarOpen(false);
                          } else {
                              if (dateInputRef.current) {
                                  const rect = dateInputRef.current.getBoundingClientRect();
                                  const calendarHeight = 320; // Approximate height of the calendar
                                  const calendarWidth = 288; // w-72
                                  let top = rect.bottom + 4;
                                  let left = rect.left;

                                  if (top + calendarHeight > window.innerHeight) {
                                      top = rect.top - calendarHeight - 4;
                                  }
                                  if (left + calendarWidth > window.innerWidth) {
                                      left = rect.right - calendarWidth;
                                  }

                                  if (top < 0) top = 4;
                                  if (left < 0) left = 4;
                                  
                                  setCalendarPosition({ top, left });
                              }
                              setCalendarDisplayDate(new Date(date + 'T00:00:00'));
                              setIsCalendarOpen(true);
                          }
                      }}
                      className={`w-full text-left px-3 py-2 border-0 rounded-l-md focus:ring-0 ${mainColorClass} ${isDarkMode ? 'disabled:bg-[#0a0e16] disabled:text-slate-500' : 'disabled:bg-slate-100'} disabled:cursor-not-allowed`}
                  >
                      {date}
                  </button>
                  {isCalendarOpen && createPortal(CalendarPopup, document.body)}
              </div>
            <select 
              id="time" 
              value={time} 
              onChange={(e) => setTime(e.target.value)} 
              required 
              className={`w-1/2 px-3 py-2 border-0 border-l ${darkFieldBorder} rounded-r-md focus:ring-0 ${darkFieldBg} ${mainColorClass}`}
            >
              <option value="" disabled>--</option>
              {timeOptions.map(slot => <option key={slot} value={slot}>{slot}</option>)}
            </select>
          </div>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="notes" className={`block text-sm font-medium ${mainColorClassLight} mb-1`}>備考</label>
          <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`w-full px-3 py-2 border ${darkFieldBorder} rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition ${darkFieldBg} ${mainColorClass}`}></textarea>
        </div>
        <div className="md:col-span-2 flex justify-end gap-3">
          <button 
            type="button" 
            onClick={resetForm}
            className={`font-bold py-2 px-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 transition duration-300 ease-in-out ${darkClearBtn}`}
          >
            クリア
          </button>
          <button type="submit" className={`${mainBgClass} text-white font-bold py-2 px-6 rounded-lg ${mainHoverBgClass} focus:outline-none focus:ring-2 focus:ring-offset-2 ${mainRingClass} transition duration-300 ease-in-out`}>
            依頼を作成
          </button>
        </div>
      </form>
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

export default CallRequestForm;