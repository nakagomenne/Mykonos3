import React, { useState, useMemo } from 'react';
import { CallRequest, ListType, Rank } from '../types';
import { LIST_TYPE_OPTIONS, ALL_TIME_OPTIONS, PRECHECK_ALL_TIME_OPTIONS, SPECIAL_TIME_OPTIONS_TOP, PRECHECK_SPECIAL_TIME_OPTIONS_TOP, NON_PRECHECK_RANK_OPTIONS, PRECHECK_RANK_OPTIONS } from '../constants';
import AlertModal from './AlertModal';
import RankSelector from './RankSelector';

interface CallEditFormProps {
  call: CallRequest;
  onSave: (updatedData: Partial<Omit<CallRequest, 'id'>>) => void;
  onCancel: () => void;
  members: string[];
  isPrecheckTheme?: boolean;
  currentUserName?: string;
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

const CallEditForm: React.FC<CallEditFormProps> = ({ call, onSave, onCancel, members, isPrecheckTheme = false, currentUserName }) => {
  const [customerId, setCustomerId] = useState(call.customerId);
  const [assignee, setAssignee] = useState(call.assignee);
  const [requester, setRequester] = useState(call.requester);
  const [listType, setListType] = useState<ListType | ''>(call.listType);
  const [rank, setRank] = useState<Rank>(call.rank);
  const [date, setDate] = useState(call.dateTime.split('T')[0]);
  const [time, setTime] = useState(call.dateTime.split('T')[1]);
  const [notes, setNotes] = useState(call.notes);
  const [isStrict, setIsStrict] = useState(call.isStrict ?? false);
  const [isDetailedTime, setIsDetailedTime] = useState(call.isDetailedTime ?? false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertContent, setAlertContent] = useState({ title: '', message: '' });

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const timeOptions = isPrecheckTheme ? PRECHECK_ALL_TIME_OPTIONS : ALL_TIME_OPTIONS;

  const rankOptionsForEdit = useMemo(() => {
    const options = isPrecheckTheme ? PRECHECK_RANK_OPTIONS : NON_PRECHECK_RANK_OPTIONS;
    if (!options.includes(call.rank)) {
        return [call.rank, ...options];
    }
    return options;
  }, [isPrecheckTheme, call.rank]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !assignee || !listType || !date || !time) {
        setAlertContent({ title: '入力エラー', message: '必須項目をすべて入力してください。' });
        setIsAlertOpen(true);
        return;
    }
    
    const specialTimesForToday = isPrecheckTheme ? PRECHECK_SPECIAL_TIME_OPTIONS_TOP : SPECIAL_TIME_OPTIONS_TOP;
    if (specialTimesForToday.includes(time) && date !== today) {
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

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`edit-customerId-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>顧客ID</label>
            <input type="text" id={`edit-customerId-${call.id}`} value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition bg-white ${mainColorClass}`} />
          </div>
          <div>
            <label htmlFor={`edit-assignee-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>担当者</label>
            <select id={`edit-assignee-${call.id}`} value={assignee} onChange={(e) => setAssignee(e.target.value)} required className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
              {members.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>予定日時</label>
            <div className={`flex items-center border border-slate-300 rounded-md shadow-sm focus-within:ring-1 ${isPrecheckTheme ? 'focus-within:ring-[#118f82] focus-within:border-[#118f82]' : 'focus-within:ring-[#0193be] focus-within:border-[#0193be]'} transition`}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={`w-1/2 px-2 py-1.5 border-0 rounded-l-md focus:ring-0 bg-white ${mainColorClass}`} />
              {/* isDetailedTime ON: 1分単位 select / OFF: 通常 select */}
              {isDetailedTime && !isSpecialTime(time) ? (
                <select
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={`w-1/2 px-2 py-1.5 border-0 border-l border-slate-300 rounded-r-md bg-white focus:ring-0 transition ${mainColorClass}`}
                >
                  {Array.from({ length: (SLIDER_MAX - SLIDER_MIN) + 1 }, (_, i) => minutesToTime(SLIDER_MIN + i)).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <select value={time} onChange={(e) => setTime(e.target.value)} required className={`w-1/2 px-2 py-1.5 border-0 border-l border-slate-300 rounded-r-md bg-white focus:ring-0 transition ${mainColorClass}`}>
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
            />
          </div>
          <div>
            <label htmlFor={`edit-listType-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>リスト種別</label>
            <select id={`edit-listType-${call.id}`} value={listType} onChange={(e) => setListType(e.target.value as ListType)} required className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
              {LIST_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`edit-requester-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>依頼者</label>
            <select id={`edit-requester-${call.id}`} value={requester} onChange={(e) => setRequester(e.target.value)} required className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
              {members
                .filter(opt => {
                  // ログイン中の本人 または 現在設定されている依頼者のみ選択可
                  return opt === currentUserName || opt === call.requester;
                })
                .map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`edit-notes-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>備考</label>
          <textarea id={`edit-notes-${call.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition bg-white ${mainColorClass}`}></textarea>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="bg-white text-slate-700 border border-slate-300 font-bold py-2 px-4 rounded-lg hover:bg-slate-50 transition">キャンセル</button>
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
