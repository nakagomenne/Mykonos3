import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CallRequest, User, CallStatus, AvailabilityStatus, EditHistory, EditChange, CallRequestUpdatableFields } from './types';
import CallList from './components/CallList';
import MemberListTabs from './components/MemberListTabs';
import { PlusIcon, UserIcon, UsersGroupIcon, ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, ShieldCheckIcon, StarIcon, ArrowRightStartOnRectangleIcon, CalendarIcon, ChevronRightIcon, ChevronLeftIcon, CheckIcon, CircleIcon, BellIcon, PencilIcon, SpeechBubbleIcon, KeyIcon } from './components/icons';
import { DEFAULT_USERS, SUPER_ADMIN_NAMES, AVAILABILITY_STATUS_OPTIONS, AVAILABILITY_STATUS_STYLES, ADMIN_USER_NAME, PRECHECKER_ASSIGNEE_NAME, DEFAULT_INITIAL_PASSWORD, NAKAGOMI_INITIAL_PASSWORD } from './constants';
import CallRequestForm from './components/CallRequestForm';
import CallDetailModal from './components/CallDetailModal';
import Login from './components/Login';
import AdminMenu from './components/AdminMenu';
import ScheduleModal from './components/ScheduleModal';
import ConfirmationModal from './components/ConfirmationModal';
import ShiftCalendar from './components/ShiftCalendar';
import CommentModal from './components/CommentModal';
import PasswordSettingsModal from './components/PasswordSettingsModal';
import {
  fetchCallRequests,
  createCallRequest,
  updateCallRequest as apiUpdateCallRequest,
  deleteExpiredCompletedCalls,
  createBulkCallRequests,
  fetchUsers,
  updateUser,
  upsertUsers,
  deleteUser as apiDeleteUser,
  updateUserAvailabilityStatus,
  updateUserPassword as apiUpdateUserPassword,
  updateUserNonWorkingDays,
  updateUserComment,
  fetchAppSettings,
  updateAppSetting,
  subscribeToCallRequests,
  subscribeToUsers,
  subscribeToAppSettings,
} from './services/apiService';

interface SearchResultItem {
  type: 'customer' | 'user';
  value: string;
  call?: CallRequest;
  user?: User;
}

interface Alert {
  type: 'schedule' | 'overdue';
  userName: string;
  message: string;
}

