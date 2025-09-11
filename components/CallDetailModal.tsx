import React, { useState, useEffect } from 'react';
import { CallRequest, Rank } from '../types';
import { XMarkIcon, ClipboardDocumentIcon, CheckIcon, ArrowRightIcon } from './icons';
import StatusBadge from './StatusBadge';

interface CallDetailModalProps {
  calls?: CallRequest[] | null;
  duplicateCalls?: CallRequest[];
  onClose: () => void;
  onJump?: (call: CallRequest) => void;
  isConfirmingDuplicate?: boolean;
  onConfirmDuplicate?: () => void;
  isPrecheckTheme?: boolean;
  showJumpButton?: boolean;
}

const fieldLabels: Record<string, string> = {
    customerId: '顧客ID',
    requester: '依頼者',
    assignee: '担当者',
    listType: 'リスト種別',
    rank: 'ランク',
    dateTime: '架電予定日時',
    notes: '備考',
    status: 'ステータス',
    absenceCount: '留守回数',
};

const formatHistoryValue = (field: string, value: any) => {
    if (value === null || value === undefined || value === '') {
        return <span className="text-slate-400 italic">空</span>;
    }
    if (field === 'dateTime') {
        try {
            const [date, time] = String(value).split('T');
            const specialTimes = ['至急', 'このあとOK', '時設なし', '入電待ち'];
            if (time && specialTimes.includes(time)) {
                return `${date} ${time}`;
            }
            return String(value).replace('T', ' ');
        } catch {
            return String(value);
        }
    }
    return String(value);
};


