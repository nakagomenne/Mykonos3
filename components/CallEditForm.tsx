import React, { useState, useMemo } from 'react';
import { CallRequest, ListType, Rank } from '../types';
import { LIST_TYPE_OPTIONS, ALL_TIME_OPTIONS, PRECHECK_ALL_TIME_OPTIONS, SPECIAL_TIME_OPTIONS_TOP, PRECHECK_SPECIAL_TIME_OPTIONS_TOP, NON_PRECHECK_RANK_OPTIONS, PRECHECK_RANK_OPTIONS } from '../constants';
import AlertModal from './AlertModal';

interface CallEditFormProps {
  call: CallRequest;
  onSave: (updatedData: Partial<Omit<CallRequest, 'id'>>) => void;
  onCancel: () => void;
  members: string[];
  isPrecheckTheme?: boolean;
}

const CallEditForm: React.FC<CallEditFormProps> = ({ call, onSave, onCancel, members, isPrecheckTheme = false }) => {
  const [customerId, setCustomerId] = useState(call.customerId);
  const [assignee, setAssignee] = useState(call.assignee);
  const [requester, setRequester] = useState(call.requester);
  const [listType, setListType] = useState<ListType | ''>(call.listType);
  const [rank, setRank] = useState<Rank>(call.rank);
  const [date, setDate] = useState(call.dateTime.split('T')[0]);
  const [time, setTime] = useState(call.dateTime.split('T')[1]);
  const [notes, setNotes] = useState(call.notes);
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
    
    const specialTimesForToday = isPrecheckTheme ? PRECHECK_SPECIAL_TIME_OPTIONS_TOP : PRECHECK_SPECIAL_TIME_OPTIONS_TOP;
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
    });
  };
  
  const mainColorClassLight = isPrecheckTheme ? 'text-[#118f82]/80' : 'text-[#0193be]/80';
  const mainRingClass = isPrecheckTheme ? 'focus:ring-[#118f82]' : 'focus:ring-[#0193be]';
  const mainBorderClass = isPrecheckTheme ? 'focus:border-[#118f82]' : 'focus:border-[#0193be]';
  const mainBgClass = isPrecheckTheme ? 'bg-[#118f82]' : 'bg-[#0193be]';
  const mainHoverBgClass = isPrecheckTheme ? 'hover:bg-[#0e7268]' : 'hover:bg-[#017a9a]';
  const mainColorClass = isPrecheckTheme ? 'text-[#118f82]' : 'text-[#0193be]';

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`edit-customerId-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>顧客ID</label>
            <input type="text" id={`edit-customerId-${call.id}`} value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition`} />
          </div>
          <div>
            <label htmlFor={`edit-requester-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>依頼者</label>
            <select id={`edit-requester-${call.id}`} value={requester} onChange={(e) => setRequester(e.target.value)} required className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
              {members.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`edit-assignee-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>担当者</label>
            <select id={`edit-assignee-${call.id}`} value={assignee} onChange={(e) => setAssignee(e.target.value)} required className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
              {members.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`edit-listType-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>リスト種別</label>
            <select id={`edit-listType-${call.id}`} value={listType} onChange={(e) => setListType(e.target.value as ListType)} required className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
              {LIST_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor={`edit-rank-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>ランク</label>
            <select id={`edit-rank-${call.id}`} value={rank} onChange={(e) => setRank(e.target.value as Rank)} required className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm bg-white ${mainRingClass} ${mainBorderClass} transition ${mainColorClass}`}>
              {rankOptionsForEdit.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>予定日時</label>
            <div className={`flex items-center border border-slate-300 rounded-md shadow-sm focus-within:ring-1 ${isPrecheckTheme ? 'focus-within:ring-[#118f82] focus-within:border-[#118f82]' : 'focus-within:ring-[#0193be] focus-within:border-[#0193be]'} transition`}>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={`w-1/2 px-2 py-1.5 border-0 rounded-l-md focus:ring-0 ${mainColorClass}`} />
              <select value={time} onChange={(e) => setTime(e.target.value)} required className={`w-1/2 px-2 py-1.5 border-0 border-l border-slate-300 rounded-r-md bg-white focus:ring-0 transition ${mainColorClass}`}>
                {timeOptions.map(slot => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div>
          <label htmlFor={`edit-notes-${call.id}`} className={`block text-xs font-medium ${mainColorClassLight} mb-1`}>備考</label>
          <textarea id={`edit-notes-${call.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={`w-full px-2 py-1.5 border border-slate-300 rounded-md shadow-sm ${mainRingClass} ${mainBorderClass} transition`}></textarea>
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