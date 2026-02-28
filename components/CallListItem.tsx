import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CallRequest, Rank, User } from '../types';
import { CheckIcon, ClipboardDocumentIcon, PencilIcon, PhoneMissedIcon } from './icons';
import InlineEditPopup from './InlineEditPopup';
import CallEditForm from './CallEditForm';
import ConfirmationModal from './ConfirmationModal';
import { RANK_STYLES, NON_PRECHECK_RANK_OPTIONS, PRECHECK_RANK_OPTIONS } from '../constants';

interface CallListItemProps {
  call: CallRequest;
  onUpdateCall: (id: string, updatedData: Partial<Omit<CallRequest, 'id'>>) => void;
  onSelectCall: (call: CallRequest) => void;
  selectedMember: string;
  isHighlighted: boolean;
  showRequesterColumn: boolean;
  members: string[];
  users: User[];
  isPrecheckTheme?: boolean;
  currentUser: User;
  isDuplicate: boolean;
}

type EditableField = 'dateTime' | 'listType' | 'notes' | 'assignee' | 'requester';
interface EditingState {
  field: EditableField;
  targetRect: DOMRect;
}

const CallListItem: React.FC<CallListItemProps> = ({ call, onUpdateCall, onSelectCall, selectedMember, isHighlighted, showRequesterColumn, members, users, isPrecheckTheme = false, currentUser, isDuplicate }) => {
  const [isCopied, setIsCopied] = useState(false);
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmationModalOpen, setConfirmationModalOpen] = useState(false);
  const liRef = useRef<HTMLLIElement>(null);
  const [isRankDropdownOpen, setIsRankDropdownOpen] = useState(false);
  const rankButtonRef = useRef<HTMLButtonElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{top: number; left: number; width: number} | null>(null);
  const [isAbsenceDropdownOpen, setIsAbsenceDropdownOpen] = useState(false);
  const absenceButtonRef = useRef<HTMLButtonElement>(null);
  const absenceDropdownRef = useRef<HTMLDivElement>(null);
  const [absenceDropdownPosition, setAbsenceDropdownPosition] = useState<{top: number; left: number} | null>(null);


  useEffect(() => {
    if (isHighlighted && liRef.current) {
        liRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isRankDropdownOpen &&
        dropdownMenuRef.current && !dropdownMenuRef.current.contains(event.target as Node) &&
        rankButtonRef.current && !rankButtonRef.current.contains(event.target as Node)
      ) {
        setIsRankDropdownOpen(false);
      }
      if (
        isAbsenceDropdownOpen &&
        absenceDropdownRef.current && !absenceDropdownRef.current.contains(event.target as Node) &&
        absenceButtonRef.current && !absenceButtonRef.current.contains(event.target as Node)
      ) {
        setIsAbsenceDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRankDropdownOpen, isAbsenceDropdownOpen]);

  const { liStyle, dateTimeStyle, absenceCounterClass } = useMemo((): { liStyle: React.CSSProperties; dateTimeStyle: React.CSSProperties; absenceCounterClass: string; } => {
    const defaultMainTextClass = isPrecheckTheme ? 'text-[#118f82]' : 'text-[#0193be]';
    if (call.status === '完了') {
      return { liStyle: {}, dateTimeStyle: {}, absenceCounterClass: defaultMainTextClass };
    }

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [datePart, timePart] = call.dateTime.split('T');
    
    let finalLiStyle: React.CSSProperties = {};
    let finalDateTimeStyle: React.CSSProperties = {};
    let finalAbsenceCounterClass = defaultMainTextClass;

    if (datePart) {
      const callDay = new Date(`${datePart}T00:00:00`);

      // Rule 1: Previous day or earlier (Highest priority)
      if (callDay < today) {
          finalLiStyle = { backgroundColor: '#ff0000', color: 'white' };
          finalDateTimeStyle = { color: 'white' };
          finalAbsenceCounterClass = 'text-white';
      }
      // Rule for '待機中'
      else if (timePart === '待機中') {
          finalLiStyle = { backgroundColor: '#7ed1aa', color: 'white' };
          finalDateTimeStyle = { color: 'white' };
          finalAbsenceCounterClass = 'text-white';
      }
      // All subsequent rules are for today
      else if (callDay.getTime() === today.getTime()) {
          const isUrgent = ['至急', 'このあとOK'].includes(timePart);
          
          const timeRegex = /^\d{2}:\d{2}$/;
          let isOverdue = false;
          let isWithinAnHour = false;
          
          if (timePart && timeRegex.test(timePart)) {
              const callDateTime = new Date(`${datePart}T${timePart}`);
              
              if (callDateTime < now) {
                  isOverdue = true;
              }

              const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
              if (callDateTime > now && callDateTime <= oneHourFromNow) {
                  isWithinAnHour = true;
              }
          }

          // Rule 2: Urgent / Overdue Today
          if (isUrgent || isOverdue) {
              finalLiStyle = { backgroundColor: '#ff8080', color: 'white' };
              finalDateTimeStyle = { color: 'white' };
              finalAbsenceCounterClass = 'text-white';
          }
          // Rule 3: Within one hour from now
          else if (isWithinAnHour) {
              finalLiStyle = { backgroundColor: '#ffe0e0' };
          }
          // Rule 4: Today's non-urgent/non-overdue calls
          else {
              finalLiStyle = { backgroundColor: '#ffffff' };
              finalDateTimeStyle = { backgroundColor: '#ffe0e0' };
          }
      }
    }

    // Overrides for specific time parts on the date/time banner
    if (timePart === '至急') {
        finalDateTimeStyle.backgroundColor = '#ff0000';
        finalDateTimeStyle.color = 'white'; // Ensure text is readable
    } else if (timePart === '時設なし' || timePart === '入電待ち') {
        finalDateTimeStyle.color = '#797979';
    }

    return { 
        liStyle: finalLiStyle, 
        dateTimeStyle: finalDateTimeStyle, 
        absenceCounterClass: finalAbsenceCounterClass 
    };
  }, [call.status, call.dateTime, isPrecheckTheme]);
  
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(call.customerId);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      alert('コピーに失敗しました。');
    }
  };
  
  const handleConfirmComplete = () => {
    onUpdateCall(call.id, { status: '完了' });
    setConfirmationModalOpen(false);
  };

  const handleCheckboxClick = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    // Only prevent default when checking, to show the confirmation modal first.
    if (call.status !== '完了') {
      e.preventDefault();
      setConfirmationModalOpen(true);
    }
    // When un-checking, we let the default browser behavior proceed,
    // and the onChange handler will update the application state.
  };

  const handleCheckboxChange = () => {
    // This handler is now only responsible for un-checking.
    if (call.status === '完了') {
      onUpdateCall(call.id, { status: '追客中' });
    }
  };

  const formatDateTimeDisplay = () => {
    try {
      const [datePart, timePart] = call.dateTime.split('T');
      
      const isSpecialTime = ['待機中', '至急', 'このあとOK', '時設なし', '入電待ち'].includes(timePart);

      const callDate = new Date(isSpecialTime ? datePart : call.dateTime);
      if (isNaN(callDate.getTime())) return <span className="text-red-500">Invalid Date</span>;

      const today = new Date();
      const isToday =
        callDate.getFullYear() === today.getFullYear() &&
        callDate.getMonth() === today.getMonth() &&
        callDate.getDate() === today.getDate();
      
      let timeDisplay: string;
      if (isSpecialTime) {
          timeDisplay = timePart;
      } else {
          const hours = callDate.getHours().toString().padStart(2, '0');
          const minutes = callDate.getMinutes().toString().padStart(2, '0');
          timeDisplay = `${hours}:${minutes}`;
      }

      if (isToday) {
        return <span className="text-lg font-semibold">{timeDisplay}</span>;
      } else {
        const month = (callDate.getMonth() + 1).toString().padStart(2, '0');
        const day = callDate.getDate().toString().padStart(2, '0');
        return <span>{`${month}/${day} ${timeDisplay}`}</span>;
      }
    } catch (e) {
      return <span className="text-red-500">Invalid Date</span>;
    }
  };

  const isCompleted = call.status === '完了';
  const isAllMembersView = selectedMember === '全体';
  
  const absenteeRanks: Rank[] = ['見込C留守', '見込B留守', '見込A留守', '見込S留守'];
  const mikomRanks: Record<string, Rank> = {
    '見込S': '見込S留守',
    '見込A': '見込A留守',
    '見込B': '見込B留守',
    '見込C': '見込C留守',
  };
  // 見込留守→見込の逆引きマップ
  const absenteeToMikomRanks: Record<string, Rank> = {
    '見込S留守': '見込S',
    '見込A留守': '見込A',
    '見込B留守': '見込B',
    '見込C留守': '見込C',
  };
  const isMikomRank = Object.keys(mikomRanks).includes(call.rank);
  const isAbsenteeRank = absenteeRanks.includes(call.rank);
  const showAbsenceCount = isPrecheckTheme || isAbsenteeRank || isMikomRank;

  const mainTextClass = isPrecheckTheme ? 'text-[#118f82]' : 'text-[#0193be]';
  const mainRingClass = isPrecheckTheme ? 'ring-[#118f82]' : 'ring-[#0193be]';
  const focusRingClass = isPrecheckTheme ? 'focus:ring-[#118f82]' : 'focus:ring-[#0193be]';

  const liClasses = [
    'transition-all', 'duration-300', 'rounded-lg',
    isEditing ? `ring-2 ring-offset-1 ${mainRingClass}` : 'shadow-sm',
    isHighlighted ? 'bg-yellow-200 shadow-lg scale-[1.02]' :
    isCompleted ? 'bg-[#666666] text-white' :
    `bg-white ${mainTextClass}`,
  ].filter(Boolean).join(' ');

  const handleEditClick = (e: React.MouseEvent, field: EditableField) => {
    e.stopPropagation();
    if (isCompleted || isEditing) return;
    setEditingState({
        field,
        targetRect: (e.currentTarget as HTMLElement).getBoundingClientRect(),
    });
  };

  const handleSaveInline = (updatedData: Partial<Omit<CallRequest, 'id'>>) => {
      onUpdateCall(call.id, updatedData);
      setEditingState(null);
  };

  const handleClosePopup = () => {
      setEditingState(null);
  };

  const handleSaveFull = (updatedData: Partial<Omit<CallRequest, 'id'>>) => {
    onUpdateCall(call.id, updatedData);
    setIsEditing(false);
  };

  const editableFieldClasses = "w-full text-left rounded p-1 -m-1 disabled:cursor-not-allowed hover:enabled:bg-slate-200/60 transition decoration-dashed underline-offset-4 hover:enabled:underline";
  const isFieldDisabled = isCompleted || isEditing;

  const handleAbsenceCountIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFieldDisabled) return;

    const currentCount = call.absenceCount || 0;
    const newCount = Math.min(currentCount + 1, 9);
    // 見込SABCの場合は対応する留守ランクに自動変更
    const newRank = isMikomRank ? mikomRanks[call.rank] : call.rank;
    onUpdateCall(call.id, { absenceCount: newCount, rank: newRank });
  };
  
  const rankOptionsForDisplay = useMemo(() => {
    const options = isPrecheckTheme ? PRECHECK_RANK_OPTIONS : NON_PRECHECK_RANK_OPTIONS;
    if (!options.includes(call.rank)) {
        return [call.rank, ...options];
    }
    return options;
  }, [isPrecheckTheme, call.rank]);

  const rankStyle = RANK_STYLES[call.rank] || { backgroundColor: '#f1f5f9', color: '#1e293b' };

  const hasPrecheckPermission = currentUser.isLinePrechecker;

  const handlePrecheckerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasPrecheckPermission || isCompleted) return;

    if (call.prechecker) {
      if (call.prechecker === currentUser.name) {
        onUpdateCall(call.id, { prechecker: null });
      } else {
        onUpdateCall(call.id, { prechecker: currentUser.name });
      }
    } else {
      onUpdateCall(call.id, { prechecker: currentUser.name });
    }
  };

  const handleImportClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasPrecheckPermission || isCompleted) return;
    
    const newImportedStatus = !call.imported;
    const updateData: Partial<Omit<CallRequest, 'id'>> = { imported: newImportedStatus };

    if (newImportedStatus && call.rank === 'IMP依頼') {
      const datePart = call.dateTime.split('T')[0];
      updateData.dateTime = `${datePart}T待機中`;
    }

    onUpdateCall(call.id, updateData);
  };

  const customerIdButtonClasses = [
    "flex-grow", "truncate", "text-center", "p-1", "-m-1", "rounded", "transition", "font-bold",
    "cursor-pointer",
    isDuplicate && !isCompleted
        ? 'bg-yellow-400 text-white hover:bg-yellow-500' 
        : 'hover:bg-slate-200/60'
  ].join(' ');

  return (
    <li ref={liRef} className={liClasses} style={liStyle}>
      <div className="px-2 py-1 flex items-center gap-1.5 text-sm">
          <div className="w-6 flex-shrink-0 flex justify-center items-center">
            <div className="relative h-5 w-5">
              <input
                  type="checkbox"
                  id={`call-item-checkbox-${call.id}`}
                  className={`appearance-none cursor-pointer h-5 w-5 rounded-full border-2 border-slate-400 bg-white transition-colors checked:border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 ${isPrecheckTheme ? 'checked:bg-[#118f82] focus:ring-[#118f82]' : 'checked:bg-[#0193be] focus:ring-[#0193be]'} disabled:opacity-50`}
                  checked={call.status === '完了'}
                  onClick={handleCheckboxClick}
                  onChange={handleCheckboxChange}
                  aria-label={`Mark call ${call.customerId} as complete`}
              />
              {call.status === '完了' && (
                  <CheckIcon className="absolute top-1/2 left-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 text-white pointer-events-none" />
              )}
            </div>
          </div>

          {isAllMembersView && (
            <div className={`w-20 flex-shrink-0 truncate ${isCompleted ? 'line-through' : 'text-current/80'}`}>
                <button onClick={(e) => handleEditClick(e, 'assignee')} disabled={isFieldDisabled} className={`${editableFieldClasses} text-center`} title="担当者を編集">
                  {call.assignee}
                </button>
            </div>
          )}

          <div className="w-28 flex-shrink-0 flex items-center gap-1 group">
              <button 
                  onClick={(e) => { 
                      e.stopPropagation();
                      if (isEditing) return;
                      onSelectCall(call);
                  }}
                  className={customerIdButtonClasses}
                  title={call.customerId}
              >
                  {call.customerId}
              </button>
              {isCopied ? (
                  <CheckIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
              ) : (
                  <button onClick={handleCopy} className="p-1 text-current/60 rounded hover:bg-slate-300/50 hover:text-current/80 transition duration-200 flex-shrink-0" title="顧客IDをコピー">
                      <ClipboardDocumentIcon className="w-4 h-4" />
                  </button>
              )}
          </div>

          <div className={`w-24 flex-shrink-0 whitespace-nowrap ${isCompleted ? 'line-through' : ''}`}>
             <button onClick={(e) => handleEditClick(e, 'dateTime')} disabled={isFieldDisabled} className={`${editableFieldClasses} text-center`} title="日時を編集" style={dateTimeStyle}>
               {formatDateTimeDisplay()}
             </button>
          </div>

          {!isPrecheckTheme && (
            <div className={`w-12 flex-shrink-0 truncate ${isCompleted ? 'line-through' : 'text-current/80'}`}>
              <button onClick={(e) => handleEditClick(e, 'listType')} disabled={isFieldDisabled} className={`${editableFieldClasses} text-center`} title="種別を編集">
                {call.listType}
              </button>
            </div>
          )}

          <div className="w-24 flex-shrink-0">
            <button
              ref={rankButtonRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isFieldDisabled) return;

                if (isRankDropdownOpen) {
                  setIsRankDropdownOpen(false);
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDropdownPosition({
                    top: rect.bottom + 4,
                    left: rect.left,
                    width: rect.width
                  });
                  setIsRankDropdownOpen(true);
                }
              }}
              disabled={isFieldDisabled}
              style={{
                backgroundColor: rankStyle.backgroundColor,
                color: rankStyle.color,
                border: rankStyle.border || '1px solid transparent',
              }}
              className={`w-full text-center px-2 py-1 text-xs font-bold rounded-md transition-opacity disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-0 ${mainRingClass} ${isCompleted ? 'opacity-50' : ''}`}
              title="ランクを編集"
              aria-haspopup="listbox"
              aria-expanded={isRankDropdownOpen}
            >
              {call.rank}
            </button>
            {isRankDropdownOpen && dropdownPosition && createPortal(
              <div
                ref={dropdownMenuRef}
                className="fixed z-50 bg-white rounded-md shadow-lg border border-slate-200 max-h-60 overflow-auto animate-wipe-in-down"
                style={{
                  top: `${dropdownPosition.top}px`,
                  left: `${dropdownPosition.left}px`,
                  width: `${dropdownPosition.width}px`,
                }}
              >
                <ul className="p-1 space-y-1" role="listbox">
                  {rankOptionsForDisplay.map(opt => {
                    const style = RANK_STYLES[opt] || { backgroundColor: '#f1f5f9', color: '#1e293b' };
                    return (
                      <li key={opt} role="option" aria-selected={call.rank === opt}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            // 見込留守→見込 に変更する場合は留守回数をリセット
                            const updateData: Partial<Omit<CallRequest, 'id'>> = { rank: opt };
                            if (absenteeRanks.includes(call.rank) && Object.values(mikomRanks).includes(opt as Rank) === false && Object.keys(mikomRanks).includes(opt)) {
                              updateData.absenceCount = 0;
                            }
                            // 見込留守 → 見込SABC への変更時も留守回数リセット
                            if (isAbsenteeRank && Object.keys(mikomRanks).includes(opt)) {
                              updateData.absenceCount = 0;
                            }
                            onUpdateCall(call.id, updateData);
                            setIsRankDropdownOpen(false);
                          }}
                          style={{
                            backgroundColor: style.backgroundColor,
                            color: style.color,
                            border: style.border || '1px solid transparent',
                          }}
                          className="w-full text-center px-2 py-1 text-xs font-bold rounded-md transition-transform duration-150 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-1 ring-blue-400"
                        >
                          {opt}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>,
              document.body
            )}
          </div>
          
          <div className={`w-16 flex-shrink-0 text-center ${isCompleted ? 'line-through' : 'text-current/80'}`}>
            {showAbsenceCount ? (
              <div className="flex items-center justify-center gap-0.5">
                {/* ☎ボタン：+1 */}
                <button
                  onClick={handleAbsenceCountIncrement}
                  disabled={isFieldDisabled}
                  className={`flex items-center justify-center rounded p-0.5 transition ${absenceCounterClass} hover:enabled:bg-slate-200/60 disabled:opacity-40 disabled:cursor-not-allowed`}
                  title={!isFieldDisabled ? (isMikomRank ? `クリックで留守1・${mikomRanks[call.rank]}に変更` : '留守回数を+1') : ''}
                >
                  <PhoneMissedIcon className="w-3.5 h-3.5" />
                </button>
                {/* 回数カスタムドロップダウン（見込留守 or 回線前確タブ） */}
                {(isAbsenteeRank || isPrecheckTheme) && (
                  <div className="relative">
                    <button
                      ref={absenceButtonRef}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isFieldDisabled) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setAbsenceDropdownPosition({ top: rect.bottom + 4, left: rect.left });
                        setIsAbsenceDropdownOpen(prev => !prev);
                      }}
                      disabled={isFieldDisabled}
                      className={`text-xs font-bold px-1 py-0.5 rounded transition hover:enabled:bg-slate-200/60 disabled:cursor-not-allowed ${absenceCounterClass}`}
                    >
                      {(call.absenceCount && call.absenceCount > 0) ? call.absenceCount : '-'}
                    </button>
                    {isAbsenceDropdownOpen && absenceDropdownPosition && createPortal(
                      <div
                        ref={absenceDropdownRef}
                        className="fixed z-50 bg-white rounded-md shadow-lg border border-slate-200 overflow-hidden"
                        style={{ top: absenceDropdownPosition.top, left: absenceDropdownPosition.left, width: '2rem' }}
                      >
                        {[{ label: '-', value: null }, ...Array.from({ length: 9 }, (_, i) => ({ label: String(i + 1), value: i + 1 }))].map(opt => (
                          <button
                            key={opt.label}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (opt.value === null) {
                                // 「-」選択：見込留守はランク戻し、回線前確は回数リセットのみ
                                if (isAbsenteeRank && absenteeToMikomRanks[call.rank]) {
                                  onUpdateCall(call.id, { absenceCount: 0, rank: absenteeToMikomRanks[call.rank] });
                                } else {
                                  onUpdateCall(call.id, { absenceCount: 0 });
                                }
                              } else {
                                onUpdateCall(call.id, { absenceCount: opt.value });
                              }
                              setIsAbsenceDropdownOpen(false);
                            }}
                            className={`w-full text-center px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 transition ${
                              opt.value === null
                                ? (!call.absenceCount ? 'bg-slate-100' : '')
                                : (call.absenceCount === opt.value ? 'bg-slate-100' : '')
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>,
                      document.body
                    )}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-slate-300">-</span>
            )}
          </div>

          {isPrecheckTheme && (
            <div className="w-14 flex-shrink-0 flex items-center justify-center">
              {call.imported ? (
                <button
                  onClick={handleImportClick}
                  disabled={!hasPrecheckPermission || isCompleted}
                  className={`px-2 py-1 text-xs font-medium rounded transition ${
                    !hasPrecheckPermission || isCompleted
                      ? 'cursor-not-allowed bg-slate-100 text-slate-500'
                      : 'cursor-pointer bg-green-100 text-green-800 hover:bg-green-200'
                  }`}
                  title={hasPrecheckPermission ? "クリックして解除" : ""}
                >
                  完了
                </button>
              ) : (
                <div className="relative h-5 w-5">
                  <button
                    className={`cursor-pointer h-5 w-5 rounded-full border-2 border-slate-400 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      isPrecheckTheme ? 'focus:ring-[#118f82]' : 'focus:ring-[#0193be]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    disabled={!hasPrecheckPermission || isCompleted}
                    onClick={handleImportClick}
                    aria-label={`Mark import for call ${call.customerId}`}
                  />
                </div>
              )}
            </div>
          )}

          {!isPrecheckTheme && (
            <div className={`flex-1 truncate ${isCompleted ? 'line-through' : 'text-current/80'}`}>
              <button 
                onClick={(e) => {
                    e.stopPropagation();
                    if (isEditing) return;
                    onSelectCall(call);
                }} 
                disabled={isFieldDisabled} 
                className={`${editableFieldClasses} cursor-pointer`} 
                title={call.notes}
              >
                {call.notes || '-'}
              </button>
            </div>
          )}

          {isPrecheckTheme && (
            <div className="w-20 flex-shrink-0 flex items-center justify-center">
              {call.prechecker ? (
                <button
                  onClick={handlePrecheckerClick}
                  disabled={!hasPrecheckPermission || isCompleted}
                  className={`px-2 py-1 text-xs font-medium rounded transition ${
                       !hasPrecheckPermission || isCompleted ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'cursor-pointer bg-green-100 text-green-800 hover:bg-green-200'
                  }`}
                  title={hasPrecheckPermission ? "クリックして変更/解除" : ""}
                >
                  {call.prechecker}
                </button>
              ) : (
                <div className="relative h-5 w-5">
                  <button
                    className={`cursor-pointer h-5 w-5 rounded-full border-2 border-slate-400 bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        isPrecheckTheme ? 'focus:ring-[#118f82]' : 'focus:ring-[#0193be]'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    disabled={!hasPrecheckPermission || isCompleted}
                    onClick={handlePrecheckerClick}
                    aria-label={`Mark precheck for call ${call.customerId}`}
                  />
                </div>
              )}
            </div>
          )}

          {showRequesterColumn && (
            <div className={`w-20 flex-shrink-0 truncate text-center ${isCompleted ? 'line-through' : 'text-current/80'}`}>
                <button onClick={(e) => handleEditClick(e, 'requester')} disabled={isFieldDisabled} className={`${editableFieldClasses} text-center`} title="依頼者を編集">
                  {call.requester === call.assignee ? '' : call.requester}
                </button>
            </div>
          )}
          
          <div className="w-8 flex-shrink-0 flex items-center justify-center">
              <button
                  onClick={(e) => {
                      e.stopPropagation();
                      if (isCompleted) return;
                      setIsEditing((prev) => !prev);
                  }}
                  disabled={isCompleted}
                  className="p-1.5 text-current/60 rounded-full hover:enabled:bg-slate-200/60 hover:text-current/80 transition duration-200 disabled:cursor-not-allowed"
                  title="この依頼を編集する"
              >
                  <PencilIcon className="w-5 h-5" />
              </button>
          </div>
      </div>

      <div className={`grid transition-all duration-500 ease-in-out ${isEditing ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden">
              <div className="px-4 pb-3 pt-2 border-t border-slate-300/70 bg-slate-100/50">
                  <CallEditForm 
                      call={call}
                      onSave={handleSaveFull}
                      onCancel={() => setIsEditing(false)}
                      members={members}
                      isPrecheckTheme={isPrecheckTheme}
                  />
              </div>
          </div>
      </div>
      
      {editingState && createPortal(
        <InlineEditPopup
            field={editingState.field}
            call={call}
            onSave={handleSaveInline}
            onClose={handleClosePopup}
            targetRect={editingState.targetRect}
            members={members}
            users={users}
            isPrecheckTheme={isPrecheckTheme}
        />,
        document.body
      )}

      <ConfirmationModal
        isOpen={isConfirmationModalOpen}
        onClose={() => setConfirmationModalOpen(false)}
        onConfirm={handleConfirmComplete}
        title="完了確認"
      >
        <p>顧客ID: <strong className="text-slate-800">{call.customerId}</strong> を完了しますか？</p>
      </ConfirmationModal>
    </li>
  );
};

export default CallListItem;
