import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { User } from '../types';
import { XMarkIcon, ClockIcon } from './icons';

interface WorkHoursModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSave: (workStart: string, workEnd: string, autoUnavailableOffset: number | null) => void;
}

/** 10:00〜22:00 を 15 分刻みで生成 */
const generateTimeOptions = (): string[] => {
  const options: string[] = [];
  for (let h = 10; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 22 && m > 0) break;
      options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

const formatTime = (hhmm: string): string => {
  const [h, m] = hhmm.split(':');
  return m === '00' ? `${parseInt(h)}時` : `${parseInt(h)}時${m}分`;
};

const AUTO_OFFSET_OPTIONS: { label: string; value: number | null }[] = [
  { label: '自動切替なし', value: null },
  { label: '退勤ちょうど', value: 0 },
  { label: '15分前', value: 15 },
  { label: '30分前', value: 30 },
];

const WorkHoursModal: React.FC<WorkHoursModalProps> = ({ isOpen, onClose, user, onSave }) => {
  const [workStart, setWorkStart] = useState(user.workStart ?? '11:00');
  const [workEnd, setWorkEnd]     = useState(user.workEnd   ?? '20:00');
  const [autoOffset, setAutoOffset] = useState<number | null>(user.autoUnavailableOffset ?? null);

  // ユーザーが変わったとき（管理者が別ユーザーを編集する場合）に同期
  useEffect(() => {
    setWorkStart(user.workStart ?? '11:00');
    setWorkEnd(user.workEnd     ?? '20:00');
    setAutoOffset(user.autoUnavailableOffset ?? null);
  }, [user.name, user.workStart, user.workEnd, user.autoUnavailableOffset]);

  if (!isOpen) return null;

  const handleSave = () => {
    // 退勤 ≤ 出勤 はバリデーションエラー
    if (workEnd <= workStart) {
      alert('退勤時間は出勤時間より後に設定してください。');
      return;
    }
    onSave(workStart, workEnd, autoOffset);
    onClose();
  };

  // 受付不可切替時刻のプレビュー表示
  const unavailableTimePreview = (() => {
    if (autoOffset === null) return null;
    const [h, m] = workEnd.split(':').map(Number);
    const total = h * 60 + m - autoOffset;
    const ph = Math.floor(total / 60);
    const pm = total % 60;
    if (ph < 0) return null;
    return `${String(ph).padStart(2, '0')}:${String(pm).padStart(2, '0')}`;
  })();

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-[#0193be]" />
            <h2 className="text-base font-bold text-slate-800">稼働時間設定</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 出勤・退勤 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">出勤時間</label>
              <select
                value={workStart}
                onChange={e => setWorkStart(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0193be]"
              >
                {TIME_OPTIONS.filter(t => t < workEnd).map(t => (
                  <option key={t} value={t}>{formatTime(t)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">退勤時間</label>
              <select
                value={workEnd}
                onChange={e => setWorkEnd(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0193be]"
              >
                {TIME_OPTIONS.filter(t => t > workStart).map(t => (
                  <option key={t} value={t}>{formatTime(t)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 受付不可設定 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">受付不可設定</label>
            <div className="space-y-2">
              {AUTO_OFFSET_OPTIONS.map(opt => (
                <label key={String(opt.value)} className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                    ${autoOffset === opt.value ? 'border-[#0193be] bg-[#0193be]' : 'border-slate-300 group-hover:border-[#0193be]'}`}
                    onClick={() => setAutoOffset(opt.value)}
                  >
                    {autoOffset === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-sm text-slate-700">{opt.label}</span>
                </label>
              ))}
            </div>
            {unavailableTimePreview && (
              <p className="mt-3 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                当日稼働日は <span className="font-bold text-[#0193be]">{formatTime(unavailableTimePreview)}</span> に自動で「当日受付不可」に切り替わります
              </p>
            )}
          </div>
        </div>

        {/* フッター */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded-lg bg-[#0193be] text-white hover:bg-[#0180a8] transition font-semibold"
          >
            保存
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default WorkHoursModal;
