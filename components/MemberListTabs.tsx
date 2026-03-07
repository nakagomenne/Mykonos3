import React, { useRef, useEffect } from 'react';
import { User } from '../types';
import { UserIcon, ListBulletIcon, CircleIcon, UsersGroupIcon } from './icons';
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
            const isListTab = member === '新規依頼';
            const isAllTab = member === '全体';
            const isPrecheckerTab = member === PRECHECKER_ASSIGNEE_NAME;
            const user = !isListTab && !isAllTab && !isPrecheckerTab ? userMap.get(member) : undefined;
            const isSelected = member === selectedMember;
            
            return (
              <button
                ref={isSelected ? selectedMemberTabRef : null}
                key={member}
                onClick={isListTab ? onListTabClick : () => onSelectMember(member)}
                className={`
                  group flex flex-col items-center justify-end gap-1.5 rounded-t-lg
                  border-b-[2.5px] px-3 pb-2 pt-1 font-medium text-sm
                  min-w-[90px] transition-all duration-500 
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
                      transition-all duration-500
                      ${isSelected ? 'ring-[3px] ring-[#0193be] ring-offset-1' : `ring-[2px] ${isDarkMode ? 'ring-slate-600 group-hover:ring-[#0193be]/50' : 'ring-slate-300 group-hover:ring-[#0193be]/50'}`}
                    `}>
                      {isListTab ? (
                        <div className={`flex h-full w-full items-center justify-center rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'} text-[#0193be]/60`}>
                          <ListBulletIcon className="h-7 w-7" />
                        </div>
                      ) : isAllTab ? (
                        <div className={`flex h-full w-full items-center justify-center rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'} text-[#0193be]/60`}>
                          <UsersGroupIcon className="h-7 w-7" />
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
                      {!isListTab && !isAllTab && !isPrecheckerTab && user && (
                        <span
                          className={`absolute top-0 right-0 block h-3 w-3 rounded-full ring-[3px] ${isDarkMode ? 'ring-[#1a1f2e]' : 'ring-white'} ${AVAILABILITY_STATUS_STYLES[user.availabilityStatus].bg}`}
                          title={`稼働状況: ${user.availabilityStatus}`}
                        />
                      )}
                    </div>
                </div>
                {isListTab ? (
                   <span className="whitespace-nowrap text-center">{member}</span>
                ) : (
                  <span className="whitespace-nowrap text-center">{member}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
};

export default MemberListTabs;