const App: React.FC = () => {
  // ──────────────────────────────────────────────────────────
  // ローディング・エラー状態
  // ──────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ──────────────────────────────────────────────────────────
  // ログインユーザー（セッションのみ localStorage に保存）
  // ──────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('mykonosUser');
    try {
        return savedUser ? JSON.parse(savedUser) : null;
    } catch {
        return null;
    }
  });

  // ──────────────────────────────────────────────────────────
  // ユーザー・案件・設定 → Supabase から取得
  // ──────────────────────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [calls, setCalls] = useState<CallRequest[]>([]);
  
  const [selectedMember, setSelectedMember] = useState<string>('全体');
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isShiftCalendarVisible, setIsShiftCalendarVisible] = useState(false);
  const [selectedCall, setSelectedCall] = useState<CallRequest | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedCallId, setHighlightedCallId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CallRequest[] | null>(null);
  const [searchResultsList, setSearchResultsList] = useState<SearchResultItem[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [formResetCounter, setFormResetCounter] = useState(0);
  const [viewMode, setViewMode] = useState<'mine' | 'others' | 'precheck'>('mine');
  const [announcement, setAnnouncement] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('ver 3.0.0');
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    existingCalls: CallRequest[];
    newCallData: Omit<CallRequest, 'id' | 'status' | 'createdAt'>;
  } | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [scheduleViewingUser, setScheduleViewingUser] = useState<User | null>(null);
  const [pendingNonWorkingDayConfirmation, setPendingNonWorkingDayConfirmation] = useState<Omit<CallRequest, 'id' | 'status' | 'createdAt'> | null>(null);
  const [pendingUnavailableTodayConfirmation, setPendingUnavailableTodayConfirmation] = useState<Omit<CallRequest, 'id' | 'status' | 'createdAt'> | null>(null);
  const [pendingUnavailableConfirmation, setPendingUnavailableConfirmation] = useState<Omit<CallRequest, 'id' | 'status' | 'createdAt'> | null>(null);
  const [previewMember, setPreviewMember] = useState<string | null>(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [prefilledRequestDate, setPrefilledRequestDate] = useState<string | null>(null);
  const [lastViewedTimestamps, setLastViewedTimestamps] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem('mykonosLastViewedTimestamps');
    try {
        return saved ? JSON.parse(saved) : {};
    } catch {
        return {};
    }
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('mykonosNotificationsEnabled');
    return saved ? JSON.parse(saved) : false;
  });
  const [duplicateCustomerIds, setDuplicateCustomerIds] = useState<Set<string>>(new Set());


  const userMenuRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const announcementMarqueeRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    // ──────────────────────────────────────────────
    // 初回マウント: Supabase から全データを取得
    // ──────────────────────────────────────────────
    let isMounted = true;

    const loadInitialData = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        // 期限切れの完了済み案件を先に削除
        await deleteExpiredCompletedCalls();

        const [fetchedUsers, fetchedCalls, settings] = await Promise.all([
          fetchUsers(),
          fetchCallRequests(),
          fetchAppSettings(),
        ]);

        if (!isMounted) return;

        setUsers(fetchedUsers);
        setCalls(fetchedCalls);
        if (settings.announcement !== undefined) setAnnouncement(settings.announcement);
        if (settings.app_version  !== undefined) setAppVersion(settings.app_version);

      } catch (err: any) {
        if (!isMounted) return;
        console.error('初期データの取得に失敗しました:', err);
        setLoadError(err?.message ?? '初期データの取得に失敗しました。');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadInitialData();

    // ──────────────────────────────────────────────
    // Realtime 購読
    // ──────────────────────────────────────────────
    const unsubCalls    = subscribeToCallRequests(setCalls);
    const unsubUsers    = subscribeToUsers(setUsers);
    const unsubSettings = subscribeToAppSettings(settings => {
      if (settings.announcement !== undefined) setAnnouncement(settings.announcement);
      if (settings.app_version  !== undefined) setAppVersion(settings.app_version);
    });

    return () => {
      isMounted = false;
      unsubCalls();
      unsubUsers();
      unsubSettings();
    };
  }, []);

  // currentUser はセッション管理のため localStorage に保存
  useEffect(() => {
    if (currentUser) {
      const { isLoggedInAsAdmin, ...userToSave } = currentUser;
      localStorage.setItem('mykonosUser', JSON.stringify(userToSave));
    } else {
      localStorage.removeItem('mykonosUser');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('mykonosLastViewedTimestamps', JSON.stringify(lastViewedTimestamps));
  }, [lastViewedTimestamps]);

  useEffect(() => {
    localStorage.setItem('mykonosNotificationsEnabled', JSON.stringify(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
    const customerIdCounts = new Map<string, number>();
    calls.forEach(call => {
        const trimmedId = call.customerId.trim().toLowerCase();
        if (trimmedId) {
            customerIdCounts.set(trimmedId, (customerIdCounts.get(trimmedId) || 0) + 1);
        }
    });

    const duplicates = new Set<string>();
    for (const [id, count] of customerIdCounts.entries()) {
        if (count > 1) {
            duplicates.add(id);
        }
    }
    setDuplicateCustomerIds(duplicates);
  }, [calls]);

  useEffect(() => {
    const container = announcementMarqueeRef.current;
    if (!container) return;

    if (announcement) {
      // アニメーションを一旦リセットしてから再計算する
      container.style.animation = 'none';
      container.style.willChange = 'auto';

      // requestAnimationFrame を2回ネストして、
      // ブラウザがレイアウトを確実に完了した後に scrollWidth を取得する
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // コンテンツが10個並んでいるので、1個分の幅 = scrollWidth / 10
          // ただし scrollWidth が 0 の場合は fallback として文字数で推定
          const singleWidth = container.scrollWidth > 0
            ? container.scrollWidth / 10
            : announcement.length * 16; // 1文字 ≈ 16px で推定

          if (singleWidth > 0) {
            const pixelsPerSecond = 80;
            const duration = Math.max(5, singleWidth / pixelsPerSecond);
            container.style.animation = `marquee ${duration}s linear infinite`;
            container.style.willChange = 'transform';
          }
        });
      });

      return () => cancelAnimationFrame(raf);

    } else {
      // お知らせが空になったらアニメーション停止
      container.style.animation = 'none';
      container.style.willChange = 'auto';
    }
  }, [announcement]);
  
  // 期限切れ案件の削除は初回ロード時に apiService 側で実行済み
  // （削除後の最新データが setCalls でセットされるため、ここは不要）

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  useEffect(() => {
    if (currentUser) {
      const user = users.find(u => u.name === currentUser.name);
      if (user) {
        const today = new Date();
        const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
        const todayStr = localDate.toISOString().split('T')[0];

        const isNonWorkingDay = (user.nonWorkingDays || []).includes(todayStr);

        if (isNonWorkingDay && user.availabilityStatus !== '非稼働') {
          handleUpdateUserStatus(user.name, '非稼働');
        }
      }
    }
  }, [currentUser, users]);

  useEffect(() => {
    if (!notificationsEnabled || !currentUser || Notification.permission !== 'granted') {
        return;
    }

    const checkCalls = () => {
        const now = new Date();
        const myCalls = calls.filter(call => call.assignee === currentUser.name && call.status === '追客中');

        myCalls.forEach(call => {
            try {
                const [datePart, timePart] = call.dateTime.split('T');
                if (!timePart || ['至急', 'このあとOK', '時設なし', '入電待ち'].includes(timePart)) {
                    return;
                }
                
                const callDateTime = new Date(call.dateTime);
                const timeDifference = now.getTime() - callDateTime.getTime();

                // Notify if it's within 30 seconds of the scheduled time (from 0s up to 30s past due)
                if (timeDifference >= 0 && timeDifference < 30000) {
                    const notifiedInSession = sessionStorage.getItem(`notified_${call.id}`);
                    if (!notifiedInSession) {
                        new Notification('架電時間のお知らせ', {
                            body: `顧客ID: ${call.customerId}\n予定時間: ${timePart}`,
                            tag: call.id,
                            icon: '/vite.svg',
                        });
                        sessionStorage.setItem(`notified_${call.id}`, 'true');
                    }
                }

            } catch (e) {
                // Ignore invalid dates or other errors
            }
        });
    };
    
    checkCalls();
    const intervalId = setInterval(checkCalls, 30000); // Check every 30 seconds

    return () => {
        clearInterval(intervalId);
    };
  }, [notificationsEnabled, calls, currentUser]);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      const trimmedQuery = searchQuery.trim().toLowerCase();
      
      const matchedCalls = calls.filter(call => call.customerId.toLowerCase().includes(trimmedQuery));
      const uniqueCustomerIds = [...new Set<string>(matchedCalls.map(call => call.customerId))];
      const customerResults: SearchResultItem[] = uniqueCustomerIds.map(customerId => {
        const call = matchedCalls.find(c => c.customerId === customerId)!;
        return { type: 'customer', value: customerId, call };
      });

      const userResults: SearchResultItem[] = users
        .filter(user => user.name.toLowerCase().includes(trimmedQuery))
        .map(user => ({ type: 'user', value: user.name, user }));

      setSearchResultsList([...customerResults, ...userResults].slice(0, 10));
    } else {
      setSearchResultsList([]);
    }
  }, [searchQuery, calls, users]);

  const alerts = useMemo((): Alert[] => {
    if (!currentUser?.isLoggedInAsAdmin) return [];

    const today = new Date();
    const dayOfMonth = today.getDate();

    // 削除済みでないアクティブなユーザー名のセット
    const activeUserNames = new Set(users.map(u => u.name));
    
    // Schedule Alerts: Check for next month's schedule from the 28th of the current month.
    let scheduleAlerts: Alert[] = [];
    if (dayOfMonth >= 28) {
      const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const nextMonthPrefix = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

      scheduleAlerts = users
        .filter(user => {
          const hasScheduleForNextMonth = (user.nonWorkingDays || []).some(day => day.startsWith(nextMonthPrefix));
          return !hasScheduleForNextMonth;
        })
        .map(user => ({
          type: 'schedule' as const,
          userName: user.name,
          message: '翌月スケジュール未設定',
        }));
    }

    // Overdue Task Alerts
    const todayForOverdue = new Date();
    todayForOverdue.setHours(0, 0, 0, 0);
    const overdueCalls = calls.filter(call => {
        if (call.status === '完了') return false;
        // 削除済みユーザーが担当の案件は除外
        if (call.assignee.includes('(削除済み)')) return false;
        // アクティブなユーザーが担当の案件のみ対象
        if (!activeUserNames.has(call.assignee)) return false;
        try {
            const [datePart] = call.dateTime.split('T');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return false;
            const [year, month, day] = datePart.split('-').map(Number);
            const callDate = new Date(year, month - 1, day);
            return callDate < todayForOverdue;
        } catch (e) {
            return false;
        }
    });
    const membersWithOverdueTasks = [...new Set<string>(overdueCalls.map(call => call.assignee))];
    const overdueAlerts = membersWithOverdueTasks.map(userName => ({
        type: 'overdue' as const,
        userName: userName,
        message: '赤見込あり',
    }));

    return [...scheduleAlerts, ...overdueAlerts].sort((a, b) => a.userName.localeCompare(b.userName));
  }, [users, calls, currentUser]);

  const handleLogin = (user: User, isLoggedInAsAdmin: boolean) => {
    setCurrentUser({ ...user, isLoggedInAsAdmin });
    setViewMode('mine');
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };
  
  const handleViewModeChange = (newMode: 'mine' | 'others' | 'precheck', memberToSelect?: string) => {
    if (newMode === 'mine' && currentUser) {
      setLastViewedTimestamps(prev => ({
        ...prev,
        [currentUser.name]: new Date().toISOString(),
      }));
    } else if (newMode === 'precheck') {
      setLastViewedTimestamps(prev => ({
        ...prev,
        [PRECHECKER_ASSIGNEE_NAME]: new Date().toISOString(),
      }));
    }
  
    if (newMode === 'others') {
      setPreviewMember(null);
      setSelectedMember(memberToSelect || '全体');
      setShouldAnimate(false);
    }
    
    setIsFormVisible(false);
    setFormResetCounter(c => c + 1);
  
    setViewMode(newMode);
  };

  const handleSelectMember = (member: string) => {
    setSelectedMember(member);
    setPreviewMember(null);
    setIsShiftCalendarVisible(false);
    setIsFormVisible(false);
  };
  
  const handleListTabClick = () => {
      setSelectedMember('全体');
      setPreviewMember(null);
  };

  const handleSelectMemberFromCalendar = (memberName: string, date: Date) => {
    const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    
    setPrefilledRequestDate(formattedDate);
    handleSelectMember(memberName);
    setIsFormVisible(true);
    setIsShiftCalendarVisible(false);
  };

  const handlePrefillConsumed = () => {
    setPrefilledRequestDate(null);
  };

  const _createCall = async (callData: Omit<CallRequest, 'id' | 'status' | 'createdAt'>) => {
    try {
      const newCall = await createCallRequest(callData);

      if (newCall.requester === newCall.assignee) {
        setLastViewedTimestamps(prev => ({
          ...prev,
          [newCall.assignee]: newCall.createdAt,
        }));
      }

      // Realtime で自動更新されるが、即時性のためにローカルにも反映
      setCalls(prevCalls => [...prevCalls, newCall]);
      setIsFormVisible(false);
    } catch (err: any) {
      console.error('案件の作成に失敗しました:', err);
      alert(`案件の作成に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleAddCall = async (newCallData: Omit<CallRequest, 'id' | 'status' | 'createdAt'>): Promise<boolean> => {
    const trimmedCustomerId = newCallData.customerId.trim();
    if (!trimmedCustomerId) {
        alert('顧客IDを入力してください。');
        return false;
    }
    
    const existingCalls = calls.filter(call => call.customerId.trim().toLowerCase() === trimmedCustomerId.toLowerCase());
    if (existingCalls.length > 0) {
      const isNewCallPrecheck = newCallData.assignee === PRECHECKER_ASSIGNEE_NAME;
      const hasExistingNormalCall = existingCalls.some(c => c.assignee !== PRECHECKER_ASSIGNEE_NAME);
      const hasExistingPrecheckCall = existingCalls.some(c => c.assignee === PRECHECKER_ASSIGNEE_NAME);

      let showDuplicateDialog = false;
      if (isNewCallPrecheck && hasExistingPrecheckCall) {
        showDuplicateDialog = true;
      } else if (!isNewCallPrecheck && hasExistingNormalCall) {
        showDuplicateDialog = true;
      }

      if (showDuplicateDialog) {
        setPendingDuplicate({ existingCalls, newCallData });
        return false;
      }
    }
    
    const assigneeUser = users.find(u => u.name === newCallData.assignee);
    const [requestDate, requestTime] = newCallData.dateTime.split('T');
    if (assigneeUser && (assigneeUser.nonWorkingDays || []).includes(requestDate)) {
        setPendingNonWorkingDayConfirmation(newCallData);
        return false;
    }

    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    const todayStr = localDate.toISOString().split('T')[0];

    if (newCallData.requester !== newCallData.assignee) {
      if (assigneeUser?.availabilityStatus === '当日受付不可' && requestDate === todayStr) {
          setPendingUnavailableTodayConfirmation(newCallData);
          return false;
      }
      
      if (assigneeUser?.availabilityStatus === '受付不可' && requestDate === todayStr) {
          const isUrgentOrSoon = ['至急', 'このあとOK'].includes(requestTime);
          let isWithinTwoHours = false;
          
          if (!isUrgentOrSoon && !['時設なし', '入電待ち'].includes(requestTime)) {
              const [hours, minutes] = requestTime.split(':').map(Number);
              if (!isNaN(hours) && !isNaN(minutes)) {
                  const now = new Date();
                  const requestDateTime = new Date();
                  const [year, month, day] = requestDate.split('-').map(Number);
                  requestDateTime.setFullYear(year, month - 1, day);
                  requestDateTime.setHours(hours, minutes, 0, 0);

                  const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
                  
                  if (requestDateTime > now && requestDateTime <= twoHoursFromNow) {
                      isWithinTwoHours = true;
                  }
              }
          }

          if (isUrgentOrSoon || isWithinTwoHours) {
              setPendingUnavailableConfirmation(newCallData);
              return false;
          }
      }
    }

    _createCall(newCallData);
    return true;
  };
  
  const handleConfirmDuplicateCreation = async () => {
    if (!pendingDuplicate) return;
    await _createCall(pendingDuplicate.newCallData);
    setPendingDuplicate(null);
    setFormResetCounter(c => c + 1);
  };
  
  const handleCancelDuplicateCreation = () => {
    setPendingDuplicate(null);
  };

  const handleConfirmNonWorkingDayCreation = async () => {
    if (!pendingNonWorkingDayConfirmation) return;
    await _createCall(pendingNonWorkingDayConfirmation);
    setPendingNonWorkingDayConfirmation(null);
    setFormResetCounter(c => c + 1);
  };

  const handleConfirmUnavailableTodayCreation = async () => {
    if (!pendingUnavailableTodayConfirmation) return;
    await _createCall(pendingUnavailableTodayConfirmation);
    setPendingUnavailableTodayConfirmation(null);
    setFormResetCounter(c => c + 1);
  };

  const handleConfirmUnavailableCreation = async () => {
    if (!pendingUnavailableConfirmation) return;
    await _createCall(pendingUnavailableConfirmation);
    setPendingUnavailableConfirmation(null);
    setFormResetCounter(c => c + 1);
  };

  const handleUpdateCall = async (id: string, updatedData: Partial<Omit<CallRequest, 'id'>>) => {
    if (!currentUser) return;

    try {
      const updated = await apiUpdateCallRequest(id, updatedData, currentUser.name);

      // ローカル状態を即時更新（Realtime の前に反映）
      setCalls(prevCalls =>
        prevCalls.map(call => (call.id === id ? updated : call))
      );
    } catch (err: any) {
      console.error('案件の更新に失敗しました:', err);
      alert(`案件の更新に失敗しました: ${err?.message ?? err}`);
    }
  };
  
  const handleSelectCall = (call: CallRequest) => {
    setSelectedCall(call);
    setSearchResults(null);
  };

  const handleSearch = () => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    if (!trimmedQuery) return;

    const foundCalls = calls.filter(call => call.customerId.toLowerCase().includes(trimmedQuery));
    if (foundCalls.length > 0) {
        setSearchResults(foundCalls);
        setSelectedCall(null);
        setSearchQuery('');
        setSearchResultsList([]);
        setIsSearchFocused(false);
        return;
    }

    const foundUser = users.find(user => user.name.toLowerCase().includes(trimmedQuery));
    if (foundUser) {
        if (currentUser && foundUser.name === currentUser.name) {
            handleViewModeChange('mine');
        } else {
            handleViewModeChange('others', foundUser.name);
        }
        setSearchQuery('');
        setSearchResultsList([]);
        setIsSearchFocused(false);
        return;
    }

    alert('指定された顧客IDまたはメンバー名に一致する情報は見つかりませんでした。');
  };
  
  const handleSearchResultClick = (item: SearchResultItem) => {
      setSearchQuery('');
      setSearchResultsList([]);
      setIsSearchFocused(false);

      if (item.type === 'customer' && item.call) {
          const matchingCalls = calls.filter(c => c.customerId.toLowerCase() === item.call!.customerId.toLowerCase());
          setSearchResults(matchingCalls.length > 0 ? matchingCalls : [item.call]);
          setSelectedCall(null);
      } else if (item.type === 'user' && item.user) {
          if (currentUser && item.user.name === currentUser.name) {
              handleViewModeChange('mine');
          } else {
              handleViewModeChange('others', item.user.name);
          }
      }
  };

  const handleJumpToCall = (call: CallRequest) => {
    setSearchResults(null);
    if (call.assignee === currentUser?.name) {
        handleViewModeChange('mine');
    } else {
        handleViewModeChange('others', call.assignee);
    }
    setTimeout(() => {
        setHighlightedCallId(call.id);
        setTimeout(() => {
            setHighlightedCallId(null);
        }, 30000);
    }, 100);
  };

  const handleJumpToMember = (userName: string) => {
    if (currentUser?.name === userName) {
      handleViewModeChange('mine');
    } else {
      handleViewModeChange('others', userName);
    }
    setIsAdminMenuOpen(false);
  };

  const handleAdminSave = async (updatedUsers: User[], deletedUserNames: string[]) => {
    try {
      // 削除処理
      for (const name of deletedUserNames) {
        await apiDeleteUser(name);
      }

      // upsert (追加・更新)
      const savedUsers = await upsertUsers(updatedUsers);
      setUsers(savedUsers);

      if (deletedUserNames.length > 0) {
        // 削除されたユーザーが担当の案件を「(削除済み)」に
        const updatePromises = calls
          .filter(call => deletedUserNames.includes(call.requester))
          .map(call =>
            apiUpdateCallRequest(call.id, { requester: `${call.requester} (削除済み)` }, currentUser?.name ?? 'system')
          );
        await Promise.all(updatePromises);

        setCalls(prevCalls =>
          prevCalls.map(call =>
            deletedUserNames.includes(call.requester)
              ? { ...call, requester: `${call.requester} (削除済み)` }
              : call
          )
        );

        if (deletedUserNames.includes(selectedMember)) {
          setSelectedMember('全体');
        }

        if (currentUser && deletedUserNames.includes(currentUser.name)) {
          handleLogout();
          return;
        }
      }

      const updatedSelf = savedUsers.find(u => u.name === currentUser?.name);
      if (updatedSelf && currentUser) {
        const { isLoggedInAsAdmin } = currentUser;
        const permissionsChanged =
          updatedSelf.isAdmin !== currentUser.isAdmin ||
          updatedSelf.isSuperAdmin !== currentUser.isSuperAdmin;
        if (permissionsChanged) {
          setCurrentUser({ ...updatedSelf, isLoggedInAsAdmin });
        }
      }
    } catch (err: any) {
      console.error('管理者保存に失敗しました:', err);
      alert(`保存に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleUpdatePassword = async (newPassword: string) => {
    if (!currentUser) return;
    try {
      await apiUpdateUserPassword(currentUser.name, newPassword);
      setUsers(prevUsers =>
        prevUsers.map(u => (u.name === currentUser.name ? { ...u, password: newPassword } : u))
      );
      setIsPasswordModalOpen(false);
      alert('パスワードが更新されました。');
    } catch (err: any) {
      alert(`パスワードの更新に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleResetUserPassword = async (userName: string) => {
    const resetPassword = userName === ADMIN_USER_NAME ? NAKAGOMI_INITIAL_PASSWORD : DEFAULT_INITIAL_PASSWORD;
    try {
      await apiUpdateUserPassword(userName, resetPassword);
      setUsers(prevUsers =>
        prevUsers.map(u => (u.name === userName ? { ...u, password: resetPassword } : u))
      );
      alert(`${userName}さんのパスワードが初期化されました。`);
    } catch (err: any) {
      alert(`パスワードの初期化に失敗しました: ${err?.message ?? err}`);
    }
  };
  
  const handleSetAnnouncement = async (text: string) => {
    const trimmed = text.trim();
    try {
      await updateAppSetting('announcement', trimmed);
      setAnnouncement(trimmed);
    } catch (err: any) {
      alert(`お知らせの更新に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleSetAppVersion = async (version: string) => {
    try {
      await updateAppSetting('app_version', version);
      setAppVersion(version);
    } catch (err: any) {
      alert(`バージョンの更新に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleUpdateUserStatus = async (name: string, status: AvailabilityStatus) => {
    try {
      await updateUserAvailabilityStatus(name, status);
      setUsers(prevUsers =>
        prevUsers.map(u => (u.name === name ? { ...u, availabilityStatus: status } : u))
      );
    } catch (err: any) {
      alert(`ステータスの更新に失敗しました: ${err?.message ?? err}`);
    }
  };
  
  const handleShowUserSchedule = (userName: string) => {
    const userToShow = users.find(u => u.name === userName);
    if (userToShow) {
      setScheduleViewingUser(userToShow);
    }
  };

  const handleUpdateNonWorkingDays = async (userName: string, dates: string[]) => {
    try {
      const today = new Date();
      const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
      const todayStr = localDate.toISOString().split('T')[0];
      const sortedDates = [...dates].sort();

      // 今日が非稼働日かどうかで availability_status も更新
      const targetUser = users.find(u => u.name === userName);
      let newStatus: AvailabilityStatus | undefined;

      if (userName === currentUser?.name && targetUser) {
        const isTodayNonWorking = sortedDates.includes(todayStr);
        const wasTodayNonWorking = (targetUser.nonWorkingDays || []).includes(todayStr);

        if (isTodayNonWorking && targetUser.availabilityStatus !== '非稼働') {
          newStatus = '非稼働';
        } else if (!isTodayNonWorking && wasTodayNonWorking && targetUser.availabilityStatus === '非稼働') {
          newStatus = '受付可';
        }
      }

      await updateUserNonWorkingDays(userName, sortedDates);
      if (newStatus) await updateUserAvailabilityStatus(userName, newStatus);

      setUsers(prevUsers =>
        prevUsers.map(user => {
          if (user.name === userName) {
            const updatedUser = { ...user, nonWorkingDays: sortedDates };
            if (newStatus) updatedUser.availabilityStatus = newStatus;
            return updatedUser;
          }
          return user;
        })
      );
    } catch (err: any) {
      alert(`スケジュールの更新に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleSaveComment = async (comment: string) => {
    if (!currentUser) return;
    try {
      const trimmed = comment.trim();
      await updateUserComment(currentUser.name, trimmed);
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.name === currentUser.name
            ? { ...u, comment: trimmed, commentUpdatedAt: new Date().toISOString() }
            : u
        )
      );
    } catch (err: any) {
      alert(`コメントの保存に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleCreateBulkTasks = async (
    taskData: Omit<CallRequest, 'id' | 'status' | 'createdAt' | 'assignee' | 'customerId'>,
    assignees: string[]
  ) => {
    if (!currentUser) return;
    try {
      const callsData = assignees.map(assignee => ({
        ...taskData,
        customerId: '',
        assignee,
        prechecker: null,
        imported: false,
      }));

      const newTasks = await createBulkCallRequests(callsData);
      setCalls(prevCalls => [...prevCalls, ...newTasks]);
      alert(`${assignees.length}件の全体タスクを作成しました。`);
    } catch (err: any) {
      alert(`一括タスク作成に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleToggleNotifications = async () => {
    if (!notificationsEnabled) { // Toggling ON
        if (!('Notification' in window)) {
            alert('このブラウザはデスクトップ通知をサポートしていません。');
            return;
        }
        if (Notification.permission === 'granted') {
            setNotificationsEnabled(true);
        } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                setNotificationsEnabled(true);
                new Notification("Mykonos", { body: "通知が有効になりました。" });
            }
        } else {
             alert('通知がブロックされています。ブラウザの設定を変更してください。');
        }
    } else { // Toggling OFF
        setNotificationsEnabled(false);
    }
  };

  const memberNames = users.map(u => u.name);
  const assigneesForEditing = currentUser?.isLinePrechecker ? [...new Set([...memberNames, PRECHECKER_ASSIGNEE_NAME])] : memberNames;

  const statusOrder: Record<CallStatus, number> = {
    '完了': 0,
    '追客中': 1,
  };

  const getTimePriority = (timeStr: string | undefined): number => {
    if (!timeStr) return 99999;
    if (timeStr === '待機中') return -3;
    if (timeStr === '至急') return -2;
    if (timeStr === 'このあとOK') return -1;
    if (timeStr === '時設なし') return 9999;
    if (timeStr === '入電待ち') return 10000;
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      const [h, m] = parts.map(Number);
      if (!isNaN(h) && !isNaN(m)) {
        return h * 100 + m; // e.g., 11:30 -> 1130
      }
    }
    return 99998; // Fallback for robustness
  };

  const sortedCalls = [...calls].sort((a, b) => {
    const orderA = statusOrder[a.status] ?? 99;
    const orderB = statusOrder[b.status] ?? 99;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const [datePartA, timePartA] = a.dateTime.split('T');
    const [datePartB, timePartB] = b.dateTime.split('T');

    if (datePartA !== datePartB) {
      return datePartA.localeCompare(datePartB);
    }

    return getTimePriority(timePartA) - getTimePriority(timePartB);
  });

  const filteredCalls = sortedCalls.filter(call => {
    if (viewMode === 'mine') {
      return call.assignee === currentUser?.name;
    } else if (viewMode === 'precheck') {
      return call.assignee === PRECHECKER_ASSIGNEE_NAME;
    } else { // viewMode === 'others'
      if (call.assignee === currentUser?.name) {
        return false;
      }
      if (selectedMember === PRECHECKER_ASSIGNEE_NAME) {
        return call.assignee === PRECHECKER_ASSIGNEE_NAME;
      }
      return selectedMember === '全体' ? false : call.assignee === selectedMember;
    }
  });
  
  const otherMemberNames = memberNames.filter(m => m !== currentUser?.name);
  const hasPrecheckers = users.some(u => u.isLinePrechecker);
  const otherMembers = ['全体'];
  if (hasPrecheckers) {
    otherMembers.push(PRECHECKER_ASSIGNEE_NAME);
  }
  otherMembers.push(...otherMemberNames);

  
  const defaultAssigneeForForm = () => {
    if (viewMode === 'mine') {
      return currentUser?.name;
    }
    if (viewMode === 'precheck') {
      return PRECHECKER_ASSIGNEE_NAME;
    }
    if (viewMode === 'others') {
      if (selectedMember === PRECHECKER_ASSIGNEE_NAME) {
          return PRECHECKER_ASSIGNEE_NAME;
      }
      return selectedMember === '全体' ? undefined : selectedMember;
    }
    return undefined;
  };

  const usersForForm = (viewMode === 'others' && selectedMember === PRECHECKER_ASSIGNEE_NAME)
      ? users.filter(u => u.isLinePrechecker)
      : users;

  const unreadCountForMineTab = useMemo(() => {
    if (!currentUser) return 0;
    const lastViewed = lastViewedTimestamps[currentUser.name];
    if (!lastViewed) {
        return calls.filter(call => call.assignee === currentUser.name).length;
    }

    const lastViewedDate = new Date(lastViewed);

    return calls.filter(call => 
        call.assignee === currentUser.name &&
        call.createdAt &&
        new Date(call.createdAt) > lastViewedDate
    ).length;
  }, [calls, currentUser, lastViewedTimestamps]);

  const unreadCountForPrecheckTab = useMemo(() => {
    if (!currentUser?.isLinePrechecker) return 0;
    const lastViewed = lastViewedTimestamps[PRECHECKER_ASSIGNEE_NAME];
    
    const precheckCalls = calls.filter(call => call.assignee === PRECHECKER_ASSIGNEE_NAME);

    if (!lastViewed) {
        return precheckCalls.length;
    }

    const lastViewedDate = new Date(lastViewed);

    return precheckCalls.filter(call => 
        call.createdAt && new Date(call.createdAt) > lastViewedDate
    ).length;
  }, [calls, currentUser, lastViewedTimestamps]);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f2f4f7]">
        <div className="text-center">
          <h1 className="text-5xl font-bold font-inconsolata text-[#0193be] mb-4">Mykonos</h1>
          <div className="flex justify-center gap-2">
            <div className="w-3 h-3 bg-[#0193be] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-3 h-3 bg-[#0193be] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-3 h-3 bg-[#0193be] rounded-full animate-bounce"></div>
          </div>
          <p className="mt-4 text-slate-500 text-sm">データを読み込んでいます...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f2f4f7]">
        <div className="text-center max-w-md px-6">
          <h1 className="text-5xl font-bold font-inconsolata text-[#0193be] mb-4">Mykonos</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 font-semibold mb-2">接続エラー</p>
            <p className="text-red-600 text-sm">{loadError}</p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-[#0193be] text-white rounded-lg hover:bg-[#017a9a] transition-colors"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} users={users} />;
  }
  
  const currentUserWithData = users.find(u => u.name === currentUser.name);

  // Define theme colors based on viewMode
  const isPrecheckModeActive = viewMode === 'precheck';
  const isMineModeActive = viewMode === 'mine';
  const isDarkHeader = isPrecheckModeActive || isMineModeActive;

  const isPrecheckContext = viewMode === 'precheck' || (viewMode === 'others' && selectedMember === PRECHECKER_ASSIGNEE_NAME);
  const isPrecheckTheme = viewMode === 'precheck';

  const headerBgClass = isPrecheckModeActive ? 'bg-[#118f82]' : isMineModeActive ? 'bg-[#0193be]' : 'bg-white';
  const headerTextClass = isDarkHeader ? 'text-white' : 'text-[#0193be]';
  
  const searchIconClass = isDarkHeader ? 'text-white/80 hover:text-white' : 'text-[#0193be]/60 hover:text-[#0193be]';
  
  const adminButtonClass = isDarkHeader
    ? 'text-white/80 hover:bg-white/10 hover:text-white'
    : 'text-slate-500 hover:bg-slate-200 hover:text-slate-800';

  const userMenuButtonClass = isDarkHeader
    ? 'text-white hover:bg-white/10'
    : 'text-[#0193be] hover:bg-slate-200/60';

  const userMenuAvatarBgClass = isDarkHeader ? 'bg-white/20' : 'bg-slate-200';

  const footerClasses = isPrecheckModeActive 
    ? 'bg-[#118f82] text-white border-white/20' 
    : isMineModeActive 
    ? 'bg-[#0193be] text-white border-white/20' 
    : 'bg-white text-[#0193be]/80 border-slate-200';
  
  const contentContainerClasses = currentUser.isLinePrechecker
    ? `bg-white shadow-md border-x border-b border-slate-200 rounded-b-lg ${
        viewMode === 'mine' ? 'rounded-tr-lg' : (viewMode === 'others' ? 'rounded-tl-lg' : '')
      }`
    : `bg-white shadow-md border-x border-b border-slate-200 rounded-b-lg ${
        viewMode === 'mine' ? 'rounded-tr-lg' : 'rounded-tl-lg'
      }`;


  return (
    <div className="bg-[#f2f4f7] min-h-screen font-sans">
      <header className={`shadow-sm sticky top-0 z-20 transition-colors duration-300 ${headerBgClass}`}>
        <div className="px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
          <div className="flex-shrink-0 flex items-center gap-2">
            <span className={`text-xs font-inconsolata transition-colors duration-300 ${isDarkHeader ? 'text-white/60' : 'text-[#0193be]/50'}`}>{appVersion}</span>
            <h1 className={`text-5xl font-bold font-inconsolata transition-colors duration-300 ${headerTextClass}`}>Mykonos</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-72" ref={searchRef}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  onFocus={() => setIsSearchFocused(true)}
                  placeholder="顧客ID or メンバー名で検索..."
                  className="w-full pl-4 pr-10 py-2 border border-slate-300 rounded-lg shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition text-[#0193be]"
                />
                <button 
                  onClick={handleSearch} 
                  className={`absolute inset-y-0 right-0 flex items-center pr-3 transition-colors ${searchIconClass}`}
                  aria-label="Search"
                >
                  <MagnifyingGlassIcon className="w-5 h-5" />
                </button>
                {isSearchFocused && searchResultsList.length > 0 && (
                  <ul className="absolute z-30 mt-1 w-full bg-white rounded-md shadow-lg border border-slate-200 max-h-80 overflow-auto">
                    {searchResultsList.map((item, index) => (
                      <li key={`${item.type}-${item.value}-${index}`}>
                        <button
                          onClick={() => handleSearchResultClick(item)}
                          className="w-full text-left px-4 py-2 hover:bg-slate-100 transition flex items-center gap-3"
                        >
                          {item.type === 'customer' ? <MagnifyingGlassIcon className="w-4 h-4 text-slate-400" /> : <UserIcon className="w-4 h-4 text-slate-400" />}
                          <span className="text-[#0193be]">{item.value}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
            </div>

            {currentUser.isLoggedInAsAdmin && (
              <div className="relative">
                <button
                    onClick={() => setIsAdminMenuOpen(true)}
                    className={`p-2 rounded-full transition-colors duration-200 ${adminButtonClass}`}
                    title={currentUser.isSuperAdmin ? 'SA用メニュー' : '管理者用メニュー'}
                >
                    {currentUser.isSuperAdmin ? (
                      <StarIcon className="w-6 h-6" />
                    ) : (
                      <ShieldCheckIcon className="w-6 h-6" />
                    )}
                </button>
                {alerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white ring-2 ring-white">
                    {alerts.length}
                  </span>
                )}
              </div>
            )}
            <div className="relative" ref={userMenuRef}>
              <button 
                  onClick={() => setIsUserMenuOpen(prev => !prev)}
                  className={`flex items-center gap-2 text-sm p-1 rounded-full transition-colors duration-300 ${userMenuButtonClass}`}
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="true"
              >
                  <div className="relative flex-shrink-0">
                    {currentUserWithData?.profilePicture ? (
                        <img src={currentUserWithData.profilePicture} alt={currentUser.name} className="w-8 h-8 rounded-full object-cover"/>
                    ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${userMenuAvatarBgClass}`}>
                           <UserIcon className="w-5 h-5" />
                        </div>
                    )}
                    {(() => {
                        const status = currentUserWithData?.availabilityStatus || '非稼働';
                        const statusStyle = AVAILABILITY_STATUS_STYLES[status];
                        const ringColorClass = 'ring-white';
                        return (
                          <span 
                            className={`absolute top-0 right-0 block h-2.5 w-2.5 rounded-full ${statusStyle.bg} ring-2 ${ringColorClass}`}
                            title={`稼働ステータス: ${status}`}
                          />
                        )
                    })()}
                  </div>
                  <span className="text-lg pr-2">{currentUser.name}</span>
              </button>
              {isUserMenuOpen && (
                  <div 
                    className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-30"
                    role="menu" aria-orientation="vertical"
                  >
                      <div className="py-1" role="none">
                          <div className="px-4 pt-2 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">稼働ステータス</div>
                          {AVAILABILITY_STATUS_OPTIONS.map(status => {
                              const statusStyles = AVAILABILITY_STATUS_STYLES[status];
                              const isCurrent = currentUserWithData?.availabilityStatus === status;
                              return (
                                  <button
                                      key={status}
                                      onClick={() => {
                                          handleUpdateUserStatus(currentUser.name, status);
                                          setIsUserMenuOpen(false);
                                      }}
                                      className="flex items-center justify-between w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                                      role="menuitem"
                                  >
                                      <div className="flex items-center gap-3">
                                          <span className={`h-2.5 w-2.5 rounded-full ${statusStyles.bg}`}></span>
                                          <span>{status}</span>
                                      </div>
                                      {isCurrent && <CheckIcon className="w-5 h-5 text-[#0193be]" />}
                                  </button>
                              );
                          })}
                      </div>
                      <div className="border-t border-slate-100 my-1" />
                      <div className="py-1" role="none">
                          <button
                            onClick={() => {
                              setIsScheduleModalOpen(true);
                              setIsUserMenuOpen(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            role="menuitem"
                          >
                            <CalendarIcon className="w-5 h-5 text-slate-500" />
                            <span>スケジュール設定</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsPasswordModalOpen(true);
                              setIsUserMenuOpen(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                            role="menuitem"
                          >
                            <KeyIcon className="w-5 h-5 text-slate-500" />
                            <span>パスワード設定</span>
                          </button>
                      </div>
                      <div className="border-t border-slate-100 my-1" />
                      <div className="py-1" role="none">
                        <button
                          onClick={() => {
                            setIsCommentModalOpen(true);
                            setIsUserMenuOpen(false);
                          }}
                          className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                          role="menuitem"
                        >
                          <PencilIcon className="w-5 h-5 text-slate-500" />
                          <span>コメント設定</span>
                        </button>
                      </div>
                      <div className="border-t border-slate-100 my-1" />
                      <div className="py-1" role="none">
                          <div className="flex items-center justify-between w-full px-4 py-2 text-sm text-slate-700">
                              <label htmlFor="notification-toggle" className="flex items-center gap-3 cursor-pointer">
                                  <BellIcon className="w-5 h-5 text-slate-500" />
                                  <span>通知</span>
                              </label>
                              <button
                                  type="button"
                                  id="notification-toggle"
                                  onClick={handleToggleNotifications}
                                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0193be] focus:ring-offset-2 ${
                                      notificationsEnabled ? 'bg-[#0193be]' : 'bg-slate-200'
                                  }`}
                                  role="switch"
                                  aria-checked={notificationsEnabled}
                              >
                                  <span
                                      aria-hidden="true"
                                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                          notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                                      }`}
                                  />
                              </button>
                          </div>
                      </div>
                      <div className="border-t border-slate-100 my-1" />
                      <div className="py-1" role="none">
                          <button
                              onClick={() => {
                                  handleLogout();
                                  setIsUserMenuOpen(false);
                              }}
                              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                              role="menuitem"
                          >
                              <ArrowRightStartOnRectangleIcon className="w-5 h-5 text-slate-500" />
                              <span>ログアウト</span>
                          </button>
                      </div>
                  </div>
              )}
            </div>
          </div>
        </div>
      </header>
      
      <main className="px-4 sm:px-6 lg:px-8 py-4">
        {announcement && (
          <div className="mb-4 bg-yellow-100 border border-yellow-300 text-yellow-800 text-sm rounded-lg shadow-md overflow-hidden">
            <div className="p-2 flex whitespace-nowrap">
              <div 
                ref={announcementMarqueeRef}
                className="flex flex-shrink-0"
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <span key={i} className="font-semibold px-4 tracking-wider" aria-hidden={i > 0}>
                    {announcement}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        <div>
          <nav className="border-b border-slate-200">
            {currentUser.isLinePrechecker ? (
              <div className="grid grid-cols-3" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'mine'}
                    title="自身の案件一覧"
                    className={`flex justify-center items-center py-4 font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0193be] ${
                        viewMode === 'mine'
                            ? 'border-slate-200 border-x border-t rounded-t-lg bg-white text-[#0193be] -mb-[1px]'
                            : 'border-transparent text-slate-500 hover:text-[#0193be]'
                    }`}
                    onClick={() => handleViewModeChange('mine')}
                  >
                    <div className="relative">
                      <UserIcon className="w-6 h-6" />
                      {unreadCountForMineTab > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white ring-2 ring-white">
                          {unreadCountForMineTab}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'precheck'}
                    title="回線前確"
                    className={`flex justify-center items-center py-4 font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#118f82] ${
                        viewMode === 'precheck'
                            ? 'border-slate-200 border-x border-t rounded-t-lg bg-white text-[#118f82] -mb-[1px]'
                            : 'border-transparent text-slate-500 hover:text-[#118f82]'
                    }`}
                    onClick={() => handleViewModeChange('precheck')}
                  >
                    <div className="relative">
                        <CircleIcon className="w-6 h-6" />
                        {unreadCountForPrecheckTab > 0 && (
                            <span className="absolute -top-1.5 -right-2.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white ring-2 ring-white">
                                {unreadCountForPrecheckTab}
                            </span>
                        )}
                    </div>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'others'}
                    title="自分以外の案件一覧"
                    className={`flex justify-center items-center py-4 font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0193be] ${
                        viewMode === 'others'
                            ? 'border-slate-200 border-x border-t rounded-t-lg bg-white text-[#0193be] -mb-[1px]'
                            : 'border-transparent text-slate-500 hover:text-[#0193be]'
                    }`}
                    onClick={() => handleViewModeChange('others')}
                  >
                    <UsersGroupIcon className="h-6 w-auto" />
                  </button>
              </div>
            ) : (
              <div className="grid grid-cols-2" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'mine'}
                    title="自身の案件一覧"
                    className={`flex justify-center items-center py-4 font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0193be] ${
                        viewMode === 'mine'
                            ? 'border-slate-200 border-x border-t rounded-t-lg bg-white text-[#0193be] -mb-[1px]'
                            : 'border-transparent text-slate-500 hover:text-[#0193be]'
                    }`}
                    onClick={() => handleViewModeChange('mine')}
                  >
                    <div className="relative">
                      <UserIcon className="w-6 h-6" />
                      {unreadCountForMineTab > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white ring-2 ring-white">
                          {unreadCountForMineTab}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'others'}
                    title="自分以外の案件一覧"
                    className={`flex justify-center items-center py-4 font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0193be] ${
                        viewMode === 'others'
                            ? 'border-slate-200 border-x border-t rounded-t-lg bg-white text-[#0193be] -mb-[1px]'
                            : 'border-transparent text-slate-500 hover:text-[#0193be]'
                    }`}
                    onClick={() => handleViewModeChange('others')}
                  >
                    <UsersGroupIcon className="h-6 w-auto" />
                  </button>
              </div>
            )}
          </nav>
          
          <div className={contentContainerClasses}>
            <div className="p-4">
                {viewMode === 'others' && (
                  <MemberListTabs
                    members={otherMembers}
                    users={users}
                    selectedMember={selectedMember}
                    onSelectMember={handleSelectMember}
                    onListTabClick={handleListTabClick}
                    currentUser={currentUser}
                    onSelectOwnTab={() => handleViewModeChange('mine')}
                  />
                )}

                <div className="mb-6">
                  {viewMode === 'precheck' || (viewMode === 'others' && selectedMember === PRECHECKER_ASSIGNEE_NAME) ? (
                      null
                  ) : viewMode === 'mine' ? (
                      <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-4 ml-4">
                              <div className="relative" ref={statusDropdownRef}>
                                  <button
                                      onClick={() => setIsStatusDropdownOpen(prev => !prev)}
                                      className={`relative w-24 h-24 rounded-full flex items-center justify-center focus:outline-none ring-4 ring-offset-4 ring-offset-white transition-colors duration-300 ${
                                          {
                                              '受付可': 'ring-[#0193be]',
                                              '受付不可': 'ring-yellow-500',
                                              '当日受付不可': 'ring-red-500',
                                              '非稼働': 'ring-slate-500',
                                          }[currentUserWithData?.availabilityStatus || '受付可']
                                      }`}
                                      aria-haspopup="true"
                                      aria-expanded={isStatusDropdownOpen}
                                      title="稼働ステータスを変更"
                                  >
                                      {currentUserWithData?.profilePicture ? (
                                          <img src={currentUserWithData.profilePicture} alt={currentUser.name} className="w-full h-full rounded-full object-cover" />
                                      ) : (
                                          <div className="w-full h-full rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                            <UserIcon className="w-16 h-16 text-[#0193be]/80" />
                                          </div>
                                      )}
                                  </button>
                                  {isStatusDropdownOpen && (
                                      <div className="absolute top-full mt-2 left-0 w-48 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-30 animate-wipe-in-down">
                                          <div className="py-1" role="menu" aria-orientation="vertical">
                                              {AVAILABILITY_STATUS_OPTIONS.map(status => {
                                                  const statusStyles = AVAILABILITY_STATUS_STYLES[status];
                                                  return (
                                                      <button
                                                          key={status}
                                                          onClick={() => {
                                                              handleUpdateUserStatus(currentUser.name, status);
                                                              setIsStatusDropdownOpen(false);
                                                          }}
                                                          className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                                                          role="menuitem"
                                                      >
                                                          <span className={`h-3 w-3 rounded-full ${statusStyles.bg}`}></span>
                                                          <span>{status}</span>
                                                      </button>
                                                  );
                                              })}
                                          </div>
                                      </div>
                                  )}
                              </div>
                              <div className="flex items-center">
                                {currentUserWithData?.comment ? (
                                    <>
                                        <div className="mr-4">
                                            <div className="mb-1">
                                                <div className="relative inline-block">
                                                    <button
                                                        onClick={() => setIsCommentModalOpen(true)}
                                                        className="group bg-[#0193be] px-4 py-2 rounded-lg shadow-sm flex items-baseline gap-2 hover:bg-[#017a9a] transition-colors"
                                                        title="コメントを編集"
                                                    >
                                                        <p className="text-base font-bold text-white">
                                                            {currentUserWithData.comment}
                                                        </p>
                                                        {currentUserWithData.commentUpdatedAt && (
                                                          <span className="text-xs text-white/80 whitespace-nowrap">
                                                            {formatRelativeTime(currentUserWithData.commentUpdatedAt)}
                                                          </span>
                                                        )}
                                                        <PencilIcon className="w-4 h-4 text-white/70 group-hover:text-white transition-colors flex-shrink-0 self-center" />
                                                    </button>
                                                    <div className="absolute top-full left-8 w-0 h-0 border-r-[16px] border-r-transparent border-t-[8px] border-t-[#0193be]"></div>
                                                </div>
                                            </div>
                                            <h2 className="text-4xl font-bold text-[#0193be]">{currentUser.name}</h2>
                                        </div>
                                    </>
                                ) : (
                                    <div className="relative">
                                         <button
                                            onClick={() => setIsCommentModalOpen(true)}
                                            className="absolute bottom-full left-0 mb-1 text-[#0193be] hover:text-[#017a9a] transition-colors"
                                            title="コメントを設定"
                                            aria-label="コメントを設定"
                                        >
                                            <SpeechBubbleIcon className="w-8 h-8" />
                                        </button>
                                        <h2 className="text-4xl font-bold text-[#0193be]">{currentUser.name}</h2>
                                    </div>
                                )}
                              </div>
                          </div>
                      </div>
                  ) : viewMode === 'others' && selectedMember !== '全体' && (() => {
                          const selectedUserDetails = users.find(u => u.name === selectedMember);
                          if (!selectedUserDetails) return null;
                          
                          const status = selectedUserDetails.availabilityStatus;
                          const ringColorClass = {
                              '受付可': 'ring-[#0193be]',
                              '受付不可': 'ring-yellow-500',
                              '当日受付不可': 'ring-red-500',
                              '非稼働': 'ring-slate-500',
                          }[status];

                          return (
                              <div className="flex items-center justify-between gap-4">
                                  <div className="flex items-center gap-4 ml-4">
                                      <div className={`relative w-24 h-24 rounded-full ring-4 ring-offset-4 ring-offset-white transition-colors duration-300 ${ringColorClass}`}>
                                          {selectedUserDetails.profilePicture ? (
                                              <img src={selectedUserDetails.profilePicture} alt={selectedMember} className="w-full h-full rounded-full object-cover" />
                                          ) : (
                                              <div className="w-full h-full rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                                  <UserIcon className="w-16 h-16 text-[#0193be]/80" />
                                              </div>
                                          )}
                                      </div>
                                      <div>
                                          {selectedUserDetails.comment && (
                                              <div className="mb-3">
                                                  <div className="relative inline-block bg-[#0193be] px-4 py-2 rounded-lg shadow-sm">
                                                      <div className="flex items-baseline gap-3">
                                                          <p className="text-base font-bold text-white">
                                                              {selectedUserDetails.comment}
                                                          </p>
                                                          {selectedUserDetails.commentUpdatedAt && (
                                                              <span className="text-xs text-white/80 whitespace-nowrap">
                                                                  {formatRelativeTime(selectedUserDetails.commentUpdatedAt)}
                                                              </span>
                                                          )}
                                                      </div>
                                                      <div className="absolute top-full left-8 w-0 h-0 border-r-[16px] border-r-transparent border-t-[8px] border-t-[#0193be]"></div>
                                                  </div>
                                              </div>
                                          )}
                                          <div className="flex items-baseline gap-2">
                                            <h2 className="text-4xl font-bold text-[#0193be]">
                                                {selectedMember}
                                            </h2>
                                            <button
                                                onClick={() => handleShowUserSchedule(selectedMember)}
                                                className="text-[#0193be]/60 hover:text-[#0193be] p-1 rounded-full hover:bg-slate-200/60 transition"
                                                title={`${selectedMember}さんのスケジュールを表示`}
                                            >
                                                <CalendarIcon className="w-6 h-6" />
                                            </button>
                                          </div>
                                          {(selectedUserDetails.availableProducts && selectedUserDetails.availableProducts.length > 0) && (
                                            <p className="mt-2 text-lg font-bold text-[#0193be]/80">
                                              対応可能商材：{selectedUserDetails.availableProducts.join('・')}
                                            </p>
                                          )}
                                      </div>
                                  </div>
                              </div>
                          );
                      })()}
                </div>
                
                {(viewMode !== 'others' || selectedMember !== '全体') && (
                  <div className="mb-4 bg-white rounded-lg shadow-sm border border-slate-200">
                    <button
                      onClick={() => {
                        setIsFormVisible(prev => {
                          if (prev) { // If form was visible, it's now closing.
                            setFormResetCounter(c => c + 1);
                          }
                          return !prev;
                        });
                      }}
                      className={`w-full flex items-center justify-between p-4 font-semibold text-left focus:outline-none focus:ring-2 focus:ring-offset-0 ${isPrecheckTheme ? 'focus:ring-[#118f82]' : 'focus:ring-[#0193be]'} transition-colors duration-200 ${
                        isFormVisible
                          ? `${isPrecheckTheme ? 'bg-[#118f82]' : 'bg-[#0193be]'} text-white rounded-t-lg`
                          : `${isPrecheckTheme ? 'text-[#118f82]' : 'text-[#0193be]'} rounded-lg hover:bg-slate-50`
                      }`}
                      aria-expanded={isFormVisible}
                      aria-controls="new-request-form"
                    >
                      <div className="flex items-center gap-3">
                        <PlusIcon className="w-5 h-5" />
                        <span>{isFormVisible ? 'フォームを閉じる' : '新規作成'}</span>
                      </div>
                      {isFormVisible ? <ChevronUpIcon className="w-6 h-6" /> : <ChevronDownIcon className="w-6 h-6" />}
                    </button>
                    <div
                      id="new-request-form"
                      className={`grid transition-all duration-500 ease-in-out ${isFormVisible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                    >
                      <div className="overflow-hidden">
                        <div className="p-4 border-t border-slate-200">
                          <CallRequestForm
                            onAddCall={handleAddCall}
                            defaultAssignee={defaultAssigneeForForm()}
                            currentUser={currentUser.name}
                            users={usersForForm}
                            formResetCounter={formResetCounter}
                            enableProductFiltering={false}
                            isPrecheckMode={isPrecheckContext}
                            isPrecheckTheme={isPrecheckTheme}
                            prefilledDate={prefilledRequestDate}
                            onPrefillConsumed={handlePrefillConsumed}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {viewMode === 'others' && selectedMember === '全体' && (
                  <>
                    <div className="mb-4 bg-white rounded-lg shadow-sm border border-slate-200">
                      <button
                        onClick={() => setIsShiftCalendarVisible(prev => !prev)}
                        className={`w-full flex items-center justify-between p-4 font-semibold text-left focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#0193be] transition-colors duration-200 ${
                          isShiftCalendarVisible
                            ? `bg-[#0193be] text-white rounded-t-lg`
                            : `text-[#0193be] rounded-lg hover:bg-slate-50`
                        }`}
                        aria-expanded={isShiftCalendarVisible}
                        aria-controls="shift-calendar-form"
                      >
                        <div className="flex items-center gap-3">
                          <CalendarIcon className="w-5 h-5" />
                          <span>シフト確認</span>
                        </div>
                        {isShiftCalendarVisible ? <ChevronUpIcon className="w-6 h-6" /> : <ChevronDownIcon className="w-6 h-6" />}
                      </button>
                      <div
                        id="shift-calendar-form"
                        className={`grid transition-all duration-500 ease-in-out ${isShiftCalendarVisible ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                      >
                        <div className="overflow-hidden">
                          <div className="p-4 border-t border-slate-200">
                            <ShiftCalendar 
                              users={users}
                              onSelectMemberWithDate={handleSelectMemberFromCalendar}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mb-4 bg-white rounded-lg shadow-sm border border-slate-200">
                      <button
                        onClick={() => {
                          setIsFormVisible(prev => {
                            if (prev) {
                              setFormResetCounter(c => c + 1);
                            }
                            return !prev;
                          });
                        }}
                        className={`w-full flex items-center justify-between p-4 font-semibold text-left focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#0193be] transition-colors duration-200 ${
                          isFormVisible
                            ? `bg-[#0193be] text-white rounded-t-lg`
                            : `text-[#0193be] rounded-lg hover:bg-slate-50`
                        }`}
                        aria-expanded={isFormVisible}
                      >
                        <div className="flex items-center gap-3">
                          <PlusIcon className="w-5 h-5" />
                          <span>{isFormVisible ? 'フォームを閉じる' : '新規作成'}</span>
                        </div>
                        {isFormVisible ? <ChevronUpIcon className="w-6 h-6" /> : <ChevronDownIcon className="w-6 h-6" />}
                      </button>
                       <div className={`grid transition-all duration-500 ease-in-out ${isFormVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                        <div className="overflow-hidden">
                          <div className="p-4 border-t border-slate-200">
                             <CallRequestForm
                              onAddCall={handleAddCall}
                              currentUser={currentUser.name}
                              users={users}
                              formResetCounter={formResetCounter}
                              onAssigneeChange={(assignee) => {
                                if (assignee !== previewMember) {
                                  setShouldAnimate(true);
                                  setPreviewMember(assignee || null);
                                }
                              }}
                              enableProductFiltering={true}
                              isPrecheckTheme={isPrecheckTheme}
                              prefilledDate={prefilledRequestDate}
                              onPrefillConsumed={handlePrefillConsumed}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}


                {viewMode === 'others' && selectedMember === '全体' ? (
                  <div
                    key={previewMember || 'placeholder'}
                    className={shouldAnimate ? 'animate-wipe-in-down' : ''}
                  >
                    {previewMember ? (
                      (() => {
                        const selectedUserDetails = users.find(u => u.name === previewMember);
                        if (!selectedUserDetails) return null;
                        const status = selectedUserDetails.availabilityStatus;
                        const ringColorClass = {
                            '受付可': 'ring-[#0193be]',
                            '受付不可': 'ring-yellow-500',
                            '当日受付不可': 'ring-red-500',
                            '非稼働': 'ring-slate-500',
                        }[status];
                        return (
                          <>
                            <div className="mb-4">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4 ml-4">
                                  <div className={`relative w-24 h-24 rounded-full ring-4 ring-offset-4 ring-offset-white transition-colors duration-300 ${ringColorClass}`}>
                                      {selectedUserDetails.profilePicture ? (
                                        <img src={selectedUserDetails.profilePicture} alt={previewMember} className="w-full h-full rounded-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                          <UserIcon className="w-16 h-16 text-[#0193be]/80" />
                                        </div>
                                      )}
                                  </div>
                                  <div>
                                    {selectedUserDetails.comment && (
                                        <div className="mb-3">
                                            <div className="relative inline-block bg-[#0193be] px-4 py-2 rounded-lg shadow-sm">
                                                <div className="flex items-baseline gap-3">
                                                    <p className="text-base font-bold text-white">
                                                        {selectedUserDetails.comment}
                                                    </p>
                                                    {selectedUserDetails.commentUpdatedAt && (
                                                        <span className="text-xs text-white/80 whitespace-nowrap">
                                                            {formatRelativeTime(selectedUserDetails.commentUpdatedAt)}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="absolute top-full left-8 w-0 h-0 border-r-[16px] border-r-transparent border-t-[8px] border-t-[#0193be]"></div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex items-baseline gap-2">
                                      <h2 className="text-4xl font-bold text-[#0193be]">
                                        {previewMember}
                                      </h2>
                                       <button
                                          onClick={() => handleShowUserSchedule(previewMember)}
                                          className="text-[#0193be]/60 hover:text-[#0193be] p-1 rounded-full hover:bg-slate-200/60 transition"
                                          title={`${previewMember}さんのスケジュールを表示`}
                                      >
                                          <CalendarIcon className="w-6 h-6" />
                                      </button>
                                    </div>
                                    {(selectedUserDetails.availableProducts && selectedUserDetails.availableProducts.length > 0) && (
                                      <p className="mt-2 text-lg font-bold text-[#0193be]/80">
                                        対応可能商材：{selectedUserDetails.availableProducts.join('・')}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <CallList 
                              calls={sortedCalls.filter(c => c.assignee === previewMember)}
                              selectedMember={previewMember}
                              onUpdateCall={handleUpdateCall}
                              onSelectCall={handleSelectCall}
                              highlightedCallId={highlightedCallId}
                              members={assigneesForEditing}
                              users={users}
                              currentUser={currentUser}
                              duplicateCustomerIds={duplicateCustomerIds}
                            />
                          </>
                        );
                      })()
                    ) : (
                      <div className="text-center py-20 px-6">
                        <h2 className={`text-8xl font-bold font-inconsolata select-none transition-colors duration-500 ${isFormVisible || isShiftCalendarVisible ? 'text-[#0193be]' : 'text-slate-300'}`}>Mykonos</h2>
                      </div>
                    )}
                  </div>
                ) : (
                  <CallList 
                    calls={filteredCalls}
                    selectedMember={viewMode === 'mine' ? currentUser.name : (viewMode === 'precheck' ? PRECHECKER_ASSIGNEE_NAME : selectedMember)}
                    onUpdateCall={handleUpdateCall}
                    onSelectCall={handleSelectCall}
                    highlightedCallId={highlightedCallId}
                    members={assigneesForEditing}
                    users={users}
                    isPrecheckTheme={isPrecheckTheme}
                    currentUser={currentUser}
                    duplicateCustomerIds={duplicateCustomerIds}
                  />
                )}
            </div>
          </div>
        </div>
      </main>

      <footer className={`px-4 sm:px-6 lg:px-8 py-3 text-center text-sm transition-colors duration-300 border-t border-b ${footerClasses}`}>
        <p className="font-inconsolata">&copy; {new Date().getFullYear()} Mykonos. All rights reserved.</p>
      </footer>
      
      <CallDetailModal 
        calls={selectedCall ? [selectedCall] : searchResults}
        duplicateCalls={pendingDuplicate?.existingCalls}
        onClose={() => {
            setSelectedCall(null);
            setSearchResults(null);
            handleCancelDuplicateCreation();
        }}
        onJump={handleJumpToCall}
        showJumpButton={!!searchResults}
        isConfirmingDuplicate={!!pendingDuplicate}
        onConfirmDuplicate={handleConfirmDuplicateCreation}
        isPrecheckTheme={isPrecheckTheme}
      />

      <ConfirmationModal
        isOpen={!!pendingNonWorkingDayConfirmation}
        onClose={() => setPendingNonWorkingDayConfirmation(null)}
        onConfirm={handleConfirmNonWorkingDayCreation}
        title="非稼働日の確認"
      >
        {pendingNonWorkingDayConfirmation && (
          <div>
            <p>
              <strong className="text-slate-800">{pendingNonWorkingDayConfirmation.assignee}</strong>さんは、依頼希望日である
              <strong className="text-slate-800 mx-1">{new Date(pendingNonWorkingDayConfirmation.dateTime).toLocaleDateString('ja-JP')}</strong>
              を非稼働日として設定しています。
            </p>
            <p className="mt-2">このまま依頼を作成しますか？</p>
          </div>
        )}
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={!!pendingUnavailableTodayConfirmation}
        onClose={() => setPendingUnavailableTodayConfirmation(null)}
        onConfirm={handleConfirmUnavailableTodayCreation}
        title="当日受付不可の確認"
      >
        {pendingUnavailableTodayConfirmation && (
          <div>
            <p>
              <strong className="text-slate-800">{pendingUnavailableTodayConfirmation.assignee}</strong>さんは現在
              <strong className="text-slate-800 mx-1">「当日受付不可」</strong>
              に設定されています。
            </p>
            <p className="mt-2">このまま本日付で依頼を作成しますか？</p>
          </div>
        )}
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={!!pendingUnavailableConfirmation}
        onClose={() => setPendingUnavailableConfirmation(null)}
        onConfirm={handleConfirmUnavailableCreation}
        title="受付不可の確認"
      >
        {pendingUnavailableConfirmation && (
          <div>
            <p>
              <strong className="text-slate-800">{pendingUnavailableConfirmation.assignee}</strong>さんは現在
              <strong className="text-slate-800 mx-1">「受付不可」</strong>
              に設定されています。
            </p>
            <p className="mt-2">このまま本日付で緊急の依頼を作成しますか？</p>
          </div>
        )}
      </ConfirmationModal>

      {currentUser.isLoggedInAsAdmin && (
        <AdminMenu
            isOpen={isAdminMenuOpen}
            onClose={() => setIsAdminMenuOpen(false)}
            users={users}
            currentUser={currentUser}
            onSave={handleAdminSave}
            onResetUserPassword={handleResetUserPassword}
            announcement={announcement}
            onSetAnnouncement={handleSetAnnouncement}
            appVersion={appVersion}
            onSetAppVersion={handleSetAppVersion}
            onCreateTasks={handleCreateBulkTasks}
            alerts={alerts}
            onJumpToMember={handleJumpToMember}
        />
      )}

      {currentUserWithData && (
        <ScheduleModal
          isOpen={isScheduleModalOpen}
          onClose={() => setIsScheduleModalOpen(false)}
          user={currentUserWithData}
          onSave={handleUpdateNonWorkingDays}
        />
      )}

      {currentUserWithData && (
        <PasswordSettingsModal
            isOpen={isPasswordModalOpen}
            onClose={() => setIsPasswordModalOpen(false)}
            onSave={handleUpdatePassword}
            currentUserPassword={currentUserWithData.password}
        />
      )}

      {currentUserWithData && (
        <CommentModal
          isOpen={isCommentModalOpen}
          onClose={() => setIsCommentModalOpen(false)}
          onSave={handleSaveComment}
          initialComment={currentUserWithData.comment || ''}
        />
      )}
      
      {scheduleViewingUser && (
        <ScheduleModal
            isOpen={true}
            onClose={() => setScheduleViewingUser(null)}
            user={scheduleViewingUser}
            readOnly={true}
        />
      )}
    </div>
  );
};

export default App;