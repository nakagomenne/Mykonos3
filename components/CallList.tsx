import React, { useState } from 'react';
import { CallRequest, User } from '../types';
import CallListItem from './CallListItem';
import { CalendarIcon, CheckIcon } from './icons';
import { PRECHECKER_ASSIGNEE_NAME } from '../constants';

interface CallListProps {
  calls: CallRequest[];
  selectedMember: string;
  onUpdateCall: (id: string, updatedData: Partial<Omit<CallRequest, 'id'>>) => void;
  onSelectCall: (call: CallRequest) => void;
  highlightedCallId: string | null;
  members: string[];
  users: User[];
  isPrecheckTheme?: boolean;
  currentUser: User;
  duplicateCustomerIds: Set<string>;
}

const CallList: React.FC<CallListProps> = ({ calls, selectedMember, onUpdateCall, onSelectCall, highlightedCallId, members, users, isPrecheckTheme = false, currentUser, duplicateCustomerIds }) => {
  const [hideCompleted, setHideCompleted] = useState(true);

  if (calls.length === 0) {
    const mainColorClass = isPrecheckTheme ? 'text-[#118f82]' : 'text-[#0193be]';
    const mainColorClass60 = isPrecheckTheme ? 'text-[#118f82]/60' : 'text-[#0193be]/60';
    const mainColorClass80 = isPrecheckTheme ? 'text-[#118f82]/80' : 'text-[#0193be]/80';

    const isPrechecker = selectedMember === PRECHECKER_ASSIGNEE_NAME;

    return (
      <div className="text-center py-10 px-6 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
        <div className={`mx-auto w-12 h-12 ${mainColorClass60}`}>
            <CalendarIcon />
        </div>
        <h3 className={`mt-2 text-lg font-medium ${mainColorClass}`}>
          {isPrechecker
            ? '回線前確依頼はありません'
            : selectedMember === '全体'
            ? '依頼はまだありません'
            : `${selectedMember}さんの依頼はありません`}
        </h3>
        <p className={`mt-1 text-sm ${mainColorClass80}`}>
           {isPrechecker
            ? '新しい依頼を作成してください。'
            : selectedMember === '全体'
            ? '上のフォームから新しい架電依頼を作成してください。'
            : '別のメンバーを選択するか、新しい依頼を作成してください。'}
        </p>
      </div>
    )
  }

  const isAllMembersView = selectedMember === '全体';
  const showRequesterColumn = !isAllMembersView && calls.some(call => call.requester !== call.assignee);

  const displayedCalls = hideCompleted ? calls.filter(call => call.status !== '完了') : calls;
  const hasCompletedCalls = calls.some(call => call.status === '完了');
  const allCallsHidden = hideCompleted && displayedCalls.length === 0 && calls.length > 0;

  return (
    <div className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-2 py-1.5 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <div className="w-6 flex-shrink-0 flex justify-center">
              {hasCompletedCalls && (
                  <button
                      onClick={() => setHideCompleted(prev => !prev)}
                      className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        isPrecheckTheme ? 'focus:ring-[#118f82]' : 'focus:ring-[#0193be]'
                      } ${
                        hideCompleted
                          ? `${isPrecheckTheme ? 'bg-[#118f82]' : 'bg-[#0193be]'} border-transparent`
                          : 'border-slate-400 bg-white hover:border-slate-500'
                      }`}
                      title={hideCompleted ? '完了した案件を表示' : '完了した案件を非表示'}
                      aria-pressed={hideCompleted}
                  >
                    {hideCompleted && (
                      <CheckIcon className="h-3.5 w-3.5 text-white" />
                    )}
                  </button>
              )}
            </div>
            {isAllMembersView && <div className="w-20 flex-shrink-0 text-center">担当</div>}
            <div className="w-28 flex-shrink-0 text-center">顧客ID</div>
            <div className="w-24 flex-shrink-0 whitespace-nowrap text-center">日時</div>
            {!isPrecheckTheme && <div className="w-12 flex-shrink-0 text-center">種別</div>}
            <div className="w-24 flex-shrink-0 text-center">ランク</div>
            <div className="w-16 flex-shrink-0 text-center">留守</div>
            {isPrecheckTheme && <div className="w-14 flex-shrink-0 text-center">インポート</div>}
            {!isPrecheckTheme && <div className="flex-1">備考</div>}
            {isPrecheckTheme && <div className="w-20 flex-shrink-0 text-center">対応者</div>}
            {showRequesterColumn && <div className="w-20 flex-shrink-0 text-center">依頼者</div>}
            <div className="w-8 flex-shrink-0" aria-hidden="true" />
        </div>
        {/* List */}
        <ul className="space-y-2 p-2 bg-slate-100">
            {displayedCalls.map(call => (
                <CallListItem
                    key={call.id}
                    call={call}
                    onUpdateCall={onUpdateCall}
                    onSelectCall={onSelectCall}
                    selectedMember={selectedMember}
                    isHighlighted={highlightedCallId === call.id}
                    showRequesterColumn={showRequesterColumn}
                    members={members}
                    users={users}
                    isPrecheckTheme={isPrecheckTheme}
                    currentUser={currentUser}
                    isDuplicate={duplicateCustomerIds.has(call.customerId.trim().toLowerCase())}
                />
            ))}
        </ul>
        {allCallsHidden && (
            <div className="text-center py-8 px-6 bg-slate-100">
                <p className="text-sm text-slate-500">完了した依頼はすべて非表示になっています。</p>
            </div>
        )}
    </div>
  );
};

export default CallList;