
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Rank, CallRequest } from '../types';
import { NON_PRECHECK_RANK_OPTIONS, ALL_TIME_OPTIONS, SPECIAL_TIME_OPTIONS_TOP } from '../constants';
import { XMarkIcon } from './icons';
import AlertModal from './AlertModal';

interface BulkTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (taskData: Omit<CallRequest, 'id' | 'status' | 'createdAt' | 'assignee' | 'customerId' | 'requester' | 'prechecker' | 'imported' | 'history' | 'absenceCount'>) => void;
  selectedMemberCount: number;
}

const BulkTaskModal: React.FC<BulkTaskModalProps> = ({ isOpen, onClose, onSubmit, selectedMemberCount }) => {
  const [rank, setRank] = useState<Rank | ''>('共有');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('このあとOK');
  const [notes, setNotes] = useState('');
  
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertContent, setAlertContent] = useState({ title: '', message: '' });

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rank || !date || !time) {
      setAlertContent({ title: '入力エラー', message: '必須項目をすべて入力してください。' });
      setIsAlertOpen(true);
      return;
    }

    if (SPECIAL_TIME_OPTIONS_TOP.includes(time) && date !== today) {
      setAlertContent({ title: '日付エラー', message: `「${time}」が選択されている場合、日付は本日である必要があります。` });
      setIsAlertOpen(true);
      return;
    }
    
    onSubmit({
      listType: '',
      rank,
      dateTime: `${date}T${time}`,
      notes
    });
  };
  
  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[70]" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col transform transition-all duration-300 scale-95 animate-fade-in-up" 
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-[#0193be]">全体タスク作成</h2>
          <button onClick={onClose} className="text-[#0193be]/80 hover:text-[#0193be] transition">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-grow flex flex-col">
          <div className="p-6 overflow-y-auto space-y-4">
             <div className="p-3 bg-sky-50 border border-sky-200 rounded-md text-sm text-sky-800">
                <strong>{selectedMemberCount}人</strong> のメンバーに一括でタスクを作成します。顧客IDは空欄で作成されます。
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label htmlFor="bulk-rank" className="block text-sm font-medium text-[#0193be]/80 mb-1">ランク <span className="text-red-500">*</span></label>
                <select 
                  id="bulk-rank" 
                  value={rank} 
                  onChange={(e) => setRank(e.target.value as Rank)} 
                  required 
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition bg-white text-[#0193be]"
                >
                  <option value="" disabled>--</option>
                  {NON_PRECHECK_RANK_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="bulk-date" className="block text-sm font-medium text-[#0193be]/80 mb-1">予定日時 <span className="text-red-500">*</span></label>
                <div className="flex items-center border border-slate-300 rounded-md shadow-sm focus-within:ring-1 focus-within:ring-[#0193be] focus-within:border-[#0193be] transition">
                  <input 
                    type="date" 
                    id="bulk-date" 
                    value={date} 
                    onChange={(e) => setDate(e.target.value)} 
                    required
                    className="w-1/2 px-3 py-2 border-0 rounded-l-md focus:ring-0 text-[#0193be]" 
                  />
                  <select 
                    id="bulk-time" 
                    value={time} 
                    onChange={(e) => setTime(e.target.value)} 
                    required 
                    className="w-1/2 px-3 py-2 border-0 border-l border-slate-300 rounded-r-md focus:ring-0 bg-white text-[#0193be]"
                  >
                    {ALL_TIME_OPTIONS.map(slot => <option key={slot} value={slot}>{slot}</option>)}
                  </select>
                </div>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="bulk-notes" className="block text-sm font-medium text-[#0193be]/80 mb-1">備考</label>
                <textarea 
                  id="bulk-notes" 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)} 
                  rows={4} 
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition"
                ></textarea>
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end items-center gap-3 flex-shrink-0">
            <button type="button" onClick={onClose} className="bg-white text-slate-700 border border-slate-300 font-bold py-2 px-5 rounded-lg hover:bg-slate-50 transition">
                キャンセル
            </button>
            <button type="submit" className="bg-[#0193be] text-white font-bold py-2 px-5 rounded-lg hover:bg-[#017a9a] transition">
                作成
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
      </div>
    </div>,
    document.body
  );
};

export default BulkTaskModal;