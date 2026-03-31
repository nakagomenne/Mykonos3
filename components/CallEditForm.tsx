import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CallRequest, ListType, Rank, User } from '../types';
import { LIST_TYPE_OPTIONS, ALL_TIME_OPTIONS, PRECHECK_ALL_TIME_OPTIONS, SPECIAL_TIME_OPTIONS_TOP, PRECHECK_SPECIAL_TIME_OPTIONS_TOP, NON_PRECHECK_RANK_OPTIONS, PRECHECK_RANK_OPTIONS, PRECHECKER_ASSIGNEE_NAME } from '../constants';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import AlertModal from './AlertModal';
import RankSelector from './RankSelector';
import EmojiPicker from './EmojiPicker';

interface CallEditFormProps {
  call: CallRequest;
  onSave: (updatedData: Partial<Omit<CallRequest, 'id'>>) => void;
  onCancel: () => void;
  members: string[];
  users?: User[];
  isPrecheckTheme?: boolean;
  currentUserName?: string;
  isDarkMode?: boolean;
}

const SLIDER_MIN = 11 * 60; // 11:00
const SLIDER_MAX = 21 * 60; // 21:00

const minutesToTime = (mins: number): string => {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
};

const roundTo15 = (t: string): string => {
  const m = t.match(/^(\d{2}):(\d{2})$/);
  if (!m) return t;
  const totalMins = parseInt(m[1]) * 60 + parseInt(m[2]);
  const rounded = Math.round(totalMins / 15) * 15;
  const clamped = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, rounded));
  return minutesToTime(clamped);
};

const isSpecialTime = (t: string) => !/^\d{2}:\d{2}$/.test(t);

