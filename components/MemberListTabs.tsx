import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { User } from '../types';
import { UserIcon, ListBulletIcon, ChevronDownIcon, CircleIcon, SpeechBubbleIcon, XMarkIcon } from './icons';
import { AVAILABILITY_STATUS_STYLES, PRECHECKER_ASSIGNEE_NAME } from '../constants';

interface MemberListTabsProps {
  members: string[];
  users: User[];
  selectedMember: string;
  onSelectMember: (member: string) => void;
  onListTabClick: () => void;
  currentUser: User;
  onSelectOwnTab: () => void;
  isDarkMode?: boolean;
}

const MemberListTabs: React.FC<MemberListTabsProps> = ({ members, users, selectedMember, onSelectMember, onListTabClick, currentUser, onSelectOwnTab, isDarkMode = false }) => {
  const userMap = new Map(users.map(u => [u.name, u]));
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedMemberTabRef = useRef<HTMLButtonElement>(null);
  const listTabButtonRef = useRef<HTMLButtonElement>(null);

  const [isCommentPopupOpen, setIsCommentPopupOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{ top: number, left: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const commentedUsers = users
    .filter(u => u.comment && u.comment.trim() !== '')
    .sort((a, b) => {
        const dateA = a.commentUpdatedAt ? new Date(a.commentUpdatedAt) : new Date(0);
        const dateB = b.commentUpdatedAt ? new Date(b.commentUpdatedAt) : new Date(0);
        return dateB.getTime() - dateA.getTime();
    });

  const handleCommentIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const targetButtonRef = selectedMember === '全体' ? listTabButtonRef : selectedMemberTabRef;
    if (targetButtonRef.current) {
        const rect = targetButtonRef.current.getBoundingClientRect();
        
        const popupWidth = 320;
        const popupHeight = 400;
        let top = rect.bottom + 8;
        let left = rect.left;

        if (left + popupWidth > window.innerWidth - 16) {
            left = window.innerWidth - popupWidth - 16;
        }
        if (top + popupHeight > window.innerHeight - 16) {
            top = rect.top - popupHeight - 8;
        }

        setPopupPosition({ top: Math.max(8, top), left: Math.max(8, left) });
    }
    setIsCommentPopupOpen(true);
  };

  useEffect(() => {
    if (scrollContainerRef.current && selectedMemberTabRef.current) {
      const scrollContainer = scrollContainerRef.current;
      const selectedTab = selectedMemberTabRef.current;
      
      const containerWidth = scrollContainer.offsetWidth;
      const tabLeft = selectedTab.offsetLeft;
      const tabWidth = selectedTab.offsetWidth;

      const scrollLeft = tabLeft - (containerWidth / 2) + (tabWidth / 2);
      
      scrollContainer.scrollTo({
        left: scrollLeft,
        behavior: 'smooth'
      });
    }
  }, [selectedMember]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      container.scrollBy({ left: e.deltaY * 2, behavior: 'smooth' });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
            setIsCommentPopupOpen(false);
        }
    };

    if (isCommentPopupOpen) {
        document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCommentPopupOpen]);

  const formatRelativeTime = (isoString?: string): string => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'たった今';
    
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}分前`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}時間前`;
    
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');

    return `${month}/${day} ${hours}:${minutes}`;
  };

  return (
    <>
      <div className={`mb-4 border-b ${isDarkMode ? 'border-white/10' : 'border-slate-200/70'}`} style={{ background: isDarkMode ? 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(1,147,190,0.05) 100%)' : 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(1,147,190,0.03) 100%)' }}>
        <nav ref={scrollContainerRef} className="-mb-px flex space-x-1 overflow-x-auto pb-0" aria-label="Tabs">
          {members.map((member) => {
            const isListTab = member === '全体';
            const isPrecheckerTab = member === PRECHECKER_ASSIGNEE_NAME;
            const user = !isListTab && !isPrecheckerTab ? userMap.get(member) : undefined;
            const isSelected = member === selectedMember;
            
            const getRef = () => {
              if (isListTab) return listTabButtonRef;
              if (isSelected) return selectedMemberTabRef;
              return null;
            }

            return (
              <button
                ref={getRef()}
                key={member}
                onClick={isListTab ? onListTabClick : () => onSelectMember(member)}
                className={`
                  group flex flex-col items-center justify-end gap-1.5 rounded-t-lg
                  border-b-[2.5px] px-3 pb-2 pt-1 font-medium text-sm
                  min-w-[90px] transition-all duration-200 
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0193be]
                  ${
                    isSelected
                      ? `border-[#0193be] text-[#0193be] ${isDarkMode ? 'bg-[#0193be]/10' : 'bg-white'} shadow-sm`
                      : `border-transparent ${isDarkMode ? 'text-[#0193be]/50 hover:text-[#0193be] hover:border-[#0193be]/30 hover:bg-white/5' : 'text-[#0193be]/60 hover:text-[#0193be] hover:border-[#0193be]/30 hover:bg-white/70'}`
                  }
                  ${isListTab ? `sticky left-0 z-10 ${isDarkMode ? 'bg-[#1a1f2e]' : 'bg-white'}` : ''}
                `}
                aria-current={isSelected ? 'page' : undefined}
              >
                <div className="h-14 w-full flex flex-col justify-end items-center">
                  <div className={`
                      relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full 
                      transition-all duration-200
                      ${isSelected ? 'ring-2 ring-[#0193be] ring-offset-1' : `ring-1 ${isDarkMode ? 'ring-slate-600 group-hover:ring-[#0193be]/50' : 'ring-slate-300 group-hover:ring-[#0193be]/50'}`}
                    `}>
                      {isListTab ? (
                        <div className={`flex h-full w-full items-center justify-center rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'} text-[#0193be]/60`}>
                          <ListBulletIcon className="h-7 w-7" />
                        </div>
                      ) : isPrecheckerTab ? (
                        <div className={`flex h-full w-full items-center justify-center rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'} text-[#0193be]/60`}>
                          <CircleIcon className="h-7 w-7" />
                        </div>
                      ) : user?.profilePicture ? (
                        <img src={user.profilePicture} alt={user.name} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <div className={`flex h-full w-full items-center justify-center rounded-full ${isDarkMode ? 'bg-slate-700 text-slate-500' : 'bg-slate-200 text-slate-400'}`}>
                          <UserIcon className="h-7 w-7" />
                        </div>
                      )}
                      {!isListTab && !isPrecheckerTab && user && (
                        <span
                          className={`absolute top-0 right-0 block h-3 w-3 rounded-full ring-2 ${isDarkMode ? 'ring-[#1a1f2e]' : 'ring-white'} ${AVAILABILITY_STATUS_STYLES[user.availabilityStatus].bg}`}
                          title={`稼働状況: ${user.availabilityStatus}`}
                        />
                      )}
                    </div>
                </div>
                {isListTab ? (
                   <span className="whitespace-nowrap flex items-center justify-center gap-1.5">
                      {member}
                      {commentedUsers.length > 0 && (
                          <button
                              onClick={handleCommentIconClick}
                              className={`p-0.5 -m-0.5 rounded-full ${isDarkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200'} transition`}
                              aria-label="コメント一覧を表示"
                          >
                              <SpeechBubbleIcon className="w-4 h-4 text-[#0193be]/80 group-hover:text-[#0193be]" />
                          </button>
                      )}
                  </span>
                ) : (
                  <span className="whitespace-nowrap text-center">{member}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      {isCommentPopupOpen && popupPosition && createPortal(
        <div 
          ref={popupRef}
          className="fixed z-50 bg-[#0193be] rounded-lg shadow-xl w-80 max-h-[50vh] flex flex-col animate-fade-in-up"
          style={{ top: popupPosition.top, left: popupPosition.left }}
        >
          <div className="p-3 border-b border-white/20 flex justify-between items-center flex-shrink-0">
              <h3 className="text-base font-bold text-white">メンバーコメント</h3>
              <button onClick={() => setIsCommentPopupOpen(false)} className="p-1 text-white/70 hover:text-white rounded-full transition-colors">
                  <XMarkIcon className="w-5 h-5" />
              </button>
          </div>
          <div className="overflow-y-auto p-2">
              {commentedUsers.length > 0 ? (
                  <ul className="space-y-1">
                      {commentedUsers.map(user => (
                          <li key={user.name}>
                              <button
                                onClick={() => {
                                  if (currentUser && user.name === currentUser.name) {
                                    onSelectOwnTab();
                                  } else {
                                    onSelectMember(user.name);
                                  }
                                  setIsCommentPopupOpen(false);
                                }}
                                className={`w-full text-left p-2 rounded-md ${isDarkMode ? 'bg-white/10 border border-white/20 hover:bg-white/20' : 'bg-slate-100 border border-slate-200 hover:bg-slate-200'} transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0193be]`}
                              >
                                <div className="flex items-center gap-3 mb-1.5">
                                    <div className="relative w-8 h-8 flex-shrink-0">
                                        {user.profilePicture ? (
                                            <img src={user.profilePicture} alt={user.name} className="w-8 h-8 rounded-full object-cover"/>
                                        ) : (
                                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                                <UserIcon className="w-5 h-5"/>
                                            </div>
                                        )}
                                        <span
                                            className={`absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-white ${AVAILABILITY_STATUS_STYLES[user.availabilityStatus].bg}`}
                                            title={`稼働状況: ${user.availabilityStatus}`}
                                        />
                                    </div>
                                    <div className="flex-grow flex justify-between items-center">
                                        <span className="font-semibold text-sm text-white">{user.name}</span>
                                        {user.commentUpdatedAt && (
                                          <span className="text-xs text-white/80 whitespace-nowrap ml-2">
                                            {formatRelativeTime(user.commentUpdatedAt)}
                                          </span>
                                        )}
                                    </div>
                                </div>
                                <p className={`text-sm ${isDarkMode ? 'text-white/90 bg-white/10 border border-white/20' : 'text-[#0193be] bg-white border border-slate-200'} p-2 rounded`}>{user.comment}</p>
                              </button>
                          </li>
                      ))}
                  </ul>
              ) : (
                  <p className="p-4 text-sm text-white/80 text-center">コメントを設定しているメンバーはいません。</p>
              )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default MemberListTabs;