const CallDetailModal: React.FC<CallDetailModalProps> = ({ calls, duplicateCalls, onClose, onJump, isConfirmingDuplicate, onConfirmDuplicate, isPrecheckTheme = false, showJumpButton = false }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [detailedCall, setDetailedCall] = useState<CallRequest | null>(null);

  useEffect(() => {
    if (calls && calls.length === 1) {
        setDetailedCall(calls[0]);
    } else {
        setDetailedCall(null);
    }
  }, [calls]);


  const handleCopy = async (customerId: string) => {
    try {
      await navigator.clipboard.writeText(customerId);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy Customer ID: ', err);
      alert('コピーに失敗しました。');
    }
  };

  const formatDetailDateTime = (dateTime: string) => {
    const specialTimes = ['待機中', '至急', 'このあとOK', '時設なし', '入電待ち'];
    try {
        const parts = dateTime.split('T');
        const timePart = parts[1];
        if (parts.length === 2 && timePart && specialTimes.includes(timePart)) {
            return timePart;
        }
        return new Date(dateTime).toLocaleString('ja-JP');
    } catch (e) {
        return dateTime.replace('T', ' ');
    }
  };

  const mainColorClass = isPrecheckTheme ? 'text-[#118f82]' : 'text-[#0193be]';
  const mainColorClassLight = isPrecheckTheme ? 'text-[#118f82]/80' : 'text-[#0193be]/80';
  const mainBgClass = isPrecheckTheme ? 'bg-[#118f82]' : 'bg-[#0193be]';
  const mainHoverBgClass = isPrecheckTheme ? 'hover:bg-[#0e7268]' : 'hover:bg-[#017a9a]';


  if (!calls && !isConfirmingDuplicate) return null;
  
  const renderSingleCallDetails = (callToRender: CallRequest) => {
      const absenteeRanks: Rank[] = ['見込C留守', '見込B留守', '見込A留守', '見込S留守'];
      const showAbsenceCount = absenteeRanks.includes(callToRender.rank);

      return (
      <div className="bg-white p-5 rounded-lg border border-slate-200">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="sm:col-span-2">
              <strong className={`${mainColorClassLight} block mb-1`}>顧客ID:</strong>
              <div className="flex items-center gap-2">
                <span className={`${mainColorClass} font-semibold bg-slate-100 px-2 py-1 rounded`}>{callToRender.customerId}</span>
                <button onClick={() => handleCopy(callToRender.customerId)} className={`p-1.5 ${mainColorClassLight} rounded-full hover:bg-slate-200 hover:${mainColorClass} transition`} title={isCopied ? "コピーしました！" : "顧客IDをコピー"}>
                  {isCopied ? (
                    <CheckIcon className="w-5 h-5 text-green-600" />
                  ) : (
                    <ClipboardDocumentIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
            {!isConfirmingDuplicate && (
              <>
                <div><strong className={`${mainColorClassLight} block`}>依頼者:</strong> <span className={mainColorClass}>{callToRender.requester}</span></div>
                {callToRender.createdAt && (
                    <div><strong className={`${mainColorClassLight} block`}>作成日時:</strong> <span className={mainColorClass}>{new Date(callToRender.createdAt).toLocaleString('ja-JP')}</span></div>
                )}
              </>
            )}
            <div><strong className={`${mainColorClassLight} block`}>担当者:</strong> <span className={mainColorClass}>{callToRender.assignee}</span></div>
            <div><strong className={`${mainColorClassLight} block`}>架電予定日時:</strong> <span className={mainColorClass}>{formatDetailDateTime(callToRender.dateTime)}</span></div>
            <div><strong className={`${mainColorClassLight} block`}>リスト種別:</strong> <span className={mainColorClass}>{callToRender.listType}</span></div>
            <div><strong className={`${mainColorClassLight} block`}>ランク:</strong> <span className={mainColorClass}>{callToRender.rank}</span></div>
            {showAbsenceCount && callToRender.absenceCount != null && (
                <div><strong className={`${mainColorClassLight} block`}>留守回数:</strong> <span className={mainColorClass}>{callToRender.absenceCount}回</span></div>
            )}
            <div><strong className={`${mainColorClassLight} block`}>ステータス:</strong> <StatusBadge status={callToRender.status} /></div>
            {callToRender.notes && <div className="sm:col-span-2"><strong className={`${mainColorClassLight} block`}>備考:</strong> <p className={`${mainColorClass} whitespace-pre-wrap`}>{callToRender.notes}</p></div>}
        </div>
      </div>
      );
  };

  const getTitle = () => {
    if (isConfirmingDuplicate) return '重複の確認';
    if (calls && calls.length > 1 && !detailedCall) return '検索結果';
    return '依頼詳細';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 transition-opacity duration-300" onClick={onClose}>
      <div className="bg-slate-50 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all duration-300 scale-95 animate-fade-in-up" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200 flex justify-between items-center">
          <h2 className={`text-2xl font-bold ${mainColorClass}`}>{getTitle()}</h2>
          <button onClick={onClose} className={`${mainColorClassLight} hover:${mainColorClass} transition`}>
            <XMarkIcon className="w-7 h-7" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          {detailedCall ? (
            <>
              {renderSingleCallDetails(detailedCall)}
              {detailedCall.history && detailedCall.history.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-200">
                  <h3 className={`text-lg font-semibold ${mainColorClass} mb-3`}>編集履歴</h3>
                  <ul className="space-y-4 max-h-64 overflow-y-auto pr-2">
                    {detailedCall.history.map((entry, index) => (
                      <li key={index} className="text-sm p-3 bg-slate-100 rounded-md border border-slate-200">
                        <div className="flex justify-between items-baseline mb-2">
                          <strong className="text-slate-700">{entry.editor}</strong>
                          <time className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleString('ja-JP')}</time>
                        </div>
                        <ul className="space-y-1.5 pl-4 border-l-2 border-slate-300 ml-1">
                          {entry.changes.map((change, cIndex) => (
                            <li key={cIndex} className="text-xs">
                              <strong className="font-medium text-slate-600 block">{fieldLabels[change.field] || change.field} を変更</strong>
                              <div className="flex items-center gap-1.5 text-slate-500 mt-0.5">
                                  <span className="text-red-500 line-through">{formatHistoryValue(change.field, change.oldValue)}</span>
                                  <ArrowRightIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                  <span className="text-green-600 font-medium">{formatHistoryValue(change.field, change.newValue)}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : isConfirmingDuplicate ? (
            <>
              {duplicateCalls && duplicateCalls.length > 1 ? (
                <div className="bg-white p-5 rounded-lg border border-slate-200">
                    <div className="flex justify-between items-baseline mb-2">
                        <strong className={`${mainColorClassLight} block`}>既存の依頼一覧:</strong>
                        <span className="text-sm text-slate-500">{duplicateCalls.length}件の重複</span>
                    </div>
                    <div className="space-y-3 max-h-64 overflow-y-auto pr-2 border-l-4 border-slate-200 pl-4">
                        {duplicateCalls.map((dupCall) => (
                            <div key={dupCall.id} className="p-3 bg-slate-50 rounded-md text-sm border border-slate-200">
                                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                                    <strong className={`text-right ${mainColorClassLight}`}>顧客ID:</strong>
                                    <span className={`${mainColorClass} font-semibold`}>{dupCall.customerId}</span>

                                    <strong className={`text-right ${mainColorClassLight}`}>担当者:</strong>
                                    <span className={mainColorClass}>{dupCall.assignee}</span>
                                    
                                    {dupCall.notes && (
                                        <>
                                            <strong className={`text-right ${mainColorClassLight} self-start pt-1`}>備考:</strong>
                                            <p className={`${mainColorClass} whitespace-pre-wrap bg-white p-1.5 rounded text-xs border`}>{dupCall.notes}</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
              ) : (
                duplicateCalls && duplicateCalls[0] && renderSingleCallDetails(duplicateCalls[0])
              )}
            </>
          ) : calls && calls.length > 1 ? (
            <div className="bg-white p-5 rounded-lg border border-slate-200">
                <div className="flex justify-between items-baseline mb-3">
                    <strong className={`${mainColorClassLight} block`}>検索結果:</strong>
                    <span className="text-sm text-slate-500">{calls.length}件の案件</span>
                </div>
                <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {calls.map((callItem) => (
                        <li key={callItem.id}>
                            <button
                                onClick={() => setDetailedCall(callItem)}
                                className="w-full text-left p-3 bg-slate-50 rounded-md text-sm border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0193be]"
                            >
                                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                                    <strong className={`text-right ${mainColorClassLight}`}>顧客ID:</strong>
                                    <span className={`${mainColorClass} font-semibold`}>{callItem.customerId}</span>

                                    <strong className={`text-right ${mainColorClassLight}`}>担当者:</strong>
                                    <span className={mainColorClass}>{callItem.assignee}</span>

                                    <strong className={`text-right ${mainColorClassLight}`}>ランク:</strong>
                                    <span className={mainColorClass}>{callItem.rank}</span>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
          ) : null }
        </div>
        
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end items-center gap-3">
            {isConfirmingDuplicate ? (
                <div className="w-full">
                    <div className="p-3 mb-3 bg-yellow-100 border border-yellow-300 text-yellow-800 rounded-md text-sm">
                        <p><strong className="font-bold">警告:</strong> この顧客IDは既に登録されています。</p>
                        <p className="mt-1">重複して新しい依頼を作成しますか？</p>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="bg-white text-slate-700 border border-slate-300 font-bold py-2 px-5 rounded-lg hover:bg-slate-50 transition"
                        >
                            キャンセル
                        </button>
                        <button
                            onClick={onConfirmDuplicate}
                            className="bg-red-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-red-700 transition"
                        >
                            作成する
                        </button>
                    </div>
                </div>
            ) : (
                <div className="w-full flex justify-between items-center">
                    <div>
                        {calls && calls.length > 1 && detailedCall && (
                            <button
                                onClick={() => setDetailedCall(null)}
                                className="bg-white text-slate-700 border border-slate-300 font-bold py-2 px-5 rounded-lg hover:bg-slate-50 transition"
                            >
                                戻る
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {onJump && detailedCall && showJumpButton && (
                            <button
                                onClick={() => onJump(detailedCall)}
                                className="flex items-center justify-center gap-2 bg-slate-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-slate-700 transition"
                            >
                                <ArrowRightIcon className="w-5 h-5" />
                                ジャンプ
                            </button>
                        )}
                        <button onClick={onClose} className={`${mainBgClass} text-white font-bold py-2 px-5 rounded-lg ${mainHoverBgClass} transition`}>
                            閉じる
                        </button>
                    </div>
                </div>
            )}
        </div>
      </div>
       <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

export default CallDetailModal;