const CallEditForm: React.FC<CallEditFormProps> = ({ call, onSave, onCancel, members, users = [], isPrecheckTheme = false, currentUserName, isDarkMode = false }) => {
  const [customerId, setCustomerId] = useState(call.customerId);
  const [assignee, setAssignee] = useState(call.assignee);
  const [requester, setRequester] = useState(call.requester);
  const [listType, setListType] = useState<ListType | ''>(call.listType);
  const [rank, setRank] = useState<Rank>(call.rank);
  const [date, setDate] = useState(call.dateTime.split('T')[0]);
  const [time, setTime] = useState(call.dateTime.split('T')[1]);
  const [notes, setNotes] = useState(call.notes);
  const [emoji, setEmoji] = useState(call.emoji ?? '');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [emojiAnchorRect, setEmojiAnchorRect] = useState<DOMRect | null>(null);
  const [isStrict, setIsStrict] = useState(call.isStrict ?? false);
  const [isDetailedTime, setIsDetailedTime] = useState(call.isDetailedTime ?? false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertContent, setAlertContent] = useState({ title: '', message: '' });

  // AP戻し / 回線受注 チェック状態
  const [isApReturn, setIsApReturn] = useState(false);
  const [isLineOrder, setIsLineOrder] = useState(false);

  // call prop が外部（インライン編集など）で更新されたとき、フォームの state を同期する
  useEffect(() => {
    setCustomerId(call.customerId);
    setAssignee(call.assignee);
    setRequester(call.requester);
    setListType(call.listType);
    setRank(call.rank);
    setDate(call.dateTime.split('T')[0]);
    setTime(call.dateTime.split('T')[1]);
    setNotes(call.notes);
    setEmoji(call.emoji ?? '');
    setIsStrict(call.isStrict ?? false);
    setIsDetailedTime(call.isDetailedTime ?? false);
    setIsApReturn(false);
    setIsLineOrder(false);
  }, [call.id, call.customerId, call.assignee, call.requester, call.listType, call.rank, call.dateTime, call.notes, call.emoji, call.isStrict, call.isDetailedTime]);

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // カレンダーポップアップ
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarDisplayDate, setCalendarDisplayDate] = useState(() => new Date());
  const dateInputRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [calendarPosition, setCalendarPosition] = useState<{ top: number; left: number } | null>(null);

  // 担当者の非稼働日セット
  const assigneeNonWorkingDays = useMemo(() => {
    const user = users.find(u => u.name === assignee);
    return new Set(user?.nonWorkingDays || []);
  }, [assignee, users]);

  // カレンダーグリッド生成
  const calendarGrid = useMemo(() => {
    const safeDate = (calendarDisplayDate instanceof Date && !isNaN(calendarDisplayDate.getTime()))
      ? calendarDisplayDate : new Date();
    const year = safeDate.getFullYear();
    const month = safeDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid: (Date | null)[][] = [];
    let day = 1;
    for (let i = 0; i < 6; i++) {
      const week: (Date | null)[] = [];
      for (let j = 0; j < 7; j++) {
        if (i === 0 && j < firstDayOfMonth) week.push(null);
        else if (day > daysInMonth) week.push(null);
        else { week.push(new Date(year, month, day)); day++; }
      }
      grid.push(week);
      if (day > daysInMonth) break;
    }
    return grid;
  }, [calendarDisplayDate]);

  const safeCalendarDisplayDate = (calendarDisplayDate instanceof Date && !isNaN(calendarDisplayDate.getTime()))
    ? calendarDisplayDate : new Date();

  // カレンダー外クリックで閉じる
  useEffect(() => {
    if (!isCalendarOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        calendarRef.current && !calendarRef.current.contains(e.target as Node) &&
        dateInputRef.current && !dateInputRef.current.contains(e.target as Node)
      ) setIsCalendarOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCalendarOpen]);

  // date が変わったらカレンダー表示月を同期
  useEffect(() => {
    if (date) {
      const d = new Date(date + 'T00:00:00');
      if (!isNaN(d.getTime())) setCalendarDisplayDate(d);
    }
  }, [date]);

  // AP戻し チェック ON/OFF
  const handleApReturnChange = (checked: boolean) => {
    setIsApReturn(checked);
    if (checked) {
      // ランク → 通常選択肢「立ち上げ」
      setRank('立ち上げ');
      // 担当者 → 元の依頼者（call.requester）
      setAssignee(call.requester);
      // 依頼者 → チェックを入れたメンバー（currentUserName）
      if (currentUserName) setRequester(currentUserName);
      // 日時 → 今日の「このあとOK」
      setDate(today);
      setTime('このあとOK');
      // 備考 → 先頭に2行改行を追加
      setNotes(prev => '\n\n' + prev);
    } else {
      // 元の値に戻す
      setRank(call.rank);
      setAssignee(call.assignee);
      setRequester(call.requester);
      setDate(call.dateTime.split('T')[0]);
      setTime(call.dateTime.split('T')[1]);
      setNotes(call.notes);
    }
  };

  // 回線受注 チェック ON/OFF
  const handleLineOrderChange = (checked: boolean) => {
    setIsLineOrder(checked);
    if (checked) {
      // ランク → 前確選択肢「SB光前確」
      setRank('SB光前確');
      // 担当者 → 回線前確
      setAssignee(PRECHECKER_ASSIGNEE_NAME);
      // 依頼者 → チェックを入れたメンバー（currentUserName）
      if (currentUserName) setRequester(currentUserName);
      // 日時 → 今日の「このあとOK」
      setDate(today);
      setTime('このあとOK');
      // 備考 → 先頭に2行改行を追加
      setNotes(prev => '\n\n' + prev);
    } else {
      // 元の値に戻す
      setRank(call.rank);
      setAssignee(call.assignee);
      setRequester(call.requester);
      setDate(call.dateTime.split('T')[0]);
      setTime(call.dateTime.split('T')[1]);
      setNotes(call.notes);
    }
  };

  // AP戻し時は通常ランク選択肢、回線受注時は前確ランク選択肢、それ以外は元のテーマに従う
  const effectiveIsPrecheckForRank = isLineOrder ? true : isApReturn ? false : isPrecheckTheme;

  const timeOptions = isPrecheckTheme ? PRECHECK_ALL_TIME_OPTIONS : ALL_TIME_OPTIONS;

  const rankOptionsForEdit = useMemo(() => {
    const options = effectiveIsPrecheckForRank ? PRECHECK_RANK_OPTIONS : NON_PRECHECK_RANK_OPTIONS;
    if (!options.includes(rank)) {
      return [rank, ...options];
    }
    return options;
  }, [effectiveIsPrecheckForRank, rank]);

  // AP戻し・回線受注チェック時は担当者選択肢を拡張（回線前確 or 元の依頼者が含まれるよう）
  const assigneeOptions = useMemo(() => {
    const base = [...members];
    if (isApReturn && call.requester && !base.includes(call.requester)) {
      base.push(call.requester);
    }
    if (isLineOrder && !base.includes(PRECHECKER_ASSIGNEE_NAME)) {
      base.push(PRECHECKER_ASSIGNEE_NAME);
    }
    return base;
  }, [members, isApReturn, isLineOrder, call.requester]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !assignee || !listType || !date || !time) {
        setAlertContent({ title: '入力エラー', message: '必須項目をすべて入力してください。' });
        setIsAlertOpen(true);
        return;
    }
    
    const specialTimesForToday = isPrecheckTheme ? PRECHECK_SPECIAL_TIME_OPTIONS_TOP : SPECIAL_TIME_OPTIONS_TOP;
    if (specialTimesForToday.includes(time) && time !== '待機中' && date !== today) {
        setAlertContent({ title: '日付エラー', message: `「${time}」が選択されている場合、日付は本日である必要があります。` });
        setIsAlertOpen(true);
        return;
    }

    onSave({
      customerId,
      assignee,
      requester,
      listType,
      rank,
      dateTime: `${date}T${time}`,
      notes,
      emoji,
      isStrict,
      isDetailedTime,
    });
  };
  
  const mainColorClassLight = isPrecheckTheme ? 'text-[#118f82]/80' : 'text-[#0193be]/80';
  const mainRingClass = isPrecheckTheme ? 'focus:ring-[#118f82]' : 'focus:ring-[#0193be]';
  const mainBorderClass = isPrecheckTheme ? 'focus:border-[#118f82]' : 'focus:border-[#0193be]';
  const mainBgClass = isPrecheckTheme ? 'bg-[#118f82]' : 'bg-[#0193be]';
  const mainHoverBgClass = isPrecheckTheme ? 'hover:bg-[#0e7268]' : 'hover:bg-[#017a9a]';
  const mainColorClass = isPrecheckTheme ? 'text-[#118f82]' : 'text-[#0193be]';
  const checkboxColor = isPrecheckTheme ? 'accent-[#118f82]' : 'accent-[#0193be]';

  // カレンダーポップアップ JSX
  const CalendarPopup = isCalendarOpen && calendarPosition ? createPortal(
    <div
      ref={calendarRef}
      className={`fixed z-[9999] rounded-lg shadow-xl border p-3 w-72 ${isDarkMode ? 'bg-[#0f1623] border-slate-600' : 'bg-white border-slate-200'}`}
      style={{ top: calendarPosition.top, left: calendarPosition.left }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setCalendarDisplayDate(d => { const s = (d instanceof Date && !isNaN(d.getTime())) ? d : new Date(); return new Date(s.getFullYear(), s.getMonth() - 1, 1); })} className={`p-1 rounded-full transition ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
          <ChevronLeftIcon className={`w-5 h-5 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`} />
        </button>
        <div className={`font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
          {safeCalendarDisplayDate.getFullYear()}年 {safeCalendarDisplayDate.getMonth() + 1}月
        </div>
        <button type="button" onClick={() => setCalendarDisplayDate(d => { const s = (d instanceof Date && !isNaN(d.getTime())) ? d : new Date(); return new Date(s.getFullYear(), s.getMonth() + 1, 1); })} className={`p-1 rounded-full transition ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
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
          const localToday = new Date(); localToday.setHours(0,0,0,0);
          const dayDateObj = new Date(dayDate); dayDateObj.setHours(0,0,0,0);
          const isTodayDate = dayDateObj.getTime() === localToday.getTime();
          const isPast = dayDateObj < localToday;
          const isDisabled = isNonWorking || isPast;
          let cls = isDarkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-slate-700 hover:bg-sky-100';
          if (isNonWorking || isPast) {
            cls = isDarkMode ? 'bg-slate-800 text-slate-600 cursor-not-allowed' : 'bg-slate-200 text-slate-400 cursor-not-allowed';
          } else if (isSelected) {
            cls = `${mainBgClass} text-white font-bold ${mainHoverBgClass}`;
          } else if (isTodayDate) {
            cls = `${mainBgClass} text-white font-bold ${mainHoverBgClass}`;
          }
          return (
            <div key={dateStr} className="py-1 flex justify-center items-center">
              <button
                type="button"
                onClick={() => { setDate(dateStr); setIsCalendarOpen(false); }}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors duration-200 text-sm focus:outline-none focus:ring-2 focus:ring-offset-1 ${mainRingClass} ${cls}`}
                disabled={isDisabled}
                title={isNonWorking ? '非稼働日' : undefined}
              >
                {dayDate.getDate()}
              </button>
            </div>
          );
        })}
      </div>
      {assigneeNonWorkingDays.size > 0 && (
        <div className={`mt-2 pt-2 border-t ${isDarkMode ? 'border-slate-600' : 'border-slate-200'} flex items-center gap-1.5 text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          <span className="inline-block w-3 h-3 rounded-sm bg-slate-200 border border-slate-400 flex-shrink-0" />
          非稼働日
        </div>
      )}
    </div>,
    document.body
  ) : null;

  // ダークモード対応フィールドクラス
  const fieldBg      = isDarkMode ? 'bg-[#0f1623]'    : 'bg-white';
  const fieldBorder  = isDarkMode ? 'border-slate-600' : 'border-slate-300';
  const fieldDivider = isDarkMode ? 'border-slate-600' : 'border-slate-300';

  const inputClass   = `w-full px-2 py-1.5 border ${fieldBorder} rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition ${fieldBg} ${mainColorClass}`;
  const selectClass  = `w-full px-2 py-1.5 border ${fieldBorder} rounded-md shadow-sm ${fieldBg} ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`;
  const timeSelectClass = `w-1/2 px-2 py-1.5 border-0 border-l ${fieldDivider} rounded-r-md ${fieldBg} focus:ring-0 transition ${mainColorClass}`;
  const cancelBtnClass = isDarkMode
    ? 'bg-[#0f1623] text-slate-300 border border-slate-600 font-bold py-2 px-4 rounded-lg hover:bg-slate-700 transition'
    : 'bg-white text-slate-700 border border-slate-300 font-bold py-2 px-4 rounded-lg hover:bg-slate-50 transition';

  // AP戻し・回線受注 チェックボックスのスタイル
  const specialCheckBg = isDarkMode ? 'bg-[#1a2236] border-slate-600' : 'bg-slate-50 border-slate-200';

  return (
    <>
      {CalendarPopup}
      <form onSubmit={handleSubmit} className="space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`edit-customerId-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>顧客ID</label>
            <input type="text" id={`edit-customerId-${call.id}`} value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label htmlFor={`edit-assignee-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>担当者</label>
            <select id={`edit-assignee-${call.id}`} value={assignee} onChange={(e) => { setAssignee(e.target.value); if (currentUserName) setRequester(currentUserName); }} required className={selectClass}
              disabled={isApReturn || isLineOrder}
            >
              {assigneeOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>予定日時</label>
            <div className={`flex items-center border ${fieldBorder} rounded-md shadow-sm focus-within:ring-1 ${isPrecheckTheme ? 'focus-within:ring-[#118f82] focus-within:border-[#118f82]' : 'focus-within:ring-[#0193be] focus-within:border-[#0193be]'} transition`}>
              <div ref={dateInputRef} className="relative w-1/2">
                <button
                  type="button"
                  onClick={() => {
                    const rect = dateInputRef.current?.getBoundingClientRect();
                    if (rect) {
                      let top = rect.bottom + 4;
                      let left = rect.left;
                      if (top + 320 > window.innerHeight - 8) top = rect.top - 324;
                      if (left + 288 > window.innerWidth - 8) left = window.innerWidth - 296;
                      setCalendarPosition({ top, left });
                    }
                    setIsCalendarOpen(prev => !prev);
                  }}
                  className={`w-full px-2 py-1.5 rounded-l-md text-left ${fieldBg} ${mainColorClass} focus:outline-none`}
                >
                  {date || '日付を選択'}
                </button>
              </div>
              {/* isDetailedTime ON: 1分単位 select / OFF: 通常 select */}
              {isDetailedTime && !isSpecialTime(time) ? (
                <select
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={timeSelectClass}
                >
                  {Array.from({ length: (SLIDER_MAX - SLIDER_MIN) + 1 }, (_, i) => minutesToTime(SLIDER_MIN + i)).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <select value={time} onChange={(e) => setTime(e.target.value)} required className={timeSelectClass}>
                  {timeOptions.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                </select>
              )}
            </div>
            {/* 厳守 / 詳細な時設 チェックボックス */}
            <div className="mt-2 flex items-center gap-5">
              <label className={`flex items-center gap-1.5 text-sm font-medium cursor-pointer select-none ${mainColorClassLight}`}>
                <input
                  type="checkbox"
                  checked={isStrict}
                  onChange={e => setIsStrict(e.target.checked)}
                  className={`w-4 h-4 ${checkboxColor} cursor-pointer`}
                />
                <span>厳守</span>
              </label>
              <label className={`flex items-center gap-1.5 text-sm font-medium cursor-pointer select-none ${mainColorClassLight}`}>
                <input
                  type="checkbox"
                  checked={isDetailedTime}
                  onChange={e => {
                    const next = e.target.checked;
                    setIsDetailedTime(next);
                    if (!next) {
                      if (!isSpecialTime(time)) setTime(roundTo15(time));
                    } else {
                      if (isSpecialTime(time)) setTime('11:00');
                    }
                  }}
                  className="w-4 h-4 cursor-pointer"
                />
                <span>詳細な時設</span>
              </label>
            </div>
          </div>
          <div className="md:col-span-2">
            <RankSelector
              value={rank}
              options={rankOptionsForEdit}
              onChange={(r) => setRank(r)}
              required
              label="ランク"
              mainColorClassLight={mainColorClassLight}
              isDarkMode={isDarkMode}
            />
          </div>
          <div>
            <label htmlFor={`edit-listType-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>リスト種別</label>
            <select id={`edit-listType-${call.id}`} value={listType} onChange={(e) => setListType(e.target.value as ListType)} required className={selectClass}>
              {LIST_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`edit-requester-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>依頼者</label>
            <select id={`edit-requester-${call.id}`} value={requester} onChange={(e) => setRequester(e.target.value)} required className={selectClass}
              disabled={isApReturn || isLineOrder}
            >
              {members
                .filter(opt => {
                  if (isApReturn || isLineOrder) return true; // チェック時は全員表示
                  return opt === currentUserName || opt === call.requester;
                })
                .map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>

        {/* ── AP戻し / 回線受注 ── */}
        {isPrecheckTheme && (
          <div className={`border rounded-lg px-3 py-2.5 ${specialCheckBg}`}>
            <label className={`flex items-center gap-2 cursor-pointer select-none`}>
              <input
                type="checkbox"
                checked={isApReturn}
                onChange={e => handleApReturnChange(e.target.checked)}
                className="w-4 h-4 accent-[#0193be] cursor-pointer"
              />
              <span className={`text-sm font-bold ${isDarkMode ? 'text-[#0193be]' : 'text-[#0193be]'}`}>AP戻し</span>
            </label>
          </div>
        )}

        {!isPrecheckTheme && listType === '回線' && (
          <div className={`border rounded-lg px-3 py-2.5 ${specialCheckBg}`}>
            <label className={`flex items-center gap-2 cursor-pointer select-none`}>
              <input
                type="checkbox"
                checked={isLineOrder}
                onChange={e => handleLineOrderChange(e.target.checked)}
                className="w-4 h-4 accent-[#118f82] cursor-pointer"
              />
              <span className={`text-sm font-bold text-[#118f82]`}>回線受注</span>
            </label>
          </div>
        )}

        <div>
          {/* 絵文字ピッカー */}
          <div className="mb-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                setEmojiAnchorRect(rect);
                setIsEmojiPickerOpen(prev => !prev);
              }}
              className={`text-xs px-2 py-0.5 rounded border font-medium transition flex items-center gap-1 ${
                isDarkMode
                  ? 'border-slate-500 bg-slate-700 hover:bg-slate-600 text-white'
                  : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-600'
              }`}
            >
              <span>★</span>
              {emoji ? <span className="text-base leading-none">{emoji}</span> : <span className="text-slate-400 text-xs">未選択</span>}
            </button>
            {emoji && (
              <button
                type="button"
                onClick={() => setEmoji('')}
                className="text-xs text-slate-400 hover:text-slate-600 transition"
              >
                クリア
              </button>
            )}
          </div>
          {isEmojiPickerOpen && emojiAnchorRect && (
            <EmojiPicker
              value={emoji}
              onChange={(em) => setEmoji(em)}
              onClose={() => setIsEmojiPickerOpen(false)}
              anchorRect={emojiAnchorRect}
              isDarkMode={isDarkMode}
            />
          )}
          <label htmlFor={`edit-notes-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>備考</label>
          <textarea id={`edit-notes-${call.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={`w-full px-2 py-1.5 border ${fieldBorder} rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition ${fieldBg} ${mainColorClass}`}></textarea>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className={cancelBtnClass}>キャンセル</button>
          <button type="submit" className={`${mainBgClass} text-white font-bold py-2 px-4 rounded-lg ${mainHoverBgClass} transition`}>保存</button>
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

export default CallEditForm;
