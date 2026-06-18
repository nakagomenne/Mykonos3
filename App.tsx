import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CallRequest, User, CallStatus, AvailabilityStatus, EditHistory, EditChange, CallRequestUpdatableFields, FeedbackReport, CommentReply } from './types';
import CallList from './components/CallList';
import MemberListTabs from './components/MemberListTabs';
import { PlusIcon, UserIcon, UsersGroupIcon, ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, ShieldCheckIcon, StarIcon, ArrowRightStartOnRectangleIcon, CalendarIcon, ChevronRightIcon, ChevronLeftIcon, CheckIcon, CircleIcon, BellIcon, PencilIcon, SpeechBubbleIcon, KeyIcon, XMarkIcon, PhotoIcon, FlagIcon, ClockIcon } from './components/icons';
import { DEFAULT_USERS, SUPER_ADMIN_NAMES, AVAILABILITY_STATUS_OPTIONS, AVAILABILITY_STATUS_STYLES, ADMIN_USER_NAME, PRECHECKER_ASSIGNEE_NAME, DEFAULT_INITIAL_PASSWORD, NAKAGOMI_INITIAL_PASSWORD, RANK_OPTIONS } from './constants';
import CallRequestForm from './components/CallRequestForm';
import CallDetailModal from './components/CallDetailModal';
import Login from './components/Login';
import AdminMenu from './components/AdminMenu';
import FeedbackModal from './components/FeedbackModal';
import ScheduleModal from './components/ScheduleModal';
import ConfirmationModal from './components/ConfirmationModal';
import ShiftCalendar from './components/ShiftCalendar';
import CommentModal from './components/CommentModal';
import PasswordSettingsModal from './components/PasswordSettingsModal';
import WorkHoursModal from './components/WorkHoursModal';
import { processProfileImage } from './utils/imageUtils';
import NotificationSettingsModal, {
  NotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
  NotifyTiming,
} from './components/NotificationSettingsModal';
import {
  fetchCallRequests,
  fetchCallHistory,
  createCallRequest,
  updateCallRequest as apiUpdateCallRequest,
  deleteExpiredCompletedCalls,
  purgeOldDeletedRecords,
  purgeOldFeedbackReports,
  purgeOldCommentReplies,
  createBulkCallRequests,
  fetchUsers,
  fetchUserProfilePictures,
  updateUser,
  upsertUsers,
  deleteUser as apiDeleteUser,
  insertUser as apiInsertUser,
  updateUserAvailabilityStatus,
  updateUserAvailabilityStatusWithRevert,
  updateUserPassword as apiUpdateUserPassword,
  updateUserNonWorkingDays,
  updateUserComment,
  updateUserProfilePicture,
  saveProfilePicture,
  fetchAppSettings,
  updateAppSetting,
  subscribeToAll,
  submitFeedbackReport,
  fetchFeedbackReports,
  deleteFeedbackReport as apiDeleteFeedbackReport,
  markFeedbackRead as apiMarkFeedbackRead,
  fetchCommentReplies,
  addCommentReply,
  deleteRepliesByUserName,
  searchDeletedCallRequests,
} from './services/apiService';

interface SearchResultItem {
  type: 'customer' | 'user';
  value: string;
  call?: CallRequest;
  user?: User;
  isDeleted?: boolean;
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
  const [recentlyUpdatedCallId, setRecentlyUpdatedCallId] = useState<string | null>(null);
  const [recentlyAddedCallId, setRecentlyAddedCallId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<CallRequest[] | null>(null);
  const [isSearchDeleted, setIsSearchDeleted] = useState(false);
  const [searchResultsList, setSearchResultsList] = useState<SearchResultItem[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [formResetCounter, setFormResetCounter] = useState(0);
  const [viewMode, setViewMode] = useState<'mine' | 'others' | 'precheck'>('mine');
  const [displayViewMode, setDisplayViewMode] = useState<'mine' | 'others' | 'precheck'>('mine');
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const [announcementExpiresAt, setAnnouncementExpiresAt] = useState<string>('');
  const [announcementPriority, setAnnouncementPriority] = useState<string>('medium');
  const [appVersion, setAppVersion] = useState<string>('ver 3.0.0');
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [scheduleOpenedFromAdmin, setScheduleOpenedFromAdmin] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCommentPopupOpen, setIsCommentPopupOpen] = useState(false);
  const commentButtonRef = useRef<HTMLButtonElement>(null);
  const commentPopupRef = useRef<HTMLDivElement>(null);
  // リプライ入力状態管理（key: コメントオーナー名, value: 入力テキスト）
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  // リプライ入力欄を開いているユーザー名（null = 閉じている）
  const [expandedReplyUser, setExpandedReplyUser] = useState<string | null>(null);
  // 最後にメンバータイムラインを開いた時刻（既読管理）
  const [lastReadCommentAt, setLastReadCommentAt] = useState<number>(() => {
    const stored = localStorage.getItem('lastReadCommentAt');
    return stored ? parseInt(stored, 10) : 0;
  });
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    existingCalls: CallRequest[];
    newCallData: Omit<CallRequest, 'id' | 'status' | 'createdAt'>;
  } | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [isWorkHoursModalOpen, setIsWorkHoursModalOpen] = useState(false);
  const [scheduleViewingUser, setScheduleViewingUser] = useState<User | null>(null);
  const [isScheduleViewReadOnly, setIsScheduleViewReadOnly] = useState(false);
  const [pendingNonWorkingDayConfirmation, setPendingNonWorkingDayConfirmation] = useState<Omit<CallRequest, 'id' | 'status' | 'createdAt'> | null>(null);
  const [pendingUnavailableTodayConfirmation, setPendingUnavailableTodayConfirmation] = useState<Omit<CallRequest, 'id' | 'status' | 'createdAt'> | null>(null);
  const [pendingUnavailableConfirmation, setPendingUnavailableConfirmation] = useState<Omit<CallRequest, 'id' | 'status' | 'createdAt'> | null>(null);
  const [previewMember, setPreviewMember] = useState<string | null>(null);
  const [profilePopupUser, setProfilePopupUser] = useState<User | null>(null);
  const [prefilledRequestDate, setPrefilledRequestDate] = useState<string | null>(null);
  const [prefilledAssignee, setPrefilledAssignee] = useState<string | null>(null);
  const [prefilledRequester, setPrefilledRequester] = useState<string | null>(null);
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
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() => {
    const saved = localStorage.getItem('mykonosNotificationSettings');
    try {
      return saved ? { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(saved) } : DEFAULT_NOTIFICATION_SETTINGS;
    } catch {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }
  });
  const [isNotificationSettingsModalOpen, setIsNotificationSettingsModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackReports, setFeedbackReports] = useState<FeedbackReport[]>([]);
  const [commentReplies, setCommentReplies] = useState<CommentReply[]>([]);
  const [isLogoWaving, setIsLogoWaving] = useState(false);
  const [isLogoFlying, setIsLogoFlying] = useState(false);
  const logoClickCountRef = useRef(0);
  const logoClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [normalDuplicateIds,   setNormalDuplicateIds]   = useState<Set<string>>(new Set());
  const [precheckDuplicateIds, setPrecheckDuplicateIds] = useState<Set<string>>(new Set());
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('mykonosDarkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // ダークモード: html要素への class 付与
  useEffect(() => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    localStorage.setItem('mykonosDarkMode', JSON.stringify(isDarkMode));
  }, [isDarkMode]);


  const userMenuRef = useRef<HTMLDivElement>(null);
  const announcementMarqueeRef = useRef<HTMLDivElement>(null);
  const announcementTrackRef = useRef<HTMLDivElement>(null);
  const [marqueeRepeat, setMarqueeRepeat] = useState(4);
  const searchRef = useRef<HTMLDivElement>(null);
  const iconFileInputRef = useRef<HTMLInputElement>(null);
  // Realtime コールバック内で最新のstateを参照するためのref
  const notificationSettingsRef = useRef<NotificationSettings>(notificationSettings);
  const currentUserRef = useRef<User | null>(currentUser);
  const usersRef = useRef<User[]>(users);
  const statusCheckedRef = useRef(false); // 起動時の稼働ステータス自動補正を1回だけ実行するフラグ
  useEffect(() => { notificationSettingsRef.current = notificationSettings; }, [notificationSettings]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { usersRef.current = users; }, [users]);

  /** "HH:MM" → "H時MM分" 形式（MM=00 の場合は "H時"）*/
  const formatWorkTime = (hhmm?: string): string => {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':');
    return m === '00' ? `${parseInt(h)}時` : `${parseInt(h)}時${m}分`;
  };

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

        // 期限切れ案件の削除はバックグラウンドで実行（ローディングをブロックしない）
        deleteExpiredCompletedCalls().catch(cleanupErr => {
          console.warn('期限切れ案件の削除をスキップしました:', cleanupErr);
        });
        // 古い論理削除済みレコードとフィードバックの物理削除（90日以上削除済み・既読済み）
        purgeOldDeletedRecords().catch(() => {});
        purgeOldFeedbackReports().catch(() => {});
        purgeOldCommentReplies().catch(() => {});

        // 表示に必要なデータのみ並列取得
        const [fetchedUsers, fetchedCalls, settings] = await Promise.all([
          fetchUsers(),
          fetchCallRequests(),
          fetchAppSettings(),
        ]);

        if (!isMounted) return;

        setUsers(fetchedUsers);
        setCalls(fetchedCalls);
        if (settings.announcement              !== undefined) setAnnouncement(settings.announcement);
        if (settings.app_version               !== undefined) setAppVersion(settings.app_version);
        if (settings.announcement_expires_at   !== undefined) setAnnouncementExpiresAt(settings.announcement_expires_at);
        if (settings.announcement_priority     !== undefined) setAnnouncementPriority(settings.announcement_priority || 'medium');

      } catch (err: any) {
        if (!isMounted) return;
        console.error('初期データの取得に失敗しました:', err);
        setLoadError(err?.message ?? '初期データの取得に失敗しました。');
      } finally {
        if (isMounted) setIsLoading(false);
      }

      // ローディング完了後にバックグラウンドで遅延取得
      // ① プロフィール画像（Base64 / 大きいので後回し）
      fetchUserProfilePictures().then(picMap => {
        if (!isMounted) return;
        setUsers(prev => prev.map(u => ({ ...u, profilePicture: picMap[u.name] ?? u.profilePicture ?? null })));
      }).catch(() => {});
      // ② フィードバック（SA以外には不要）
      fetchFeedbackReports().then(r => { if (isMounted) setFeedbackReports(r); }).catch(() => {});
      // ③ コメントリプライ
      fetchCommentReplies().then(r => { if (isMounted) setCommentReplies(r); }).catch(() => {});
    };

    loadInitialData();

    // ──────────────────────────────────────────────
    // ──────────────────────────────────────────────
    // Realtime 購読（全テーブルを1本のチャンネルで購読）
    // ──────────────────────────────────────────────
    const unsubAll = subscribeToAll({
      // ── call_requests ──
      onCallsChange: setCalls,
      onCallInsert: (newCall) => {
        const settings = notificationSettingsRef.current;
        const user = currentUserRef.current;

        // 回線前確案件の即時通知
        if (
          settings.precheckInstantNotify &&
          user?.isLinePrechecker &&
          Notification.permission === 'granted' &&
          newCall.assignee === PRECHECKER_ASSIGNEE_NAME
        ) {
          new Notification('🔔 回線前確 新規案件', {
            body: `顧客ID: ${newCall.customerId}\n依頼者: ${newCall.requester}`,
            tag: `precheck_insert_${newCall.id}`,
            icon: '/favicon.ico',
          });
        }

        // 他メンバーが自分宛に追加した案件を点滅
        if (user && newCall.assignee === user.name && newCall.requester !== user.name) {
          setRecentlyAddedCallId(newCall.id);
          setTimeout(() => setRecentlyAddedCallId(null), 6000);
        }
      },

      // ── users ──
      onUsersChange: setUsers,

      // ── app_settings ──
      onSettingsChange: (settings) => {
        if (settings.announcement              !== undefined) setAnnouncement(settings.announcement);
        if (settings.app_version               !== undefined) setAppVersion(settings.app_version);
        if (settings.announcement_expires_at   !== undefined) setAnnouncementExpiresAt(settings.announcement_expires_at);
        if (settings.announcement_priority     !== undefined) setAnnouncementPriority(settings.announcement_priority || 'medium');
      },

      // ── feedback_reports ──
      onFeedbackChange: setFeedbackReports,

      // ── comment_replies ──
      onRepliesChange: (r) => { if (isMounted) setCommentReplies(r); },
    });

    // ──────────────────────────────────────────────
    // フォールバックポーリング（60秒）
    // Realtimeが切断・未接続の場合でもデータを同期する保険
    // ──────────────────────────────────────────────
    const pollInterval = setInterval(async () => {
      if (!isMounted) return;
      try {
        const [latestCalls, latestUsers] = await Promise.all([
          fetchCallRequests(),
          fetchUsers(),
        ]);
        if (!isMounted) return;
        setCalls(latestCalls);
        setUsers(prev => {
          // profile_picture は遅延ロード済みの値を保持する
          const picMap = new Map(prev.map(u => [u.name, u.profilePicture ?? null]));
          return latestUsers.map(u => ({ ...u, profilePicture: picMap.get(u.name) ?? null }));
        });
      } catch {
        // ポーリング失敗は無視（Realtimeが生きていれば問題なし）
      }
    }, 60000); // 60秒ごと

    return () => {
      isMounted = false;
      unsubAll();
      clearInterval(pollInterval);
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
    localStorage.setItem('mykonosNotificationSettings', JSON.stringify(notificationSettings));
    // callNotifyEnabled / precheckInstantNotify のいずれかが ON なら notificationsEnabled も ON に同期
    const anyEnabled = notificationSettings.callNotifyEnabled || notificationSettings.precheckInstantNotify;
    if (anyEnabled && !notificationsEnabled) setNotificationsEnabled(true);
    if (!anyEnabled && notificationsEnabled) setNotificationsEnabled(false);
  }, [notificationSettings]);

  useEffect(() => {
    // 重複チェック：同一 assignee 内で同一顧客IDが複数ある場合のみ重複とする
    // ・回線前確案件と通常案件は別グループ
    // ・全体タスクのように異なる assignee に同じ顧客IDを振っても重複扱いしない
    // ・assignee ごとに (assignee + customerId) の組み合わせをカウント
    const normalAssigneeIds   = new Map<string, Set<string>>(); // customerId → assignee Set
    const precheckAssigneeIds = new Map<string, Set<string>>();

    calls.forEach(call => {
      if (call.status === '完了') return;
      const trimmedId = call.customerId.trim().toLowerCase();
      if (!trimmedId) return;
      if (call.assignee === PRECHECKER_ASSIGNEE_NAME) {
        if (!precheckAssigneeIds.has(trimmedId)) precheckAssigneeIds.set(trimmedId, new Set());
        precheckAssigneeIds.get(trimmedId)!.add(call.assignee + ':' + call.id); // 同一案件重複防止
      } else {
        if (!normalAssigneeIds.has(trimmedId)) normalAssigneeIds.set(trimmedId, new Set());
        // 同一 assignee 内での重複チェック用に assignee を key として件数管理
        const key = call.assignee + '::' + trimmedId;
        normalAssigneeIds.get(trimmedId)!.add(key);
      }
    });

    // 通常案件：同一 assignee で同一 customerId が2件以上ある場合を重複とする
    const normalCountPerAssignee = new Map<string, number>(); // "assignee::customerId" → count
    calls.forEach(call => {
      if (call.status === '完了') return;
      if (call.assignee === PRECHECKER_ASSIGNEE_NAME) return;
      const trimmedId = call.customerId.trim().toLowerCase();
      if (!trimmedId) return;
      const key = call.assignee + '::' + trimmedId;
      normalCountPerAssignee.set(key, (normalCountPerAssignee.get(key) || 0) + 1);
    });

    // 回線前確：同一 customerId が2件以上（前確は全員共通の担当者なので従来通り）
    const precheckCounts = new Map<string, number>();
    calls.forEach(call => {
      if (call.status === '完了') return;
      if (call.assignee !== PRECHECKER_ASSIGNEE_NAME) return;
      const trimmedId = call.customerId.trim().toLowerCase();
      if (!trimmedId) return;
      precheckCounts.set(trimmedId, (precheckCounts.get(trimmedId) || 0) + 1);
    });

    const normalDups   = new Set<string>();
    const precheckDups = new Set<string>();

    for (const [key, count] of normalCountPerAssignee.entries()) {
      if (count > 1) {
        // key = "assignee::customerId" → customerId だけ取り出す
        const customerId = key.split('::').slice(1).join('::');
        normalDups.add(customerId);
      }
    }
    for (const [id, count] of precheckCounts.entries()) {
      if (count > 1) precheckDups.add(id);
    }
    setNormalDuplicateIds(normalDups);
    setPrecheckDuplicateIds(precheckDups);
  }, [calls]);

  useEffect(() => {
    const track = announcementTrackRef.current;
    if (!track) return;

    if (!announcement) {
      setMarqueeRepeat(4);
      return;
    }

    // 1フレーム待ってから span の実幅を計測
    const raf = requestAnimationFrame(() => {
      const span = track.querySelector<HTMLSpanElement>('[data-marquee-item]');
      const spanWidth = span ? span.getBoundingClientRect().width : announcement.length * 14 + 96;
      const viewportWidth = window.innerWidth;

      // スパンを「画面幅の3倍以上」並べる → シームレスに見える十分な量
      const count = Math.max(3, Math.ceil((viewportWidth * 3) / spanWidth));
      setMarqueeRepeat(count);

      // duration = spanWidth / 速度（px/s）→ 1個分のテキストが通過する時間
      // これをアニメの1周期にすることで速度が一定になる
      const PX_PER_SEC = 80; // ← この数値で速さを調整（大きいほど速い）
      const duration = Math.max(4, spanWidth / PX_PER_SEC);

      // --marquee-duration をCSS変数でセット（CSSアニメが参照する）
      track.style.setProperty('--marquee-duration', `${duration}s`);
      track.style.setProperty('--marquee-span-width', `${spanWidth}px`);
    });

    return () => cancelAnimationFrame(raf);
  }, [announcement, currentUser?.name, announcementPriority]);

  // ── 周知事項の期限到来チェック ──────────────────────────────────
  // announcementExpiresAt が設定されていれば、期限到来時に自動リセット
  useEffect(() => {
    if (!announcementExpiresAt || !announcement) return;

    const expiresMs = new Date(announcementExpiresAt).getTime();
    if (isNaN(expiresMs)) return;

    const msUntilExpiry = expiresMs - Date.now();

    if (msUntilExpiry <= 0) {
      // 既に期限切れなら即リセット
      handleSetAnnouncement('');
      handleSetAnnouncementExpiresAt('');
      return;
    }

    const timer = setTimeout(async () => {
      await handleSetAnnouncement('');
      await handleSetAnnouncementExpiresAt('');
    }, msUntilExpiry);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcementExpiresAt, announcement]);

  // 期限切れ案件の削除は初回ロード時に apiService 側で実行済み
  // （削除後の最新データが setCalls でセットされるため、ここは不要）

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
      if (
        commentPopupRef.current && !commentPopupRef.current.contains(event.target as Node) &&
        commentButtonRef.current && !commentButtonRef.current.contains(event.target as Node)
      ) {
        setIsCommentPopupOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // ── 起動時・users更新時：非稼働日とステータスの整合性チェック ──
  // 起動時（初回ロード完了後）に稼働ステータスを自動補正する（1回のみ）
  // ・今日が非稼働日 かつ ステータスが非稼働でない → 非稼働に修正
  // ・今日が稼働日  かつ ステータスが非稼働       → 受付可に戻す（0時跨ぎ後の戻し漏れを補正）
  useEffect(() => {
    if (!currentUser || users.length === 0 || isLoading) return;
    if (statusCheckedRef.current) return; // 2回目以降はスキップ
    statusCheckedRef.current = true;

    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000);
    const todayStr = localDate.toISOString().split('T')[0];

    users.forEach(user => {
      const isNonWorkingDay = (user.nonWorkingDays || []).includes(todayStr);

      // 今日が非稼働日なのにステータスが非稼働でない → 非稼働に修正
      if (isNonWorkingDay && user.availabilityStatus !== '非稼働') {
        if (user.name === currentUser.name || currentUser.isAdmin) {
          handleUpdateUserStatus(user.name, '非稼働');
        }
      }

      // 今日が稼働日なのにステータスが非稼働 → 受付可に戻す
      // （前日が非稼働で0時跨ぎ後に戻し損ねたケースを補正）
      if (!isNonWorkingDay && user.availabilityStatus === '非稼働') {
        if (user.name === currentUser.name || currentUser.isAdmin) {
          handleUpdateUserStatus(user.name, '受付可');
        }
      }
      // 当日受付不可：statusRevertAt（翌日JST0:00）が過去なら日付をまたいだと判断し受付可に戻す
      if (!isNonWorkingDay && user.availabilityStatus === '当日受付不可') {
        const revertAt = user.statusRevertAt ? new Date(user.statusRevertAt).getTime() : null;
        if (revertAt !== null && revertAt <= Date.now()) {
          if (user.name === currentUser.name || currentUser.isAdmin) {
            handleUpdateUserStatus(user.name, '受付可');
          }
        }
      }
    });
  }, [currentUser, users, isLoading]);

  // ── 一時受付不可の90分後自動復帰 ──────────────────────────────
  useEffect(() => {
    // 一時受付不可のユーザーで statusRevertAt が設定されているものをチェック
    const timers: ReturnType<typeof setTimeout>[] = [];
    users.forEach(u => {
      if (u.availabilityStatus === '一時受付不可' && u.statusRevertAt) {
        const revertMs = new Date(u.statusRevertAt).getTime() - Date.now();
        if (revertMs > 0) {
          const timer = setTimeout(async () => {
            try {
              await updateUserAvailabilityStatusWithRevert(u.name, '受付可');
              setUsers(prev =>
                prev.map(p => p.name === u.name ? { ...p, availabilityStatus: '受付可', statusRevertAt: null } : p)
              );
            } catch (e) {
              console.error('自動復帰に失敗しました:', e);
            }
          }, revertMs);
          timers.push(timer);
        } else {
          // すでに時間を過ぎていたら即時復帰
          updateUserAvailabilityStatusWithRevert(u.name, '受付可').then(() => {
            setUsers(prev =>
              prev.map(p => p.name === u.name ? { ...p, availabilityStatus: '受付可', statusRevertAt: null } : p)
            );
          }).catch(e => console.error('自動復帰に失敗しました:', e));
        }
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [users.map(u => `${u.name}:${u.statusRevertAt}`).join(',')]);

  // ── 毎日0時（JST）に自動ログアウト ──────────────────────────
  useEffect(() => {
    if (!currentUser) return;

    const scheduleLogout = () => {
      const now = new Date();
      // JSTの翌日0時を計算
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const jstMidnight = new Date(
        Date.UTC(
          jstNow.getUTCFullYear(),
          jstNow.getUTCMonth(),
          jstNow.getUTCDate() + 1,
          0, 0, 0, 0
        ) - 9 * 60 * 60 * 1000 // JSTをUTCに戻す
      );
      const msUntilMidnight = jstMidnight.getTime() - now.getTime();

      return setTimeout(() => {
        localStorage.removeItem('mykonosUser');
        setCurrentUser(null);
      }, msUntilMidnight);
    };

    const timer = scheduleLogout();
    return () => clearTimeout(timer);
  }, [currentUser]);

  // ── 毎日0時（JST）に非稼働日チェックして自動ステータス更新 ──
  // 「自動ログアウト」より先にステータスをDBへ書き込む（ログアウト後はAPIを呼べないため1秒前に実行）
  useEffect(() => {
    if (!currentUser) return;

    const calcMsUntilMidnight = () => {
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const jstMidnight = new Date(
        Date.UTC(
          jstNow.getUTCFullYear(),
          jstNow.getUTCMonth(),
          jstNow.getUTCDate() + 1,
          0, 0, 0, 0
        ) - 9 * 60 * 60 * 1000
      );
      return jstMidnight.getTime() - now.getTime();
    };

    // 1秒前に実行（自動ログアウトが0秒なのでその前に確実に書き込む）
    const msUntilCheck = Math.max(0, calcMsUntilMidnight() - 1000);

    const timer = setTimeout(async () => {
      // 「翌日」の日付文字列を取得
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowLocal = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000);
      const tomorrowStr = tomorrowLocal.toISOString().split('T')[0];

      // usersRef で最新の users を参照（deps に users を入れるとタイマーが毎回リセットされるため）
      const user = usersRef.current.find(u => u.name === currentUser.name);
      if (!user) return;

      const isTomorrowNonWorking = (user.nonWorkingDays || []).includes(tomorrowStr);
      const isTodayNonWorking    = (() => {
        const now = new Date();
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        const todayStr = local.toISOString().split('T')[0];
        return (user.nonWorkingDays || []).includes(todayStr);
      })();

      if (isTomorrowNonWorking && user.availabilityStatus !== '非稼働') {
        // 翌日（0時を過ぎると「今日」になる）が非稼働日 → 非稼働に変更
        try {
          await updateUserAvailabilityStatusWithRevert(currentUser.name, '非稼働');
        } catch (e) {
          console.error('0時 非稼働自動更新に失敗:', e);
        }
      } else if (!isTomorrowNonWorking && isTodayNonWorking && user.availabilityStatus === '非稼働') {
        // 今日が非稼働日だったが翌日は稼働日 → 受付可に戻す
        try {
          await updateUserAvailabilityStatusWithRevert(currentUser.name, '受付可');
        } catch (e) {
          console.error('0時 受付可自動復帰に失敗:', e);
        }
      } else if (!isTomorrowNonWorking && user.availabilityStatus === '当日受付不可') {
        // 当日受付不可は当日限り → 翌日が稼働日なら受付可に戻す
        try {
          await updateUserAvailabilityStatusWithRevert(currentUser.name, '受付可');
        } catch (e) {
          console.error('0時 当日受付不可→受付可 自動復帰に失敗:', e);
        }
      }
    }, msUntilCheck);

    return () => clearTimeout(timer);
  }, [currentUser]); // usersRef経由で最新値を参照するためusersはdepsに不要

  // ── 退勤時刻での自動「当日受付不可」切り替えタイマー ──────────────
  useEffect(() => {
    if (!currentUser) return;

    const scheduleAutoUnavailable = () => {
      const user = usersRef.current.find(u => u.name === currentUser.name);
      if (!user || user.autoUnavailableOffset == null) return null;

      const workEnd = user.workEnd ?? '20:00';
      const [endH, endM] = workEnd.split(':').map(Number);
      const offsetMins = user.autoUnavailableOffset;

      // 切り替え時刻 = 退勤時刻 - オフセット分
      const triggerH = endH;
      const triggerM = endM - offsetMins;
      const triggerTotalMins = triggerH * 60 + triggerM;

      const now = new Date();
      const todayStr = (() => {
        const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        return local.toISOString().split('T')[0];
      })();

      // 今日が非稼働日なら設定しない
      if ((user.nonWorkingDays || []).includes(todayStr)) return null;
      // 既に当日受付不可 or 非稼働なら設定しない
      if (user.availabilityStatus === '当日受付不可' || user.availabilityStatus === '非稼働') return null;

      const nowMins = now.getHours() * 60 + now.getMinutes();
      const msUntilTrigger = (triggerTotalMins - nowMins) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();

      if (msUntilTrigger <= 0) return null; // 既に過ぎている

      return setTimeout(async () => {
        const latestUser = usersRef.current.find(u => u.name === currentUser.name);
        if (!latestUser) return;
        // 再チェック：非稼働日・既に受付不可でないか
        const todayStrCheck = (() => {
          const n = new Date();
          const local = new Date(n.getTime() - n.getTimezoneOffset() * 60000);
          return local.toISOString().split('T')[0];
        })();
        if ((latestUser.nonWorkingDays || []).includes(todayStrCheck)) return;
        if (latestUser.availabilityStatus === '当日受付不可' || latestUser.availabilityStatus === '非稼働') return;
        try {
          await updateUserAvailabilityStatusWithRevert(currentUser.name, '当日受付不可');
          setUsers(prev => prev.map(u => {
            if (u.name !== currentUser.name) return u;
            const nowInner = new Date();
            const jstNow = new Date(nowInner.getTime() + 9 * 60 * 60 * 1000);
            const jstMidnight = new Date(
              Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() + 1, 0, 0, 0, 0)
              - 9 * 60 * 60 * 1000
            );
            return { ...u, availabilityStatus: '当日受付不可', statusRevertAt: jstMidnight.toISOString() };
          }));
        } catch (e) {
          console.error('自動当日受付不可の設定に失敗:', e);
        }
      }, msUntilTrigger);
    };

    const timer = scheduleAutoUnavailable();
    return () => { if (timer) clearTimeout(timer); };
  // workEnd/autoUnavailableOffset/availabilityStatus が変わったら再スケジュール
  }, [currentUser, users.map(u => `${u.name}:${u.workEnd}:${u.autoUnavailableOffset}:${u.availabilityStatus}`).join(',')]);

  // ── 架電時間通知（タイミング別）──────────────────────────────
  useEffect(() => {
    if (!notificationSettings.callNotifyEnabled || !currentUser || Notification.permission !== 'granted') {
      return;
    }

    /** タイミング設定を「何秒前」に変換 */
    const timingToSeconds = (t: NotifyTiming): number => {
      switch (t) {
        case 'exact': return 0;
        case '5min':  return 5 * 60;
        case '10min': return 10 * 60;
        case '15min': return 15 * 60;
        case '30min': return 30 * 60;
      }
    };

    const timingToLabel = (t: NotifyTiming): string => {
      switch (t) {
        case 'exact': return 'ちょうど';
        case '5min':  return '5分前';
        case '10min': return '10分前';
        case '15min': return '15分前';
        case '30min': return '30分前';
      }
    };

    const checkCalls = () => {
      const now = new Date();
      const myCalls = calls.filter(
        call => call.assignee === currentUser.name && call.status === '追客中'
      );

      myCalls.forEach(call => {
        try {
          const [, timePart] = call.dateTime.split('T');
          if (!timePart || ['至急', 'このあとOK', '時設なし', '入電待ち', '待機中'].includes(timePart)) {
            return;
          }

          const callDateTime = new Date(call.dateTime);

          notificationSettings.callNotifyTimings.forEach(timing => {
            const offsetSec = timingToSeconds(timing);
            // 通知すべき時刻 = 架電時刻 - offset秒
            const notifyAt = callDateTime.getTime() - offsetSec * 1000;
            const diff = now.getTime() - notifyAt; // 正なら通知時刻を過ぎた

            // 通知ウィンドウ: 0〜30秒以内
            if (diff >= 0 && diff < 30000) {
              const sessionKey = `notified_${call.id}_${timing}`;
              if (!sessionStorage.getItem(sessionKey)) {
                const label = timingToLabel(timing);
                new Notification('架電時間のお知らせ', {
                  body: `顧客ID: ${call.customerId}  [${label}]\n予定時間: ${timePart}`,
                  tag: `${call.id}_${timing}`,
                  icon: '/favicon.ico',
                });
                sessionStorage.setItem(sessionKey, 'true');
              }
            }
          });
        } catch {
          // invalid date などを無視
        }
      });
    };

    // calls が更新されたタイミングで1回チェック（DBポーリング廃止・負荷削減）
    checkCalls();

    return () => {};
  }, [notificationSettings, calls, currentUser]);

  const [searchSuggestIndex, setSearchSuggestIndex] = useState(-1);

  useEffect(() => {
    setSearchSuggestIndex(-1);
    if (searchQuery.trim().length >= 1) {
      const trimmedQuery = searchQuery.trim().toLowerCase();
      
      const matchedCalls = calls.filter(call => call.customerId.toLowerCase().includes(trimmedQuery));
      const uniqueCustomerIds = [...new Set<string>(matchedCalls.map(call => call.customerId))];
      const customerResults: SearchResultItem[] = uniqueCustomerIds.map(customerId => {
        const relatedCalls = matchedCalls.filter(c => c.customerId === customerId);
        const activeCalls = relatedCalls.filter(c => c.status === '追客中');
        const completedCalls = relatedCalls.filter(c => c.status === '完了');
        // 追客中があれば代表、なければ完了を代表に
        const call = activeCalls[0] ?? relatedCalls[0];
        const allCompleted = activeCalls.length === 0 && completedCalls.length > 0;
        return { type: 'customer', value: customerId, call, _count: relatedCalls.length, _assignee: call?.assignee, _activeCount: activeCalls.length, _completedCount: completedCalls.length, _allCompleted: allCompleted } as SearchResultItem & { _count: number; _assignee: string; _activeCount: number; _completedCount: number; _allCompleted: boolean };
      });

      // カタカナ→ひらがな / ひらがな→カタカナ 変換ヘルパー
      const toHiragana = (str: string) => str.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
      const toKatakana = (str: string) => str.replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
      const queryHira = toHiragana(trimmedQuery);
      const queryKata = toKatakana(trimmedQuery);
      // スペース除去クエリ（「山田太郎」→「やまだたろう」のようなスペースなし入力に対応）
      const queryNoSpace = trimmedQuery.replace(/\s+/g, '');
      const queryHiraNoSpace = queryHira.replace(/\s+/g, '');
      const queryKataNoSpace = queryKata.replace(/\s+/g, '');

      const userResults: SearchResultItem[] = users
        .filter(user => {
          // 名前：通常の部分一致 + スペース除去での部分一致
          const nameNorm = user.name.toLowerCase();
          const nameNoSpace = nameNorm.replace(/\s+/g, '');
          const nameMatch = nameNorm.includes(trimmedQuery) || nameNoSpace.includes(queryNoSpace);
          // フリガナ：ひらがな・カタカナ両方でスペース除去も含めて一致
          const furiHira = toHiragana((user.furigana || '').replace(/\s+/g, ''));
          const furiKata = toKatakana((user.furigana || '').replace(/\s+/g, ''));
          const furiganaMatch = furiHira.includes(queryHiraNoSpace) || furiKata.includes(queryKataNoSpace);
          return nameMatch || furiganaMatch;
        })
        .map(user => {
          const userCallCount = calls.filter(c => c.assignee === user.name && c.status === '追客中').length;
          return { type: 'user', value: user.name, user, _count: userCallCount } as SearchResultItem & { _count: number };
        });

      // 既にアクティブ案件に含まれていない顧客IDの削除済み案件をサジェストに追加（非同期で後から追加）
      const activeCustomerIds = new Set(uniqueCustomerIds.map(id => id.toLowerCase()));
      searchDeletedCallRequests(trimmedQuery).then(deletedCalls => {
        const uniqueDeletedIds = [...new Set<string>(deletedCalls.map(c => c.customerId))]
          .filter(cid => !activeCustomerIds.has(cid.toLowerCase()));
        const deletedResults: SearchResultItem[] = uniqueDeletedIds.slice(0, 3).map(customerId => {
          const relatedDeleted = deletedCalls.filter(c => c.customerId === customerId);
          const call = relatedDeleted[0];
          return { type: 'customer', value: customerId, call, isDeleted: true, _count: relatedDeleted.length, _assignee: call?.assignee, _activeCount: 0, _completedCount: relatedDeleted.length, _allCompleted: true } as SearchResultItem & { _count: number; _assignee: string; _activeCount: number; _completedCount: number; _allCompleted: boolean };
        });
        if (deletedResults.length > 0) {
          setSearchResultsList(prev => {
            const combined = [...prev, ...deletedResults].slice(0, 12);
            return combined;
          });
        }
      }).catch(() => {/* 削除済み検索エラーは無視 */});

      setSearchResultsList([...customerResults, ...userResults].slice(0, 12));
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
    statusCheckedRef.current = false; // ログイン時に補正チェックをリセット
    setCurrentUser({ ...user, isLoggedInAsAdmin });
    setViewMode('mine');
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };
  
  const handleViewModeChange = (newMode: 'mine' | 'others' | 'precheck', memberToSelect?: string) => {
    // 同じモードへの切り替えでも、メンバー指定がある場合はタブ選択だけ行う
    if (newMode === viewMode) {
      if (newMode === 'others' && memberToSelect) {
        setSelectedMember(memberToSelect);
        setPreviewMember(null);
      }
      return;
    }

    const now = new Date().toISOString();

    // 離れるタブの既読タイムスタンプを更新
    if (viewMode === 'mine' && currentUser) {
      setLastViewedTimestamps(prev => ({
        ...prev,
        [currentUser.name]: now,
      }));
    } else if (viewMode === 'precheck') {
      setLastViewedTimestamps(prev => ({
        ...prev,
        [PRECHECKER_ASSIGNEE_NAME]: now,
      }));
    }

    // 入るタブの既読タイムスタンプを更新（NEW バッジをクリア）
    if (newMode === 'mine' && currentUser) {
      setLastViewedTimestamps(prev => ({
        ...prev,
        [currentUser.name]: now,
      }));
    } else if (newMode === 'precheck') {
      setLastViewedTimestamps(prev => ({
        ...prev,
        [PRECHECKER_ASSIGNEE_NAME]: now,
      }));
    }
  
    if (newMode === 'others') {
      setPreviewMember(null);
      setSelectedMember(memberToSelect || '新規依頼');
    }
    
    setIsFormVisible(false);
    setFormResetCounter(c => c + 1);

    // フェードアウト → モード切替 → フェードイン
    setIsTabTransitioning(true);
    setTimeout(() => {
      setViewMode(newMode);
      setDisplayViewMode(newMode);
      setIsTabTransitioning(false);
    }, 200);
  };

  const handleSelectMember = (member: string) => {
    setSelectedMember(member);
    setPreviewMember(null);
    setIsShiftCalendarVisible(false);
    setIsFormVisible(false);
  };
  
  const handleListTabClick = () => {
      setSelectedMember('新規依頼');
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
    setPrefilledAssignee(null);
    setPrefilledRequester(null);
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

      // 作成した案件が確実に表示されるビューに切り替えてから点滅
      if (newCall.assignee === currentUser?.name) {
        // 自分宛 → mine タブに切り替え
        if (viewMode !== 'mine') {
          setViewMode('mine');
          setDisplayViewMode('mine');
        }
      } else {
        // 他メンバー宛 → others タブ + 対象メンバーを選択
        if (viewMode !== 'others' || selectedMember !== newCall.assignee) {
          setViewMode('others');
          setDisplayViewMode('others');
          setSelectedMember(newCall.assignee);
          setPreviewMember(null);
        }
      }

      // ビュー切り替えを一フレーム待ってから点滅セット（確実にリストに表示された後）
      setTimeout(() => {
        setRecentlyAddedCallId(newCall.id);
        setTimeout(() => setRecentlyAddedCallId(null), 6000);
      }, 50);

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
      
      if (assigneeUser?.availabilityStatus === '一時受付不可' && requestDate === todayStr) {
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
    const currentCall = calls.find(c => c.id === id);
    if (!currentCall) return;
    try {
      const updated = await apiUpdateCallRequest(id, updatedData, currentUser.name, currentCall);

      // ローカル状態を即時更新（Realtime の前に反映）
      setCalls(prevCalls =>
        prevCalls.map(call => (call.id === id ? updated : call))
      );

      // 予定日時が変更された場合、または留守回数が増加した場合に6秒間点滅ハイライトを表示
      const absenceIncreased =
        'absenceCount' in updatedData &&
        typeof updatedData.absenceCount === 'number' &&
        (currentCall.absenceCount ?? 0) < updatedData.absenceCount;
      if ('dateTime' in updatedData || absenceIncreased) {
        setRecentlyUpdatedCallId(id);
        setTimeout(() => setRecentlyUpdatedCallId(null), 6000);
      }
    } catch (err: any) {
      console.error('案件の更新に失敗しました:', err);
      alert(`案件の更新に失敗しました: ${err?.message ?? err}`);
    }
  };

  // アイコン画像変更ハンドラ
  const handleIconFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    // ファイルサイズ上限チェック（GIFは大きくなりがちなため3MB）
    if (file.size > 3 * 1024 * 1024) {
      alert('ファイルサイズは3MB以下にしてください。\n※GIFの場合は0.5MB以下が必要です。');
      e.target.value = '';
      return;
    }
    try {
      // GIF はアニメーション維持のためそのまま base64 化、それ以外はリサイズ・JPEG圧縮
      const base64 = await processProfileImage(file);
      // Storage にアップロード（失敗時はBase64フォールバック）
      await saveProfilePicture(currentUser.name, base64);
      // ローカル state はBase64で即時反映（Storage URLは次回ロード時に反映）
      setUsers(prev => prev.map(u => u.name === currentUser.name ? { ...u, profilePicture: base64 } : u));
    } catch (err: any) {
      alert(`アイコンの更新に失敗しました: ${err?.message ?? err}`);
    }
    e.target.value = '';
  };

  // 完了案件を追客中に戻す（担当者変更も同時に可能）
  const handleReactivateCall = async (call: CallRequest, newAssignee?: string) => {    if (!currentUser) return;
    try {
      const updates: Partial<Omit<CallRequest, 'id'>> = { status: '追客中' };
      if (newAssignee && newAssignee !== call.assignee) updates.assignee = newAssignee;
      const updated = await apiUpdateCallRequest(call.id, updates, currentUser.name, call);
      setCalls(prev => prev.map(c => c.id === call.id ? updated : c));
    } catch (err: any) {
      alert(`更新に失敗しました: ${err?.message ?? err}`);
    }
  };
    const handleSelectCall = (call: CallRequest) => {
    setSelectedCall(call);
    setSearchResults(null);
    setIsSearchDeleted(false);
  };

  const handleSearch = async () => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    if (!trimmedQuery) return;

    const foundCalls = calls.filter(call => call.customerId.toLowerCase().includes(trimmedQuery));
    if (foundCalls.length > 0) {
        setSearchResults(foundCalls);
        setIsSearchDeleted(false);
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

    // アクティブ案件・ユーザーに見つからない場合、削除済み案件を検索
    try {
      const deletedCalls = await searchDeletedCallRequests(trimmedQuery);
      if (deletedCalls.length > 0) {
        setSearchResults(deletedCalls);
        setIsSearchDeleted(true);
        setSelectedCall(null);
        setSearchQuery('');
        setSearchResultsList([]);
        setIsSearchFocused(false);
        return;
      }
    } catch {/* 削除済み検索エラーは無視 */}

    alert('指定された顧客IDまたはメンバー名に一致する情報は見つかりませんでした。');
  };
  
  const handleSearchResultClick = async (item: SearchResultItem) => {
      setSearchQuery('');
      setSearchResultsList([]);
      setIsSearchFocused(false);

      if (item.type === 'customer' && item.call) {
          if (item.isDeleted) {
            // 削除済み案件：同じ顧客IDの削除済み案件を全件取得して表示
            try {
              const deletedCalls = await searchDeletedCallRequests(item.call.customerId);
              const matchingDeleted = deletedCalls.filter(c => c.customerId.toLowerCase() === item.call!.customerId.toLowerCase());
              setSearchResults(matchingDeleted.length > 0 ? matchingDeleted : [item.call]);
              setIsSearchDeleted(true);
            } catch {
              setSearchResults([item.call]);
              setIsSearchDeleted(true);
            }
            setSelectedCall(null);
          } else {
            const matchingCalls = calls.filter(c => c.customerId.toLowerCase() === item.call!.customerId.toLowerCase());
            setSearchResults(matchingCalls.length > 0 ? matchingCalls : [item.call]);
            setIsSearchDeleted(false);
            setSelectedCall(null);
          }
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

      // 既存ユーザーのname一覧（削除前のstateを参照）
      const existingNames = new Set(users.map(u => u.name));

      // 新規ユーザーと既存ユーザーを分離して個別処理
      for (const u of updatedUsers) {
        if (existingNames.has(u.name)) {
          const original = users.find(orig => orig.name === u.name);

          // プロフィール画像の変更を先に単独送信（Storage優先、フォールバックでBase64）
          if (original?.profilePicture !== u.profilePicture) {
            await saveProfilePicture(u.name, u.profilePicture ?? null);
          }

          // 画像以外の変更を比較して updateUser
          const withoutPic = (user: User) => { const { profilePicture: _p, ...rest } = user; return rest; };
          const hasOtherChange = !original || JSON.stringify(withoutPic(original)) !== JSON.stringify(withoutPic(u));
          if (hasOtherChange) {
            const { profilePicture: _pic, ...dataWithoutPic } = u;
            await updateUser(u.name, dataWithoutPic);
          }
        } else {
          // 新規ユーザー: 画像ありの場合は2段階で（insert→Storage保存）
          const { profilePicture, ...dataWithoutPic } = u;
          const inserted = await apiInsertUser({ ...dataWithoutPic, profilePicture: null } as User);
          if (profilePicture) {
            await saveProfilePicture(inserted.name, profilePicture);
          }
        }
      }

      // 最新の全ユーザーをfetchして確実に同期
      // fetchUsers() は profile_picture を取得しないため、既存のプロフィール画像を保持する
      const latestUsers = await fetchUsers();
      setUsers(prev => {
        const picMap = new Map(prev.map(u => [u.name, u.profilePicture ?? null]));
        return latestUsers.map(u => ({ ...u, profilePicture: picMap.get(u.name) ?? null }));
      });

      if (deletedUserNames.length > 0) {
        // 削除されたユーザーが担当の案件を「(削除済み)」に
        const updatePromises = calls
          .filter(call => deletedUserNames.includes(call.requester))
          .map(call =>
            apiUpdateCallRequest(call.id, { requester: `${call.requester} (削除済み)` }, currentUser?.name ?? 'system', call)
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
          setSelectedMember('新規依頼');
        }

        if (currentUser && deletedUserNames.includes(currentUser.name)) {
          handleLogout();
          return;
        }
      }

      const updatedSelf = latestUsers.find(u => u.name === currentUser?.name);
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

  const handleSetAnnouncementExpiresAt = async (expiresAt: string) => {
    try {
      await updateAppSetting('announcement_expires_at', expiresAt);
      setAnnouncementExpiresAt(expiresAt);
    } catch (err: any) {
      alert(`期限の更新に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleSetAnnouncementPriority = async (priority: string) => {
    try {
      await updateAppSetting('announcement_priority', priority);
      setAnnouncementPriority(priority);
    } catch (err: any) {
      alert(`重要度の更新に失敗しました: ${err?.message ?? err}`);
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
    // 既に同じステータスの場合はDB書き込みをスキップ（不要な書き込み連鎖を防止）
    const currentStatus = users.find(u => u.name === name)?.availabilityStatus;
    if (currentStatus === status) return;
    try {
      await updateUserAvailabilityStatusWithRevert(name, status);
      let revertAt: string | null = null;
      if (status === '一時受付不可') {
        revertAt = new Date(Date.now() + 90 * 60 * 1000).toISOString();
      } else if (status === '当日受付不可') {
        const now = new Date();
        const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const jstMidnight = new Date(
          Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() + 1, 0, 0, 0, 0)
          - 9 * 60 * 60 * 1000
        );
        revertAt = jstMidnight.toISOString();
      }
      setUsers(prevUsers =>
        prevUsers.map(u => (u.name === name ? { ...u, availabilityStatus: status, statusRevertAt: revertAt } : u))
      );
    } catch (err: any) {
      alert(`ステータスの更新に失敗しました: ${err?.message ?? err}`);
    }
  };
  
  const handleSaveWorkHours = async (
    workStart: string,
    workEnd: string,
    autoUnavailableOffset: number | null,
    targetName?: string
  ) => {
    const name = targetName ?? currentUser?.name;
    if (!name) return;
    try {
      await updateUser(name, { workStart, workEnd, autoUnavailableOffset });
      setUsers(prev =>
        prev.map(u => u.name === name ? { ...u, workStart, workEnd, autoUnavailableOffset } : u)
      );
    } catch (err: any) {
      alert(`稼働時間の更新に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleShowUserSchedule = (userName: string) => {
    const userToShow = users.find(u => u.name === userName);
    if (userToShow) {
      setIsScheduleViewReadOnly(true);
      setScheduleViewingUser(userToShow);
    }
  };

  /**
   * 他メンバーのスケジュールカレンダーで日付をタップ
   * → モーダルを閉じ・新規作成フォームを該当日付・担当者・依頼者プリセットで開く
   */
  const handleScheduleDateSelect = (dateStr: string) => {
    if (!scheduleViewingUser || !currentUser) return;
    setPrefilledRequestDate(dateStr);
    setPrefilledAssignee(scheduleViewingUser.name);
    setPrefilledRequester(currentUser.name);
    setScheduleViewingUser(null); // モーダルを閉じる
    setIsFormVisible(true);       // 新規作成フォームを開く
    // 対象メンバーのタブに切り替え
    if (viewMode !== 'others' || selectedMember !== scheduleViewingUser.name) {
      handleViewModeChange('others', scheduleViewingUser.name);
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

      if (targetUser) {
        const isTodayNonWorking = sortedDates.includes(todayStr);
        const wasTodayNonWorking = (targetUser.nonWorkingDays || []).includes(todayStr);

        if (isTodayNonWorking && targetUser.availabilityStatus !== '非稼働') {
          // 今日を非稼働日に追加 → 即時ステータスを非稼働に
          newStatus = '非稼働';
        } else if (!isTodayNonWorking && wasTodayNonWorking && targetUser.availabilityStatus === '非稼働') {
          // 今日の非稼働日指定を解除 → 受付可に戻す
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
      // コメントを保存（更新・削除）するたびに古いリプライを必ず削除する
      // （コメントが更新された場合、以前のコメントへのリプライは無効になるため）
      deleteRepliesByUserName(currentUser.name).catch(() => {});
      setCommentReplies(prev => prev.filter(r => r.userName !== currentUser.name));
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

  const handleSendReply = async (userName: string) => {
    if (!currentUser) return;
    const body = (replyInputs[userName] ?? '').trim();
    if (!body) return;
    try {
      const newReply = await addCommentReply({ userName, author: currentUser.name, body });
      setCommentReplies(prev => [...prev, newReply]);
      setReplyInputs(prev => ({ ...prev, [userName]: '' }));
    } catch (err: any) {
      alert(`リプライの送信に失敗しました: ${err?.message ?? err}`);
    }
  };

  const handleCreateBulkTasks = async (
    taskData: Omit<CallRequest, 'id' | 'status' | 'createdAt' | 'assignee'> & { customerId?: string; isBulkTask?: boolean },
    assignees: string[]
  ) => {
    if (!currentUser) return;
    try {
      const { isBulkTask: _omit, ...rest } = taskData as any;
      const callsData = assignees.map(assignee => ({
        ...rest,
        customerId: taskData.customerId?.trim() ?? '',
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

  /** ブラウザ通知権限をリクエストする（モーダルから呼ばれる） */
  const handleRequestNotificationPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      alert('このブラウザはデスクトップ通知をサポートしていません。');
      return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
      alert('通知がブロックされています。ブラウザの設定から通知を許可してください。');
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('Mykonos', { body: '通知が有効になりました。' });
      return true;
    }
    return false;
  };

  /** 通知設定が変わったとき呼ばれる */
  const handleNotificationSettingsChange = (next: NotificationSettings) => {
    setNotificationSettings(next);
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

  // 回線前確コンテキストかどうか（ソートに使用するため早期定義）
  const isPrecheckContextForSort = viewMode === 'precheck' || (viewMode === 'others' && selectedMember === PRECHECKER_ASSIGNEE_NAME);

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

    const timePriorityDiff = getTimePriority(timePartA) - getTimePriority(timePartB);
    if (timePriorityDiff !== 0) {
      return timePriorityDiff;
    }

    // 日時が同じ場合：回線前確は作成日時が古い順、それ以外はランク順
    if (isPrecheckContextForSort) {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB;
    }
    const rankIndexA = RANK_OPTIONS.indexOf(a.rank as any);
    const rankIndexB = RANK_OPTIONS.indexOf(b.rank as any);
    const rA = rankIndexA === -1 ? 999 : rankIndexA;
    const rB = rankIndexB === -1 ? 999 : rankIndexB;
    return rA - rB;
  });

  // JST今日の日付文字列 "YYYY-MM-DD"
  const todayJSTStr = (() => {
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    return jst.toISOString().split('T')[0];
  })();

  // 完了案件を翌日0時以降に非表示にするフィルタ
  // completedAt が今日より前（昨日以前）であれば一覧から除外
  const isHiddenCompletedCall = (call: CallRequest): boolean => {
    if (call.status !== '完了') return false;
    if (!call.completedAt) return false;
    const completedDate = call.completedAt.split('T')[0];
    return completedDate < todayJSTStr;
  };

  const filteredCalls = sortedCalls.filter(call => {
    // 翌日以降の完了案件は全タブで非表示
    if (isHiddenCompletedCall(call)) return false;

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
      // 「新規依頼」: previewMember プレビュー用（案件は非表示）
      if (selectedMember === '新規依頼') return false;
      return call.assignee === selectedMember;
    }
  });

  // mine / precheck タブで「未読（新着）」案件の ID セット
  // lastViewedTimestamps より後に作成された案件を強調表示する
  const newCallIds = useMemo((): Set<string> => {
    if (!currentUser) return new Set();
    if (viewMode === 'mine') {
      const lastViewed = lastViewedTimestamps[currentUser.name];
      if (!lastViewed) return new Set(calls.filter(c => c.assignee === currentUser.name).map(c => c.id));
      const lastViewedDate = new Date(lastViewed);
      return new Set(
        calls
          .filter(c => c.assignee === currentUser.name && c.createdAt && new Date(c.createdAt) > lastViewedDate)
          .map(c => c.id)
      );
    }
    if (viewMode === 'precheck') {
      const lastViewed = lastViewedTimestamps[PRECHECKER_ASSIGNEE_NAME];
      if (!lastViewed) return new Set(calls.filter(c => c.assignee === PRECHECKER_ASSIGNEE_NAME).map(c => c.id));
      const lastViewedDate = new Date(lastViewed);
      return new Set(
        calls
          .filter(c => c.assignee === PRECHECKER_ASSIGNEE_NAME && c.createdAt && new Date(c.createdAt) > lastViewedDate)
          .map(c => c.id)
      );
    }
    return new Set();
  }, [calls, currentUser, viewMode, lastViewedTimestamps]);

  const otherMemberNames = memberNames.filter(m => m !== currentUser?.name);
  const hasPrecheckers = users.some(u => u.isLinePrechecker);
  // タブ順: 新規依頼 → 全体 → 回線前確 → 各メンバー
  // 各メンバー部分: その日稼働（非稼働でない）が先、非稼働が後ろ
  // 同グループ内はcommentUpdatedAt が新しい順（未設定は末尾）
  const sortedOtherMemberNames = [...otherMemberNames].sort((a, b) => {
    const ua = users.find(u => u.name === a);
    const ub = users.find(u => u.name === b);
    const aIsWorking = ua?.availabilityStatus !== '非稼働' ? 0 : 1;
    const bIsWorking = ub?.availabilityStatus !== '非稼働' ? 0 : 1;
    if (aIsWorking !== bIsWorking) return aIsWorking - bIsWorking;
    // 同グループ内はコメント更新日が新しい順
    const aTime = ua?.commentUpdatedAt ? new Date(ua.commentUpdatedAt).getTime() : 0;
    const bTime = ub?.commentUpdatedAt ? new Date(ub.commentUpdatedAt).getTime() : 0;
    return bTime - aTime;
  });
  const otherMembers = ['新規依頼'];
  if (hasPrecheckers) {
    otherMembers.push(PRECHECKER_ASSIGNEE_NAME);
  }
  otherMembers.push(...sortedOtherMemberNames);

  
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
      return selectedMember === '新規依頼' ? undefined : selectedMember;
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

  // 選択中の案件と同じ顧客IDを持つ他の案件（重複表示用）
  const selectedCallDuplicates = useMemo(() => {
    if (!selectedCall) return [];
    const trimmed = selectedCall.customerId.trim().toLowerCase();
    // 完了案件は重複として表示しない
    return calls.filter(c =>
      c.id !== selectedCall.id &&
      c.customerId.trim().toLowerCase() === trimmed &&
      c.status !== '完了'
    );
  }, [selectedCall, calls]);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f2f4f7] dark:bg-[#0f1117]">
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
      <div className="flex items-center justify-center min-h-screen bg-[#f2f4f7] dark:bg-[#0f1117]">
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
    return <Login onLogin={handleLogin} users={users} appVersion={appVersion} />;
  }
  
  const currentUserWithData = users.find(u => u.name === currentUser.name);

  // ユーザーの対応可能商材ラベルを生成（回線前確権限があれば末尾に追加）
  const getProductsLabel = (user: User): string => {
    const products = [...(user.availableProducts ?? [])];
    if (user.isLinePrechecker) products.push('回線前確');
    return products.join('・');
  };

  // ヘッダー・フッターのテーマは displayViewMode ベース
  // （コンテンツのフェードと同期させるため）
  const isPrecheckModeActive = displayViewMode === 'precheck';
  const isMineModeActive = displayViewMode === 'mine';
  const isDarkHeader = isPrecheckModeActive || isMineModeActive;

  const isPrecheckContext = viewMode === 'precheck' || (viewMode === 'others' && selectedMember === PRECHECKER_ASSIGNEE_NAME);
  const isPrecheckTheme = viewMode === 'precheck';

  const headerBgClass = isPrecheckModeActive ? 'header-gradient-teal' : isMineModeActive ? 'header-gradient-blue' : (isDarkMode ? 'header-dark-fade border-b border-white/10' : 'header-white-fade border-b border-slate-200/80');
  const headerTextClass = isDarkHeader ? 'text-white' : (isDarkMode ? 'text-[#0193be]' : 'text-[#0193be]');
  
  const searchIconClass = isDarkHeader ? 'text-white/80 hover:text-white' : (isDarkMode ? 'text-[#0193be]/70 hover:text-[#0193be]' : 'text-[#0193be]/60 hover:text-[#0193be]');
  
  const adminButtonClass = isDarkHeader
    ? 'text-white/80 hover:bg-white/15 hover:text-white rounded-lg'
    : (isDarkMode ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200 rounded-lg' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-lg');

  const userMenuButtonClass = isDarkHeader
    ? 'text-white hover:bg-white/15 rounded-lg'
    : (isDarkMode ? 'text-[#0193be] hover:bg-slate-700 rounded-lg' : 'text-[#0193be] hover:bg-slate-100 rounded-lg');

  const userMenuAvatarBgClass = isDarkHeader ? 'bg-white/25' : (isDarkMode ? 'bg-slate-700' : 'bg-slate-100');

  const footerClasses = isPrecheckModeActive 
    ? 'header-gradient-teal text-white border-white/20' 
    : isMineModeActive 
    ? 'header-gradient-blue text-white border-white/20' 
    : (isDarkMode ? 'header-dark-fade text-[#0193be]/80 border-white/10' : 'header-white-fade text-[#0193be]/80 border-slate-200');
  
  const contentContainerClasses = currentUser.isLinePrechecker
    ? `transition-colors duration-500 ${isDarkMode ? 'bg-[#1a1f2e] border-white/8' : 'bg-white/95'} backdrop-blur-sm shadow-md border-x border-b ${isDarkMode ? 'border-white/8' : 'border-slate-200/80'} rounded-b-xl ${
        viewMode === 'mine' ? 'rounded-tr-xl' : (viewMode === 'others' ? 'rounded-tl-xl' : '')
      }`
    : `transition-colors duration-500 ${isDarkMode ? 'bg-[#1a1f2e]' : 'bg-white/95'} backdrop-blur-sm shadow-md border-x border-b ${isDarkMode ? 'border-white/8' : 'border-slate-200/80'} rounded-b-xl ${
        viewMode === 'mine' ? 'rounded-tr-xl' : 'rounded-tl-xl'
      }`;


  return (
    <div className={`min-h-screen font-sans page-bg ${isDarkMode ? 'page-bg-dark' : 'page-bg-light'}`}>
      <header className={`sticky top-0 z-20 relative overflow-visible ${isDarkHeader ? 'shadow-lg' : 'shadow-sm'}`}
        style={isDarkHeader ? { boxShadow: '0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.1)' } : undefined}
      >
        {/* ── ヘッダー背景レイヤー（opacity で切り替え） ── */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
          {/* white（others） */}
          <div className="absolute inset-0 header-white-fade transition-opacity duration-500" style={{ opacity: displayViewMode === 'others' && !isDarkMode ? 1 : 0 }} />
          {/* dark（others・ダークモード） */}
          <div className="absolute inset-0 header-dark-fade transition-opacity duration-500" style={{ opacity: displayViewMode === 'others' && isDarkMode ? 1 : 0 }} />
          {/* blue（mine） */}
          <div className="absolute inset-0 header-gradient-blue transition-opacity duration-500" style={{ opacity: displayViewMode === 'mine' ? 1 : 0 }} />
          {/* teal（precheck） */}
          <div className="absolute inset-0 header-gradient-teal transition-opacity duration-500" style={{ opacity: displayViewMode === 'precheck' ? 1 : 0 }} />
          {/* グロー装飾（dark header 時） */}
          <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: isDarkHeader ? 0.15 : 0, background: 'radial-gradient(ellipse at 50% -20%, rgba(255,255,255,0.5) 0%, transparent 60%)' }} />
        </div>
        <div className="relative px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
          <div className="flex-shrink-0 flex items-end gap-2">
            <h1
              className={`text-5xl font-bold font-inconsolata transition-colors duration-500 cursor-pointer select-none ${headerTextClass}`}
              onClick={() => {
                if (isLogoWaving || isLogoFlying) return;

                // 3連打カウント（0.6秒以内の連続クリック）
                logoClickCountRef.current += 1;
                if (logoClickTimerRef.current) clearTimeout(logoClickTimerRef.current);

                if (logoClickCountRef.current >= 3) {
                  // 3連打：フライアニメーション
                  logoClickCountRef.current = 0;
                  setIsLogoFlying(true);
                  // 全文字の最大delay(6*80ms) + duration(1200ms) + 余裕
                  setTimeout(() => setIsLogoFlying(false), 1200 + 6 * 80 + 80);
                } else {
                  // リセットタイマー（0.6秒以内に次クリックがなければカウントリセット）
                  logoClickTimerRef.current = setTimeout(() => {
                    logoClickCountRef.current = 0;
                    // 通常の波打ちアニメーション（1〜2回目のクリックで発火）
                    setIsLogoWaving(true);
                    setTimeout(() => setIsLogoWaving(false), 650 + 6 * 60 + 50);
                  }, 600);
                }
              }}
              title="Mykonos"
            >
              {'Mykonos'.split('').map((char, i) => {
                // フライ用：文字ごとにランダムな飛び先を固定シードで生成
                const flyAngles  = [210, 45, 310, 130, 260, 20, 170];
                const flyDists   = [180, 220, 160, 240, 190, 210, 170];
                const flyRots    = ['-180deg', '135deg', '-270deg', '200deg', '-150deg', '240deg', '-200deg'];
                const rad = (flyAngles[i] * Math.PI) / 180;
                const tx = Math.round(Math.cos(rad) * flyDists[i]);
                const ty = Math.round(Math.sin(rad) * flyDists[i]);

                if (isLogoFlying) {
                  return (
                    <span
                      key={i}
                      className="logo-char-fly"
                      style={{
                        '--fly-tx': `${tx}px`,
                        '--fly-ty': `${ty}px`,
                        '--fly-rot': flyRots[i],
                        animationDelay: `${i * 80}ms`,
                      } as React.CSSProperties}
                    >
                      {char}
                    </span>
                  );
                }
                return (
                  <span
                    key={i}
                    className={isLogoWaving ? 'logo-char-wave' : ''}
                    style={isLogoWaving ? { animationDelay: `${i * 60}ms` } : undefined}
                  >
                    {char}
                  </span>
                );
              })}
            </h1>
            <span className={`text-xs font-inconsolata transition-colors duration-500 ${isDarkHeader ? 'text-white/60' : 'text-[#0193be]/50'}`}>{appVersion}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-72" ref={searchRef}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (searchSuggestIndex >= 0 && searchResultsList[searchSuggestIndex]) {
                        handleSearchResultClick(searchResultsList[searchSuggestIndex]);
                      } else {
                        handleSearch();
                      }
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSearchSuggestIndex(prev => Math.min(prev + 1, searchResultsList.length - 1));
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSearchSuggestIndex(prev => Math.max(prev - 1, -1));
                    } else if (e.key === 'Escape') {
                      setIsSearchFocused(false);
                      setSearchSuggestIndex(-1);
                    }
                  }}
                  onFocus={() => setIsSearchFocused(true)}
                  placeholder="顧客ID or メンバー名で検索..."
                  className={`w-full pl-4 pr-10 py-2 border ${isDarkMode && !isDarkHeader ? 'border-slate-600 bg-[#0f1623] text-[#0193be] placeholder-slate-500' : 'border-slate-300 text-[#0193be]'} rounded-lg shadow-sm focus:ring-[#0193be] focus:border-[#0193be] transition`}
                />
                <button 
                  onClick={handleSearch} 
                  className={`absolute inset-y-0 right-0 flex items-center pr-3 transition-colors ${searchIconClass}`}
                  aria-label="Search"
                >
                  <MagnifyingGlassIcon className="w-5 h-5" />
                </button>
                {isSearchFocused && searchResultsList.length > 0 && (
                  <ul className={`absolute z-[200] mt-1 w-full ${isDarkMode ? 'bg-[#1a2035] border-slate-700' : 'bg-white border-slate-200'} rounded-xl shadow-xl border max-h-80 overflow-auto`}>
                    {searchResultsList.map((item, index) => {
                      const extItem = item as SearchResultItem & { _count?: number; _assignee?: string };
                      const isHighlighted = index === searchSuggestIndex;
                      const userData = item.type === 'user' ? (item as any).user as User : null;
                      return (
                        <li key={`${item.type}-${item.value}-${index}`}>
                          <button
                            onMouseEnter={() => setSearchSuggestIndex(index)}
                            onClick={() => handleSearchResultClick(item)}
                            className={`w-full text-left px-4 py-2.5 transition flex items-center gap-3 ${
                              isHighlighted ? 'bg-[#0193be]/10' : (isDarkMode ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50')
                            } ${index === 0 ? 'rounded-t-xl' : ''} ${index === searchResultsList.length - 1 ? 'rounded-b-xl' : `border-b ${isDarkMode ? 'border-slate-700' : 'border-slate-100'}`}`}
                          >
                            {item.type === 'customer' ? (() => {
                              const ext = item as SearchResultItem & { _count?: number; _assignee?: string; _activeCount?: number; _completedCount?: number; _allCompleted?: boolean };
                              return (
                                <>
                                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${item.isDeleted ? 'bg-slate-100' : 'bg-blue-50'}`}>
                                    <MagnifyingGlassIcon className={`w-4 h-4 ${item.isDeleted ? 'text-slate-400' : 'text-[#0193be]'}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className={`font-medium truncate ${item.isDeleted ? 'text-slate-400 line-through' : 'text-[#0193be]'}`}>{item.value}</div>
                                    <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                                      {ext._assignee && <span>担当: {ext._assignee}</span>}
                                      {!item.isDeleted && ext._activeCount !== undefined && ext._activeCount > 0 && (
                                        <span className="text-blue-500">追客中 {ext._activeCount}件</span>
                                      )}
                                      {!item.isDeleted && ext._completedCount !== undefined && ext._completedCount > 0 && (
                                        <span className="text-green-500">完了 {ext._completedCount}件</span>
                                      )}
                                      {item.isDeleted && ext._count !== undefined && ext._count > 0 && (
                                        <span className="text-slate-400">{ext._count}件</span>
                                      )}
                                    </div>
                                  </div>
                                  {item.isDeleted ? (
                                    <span className="flex-shrink-0 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">削除済み</span>
                                  ) : ext._allCompleted ? (
                                    <span className="flex-shrink-0 text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">完了済み</span>
                                  ) : (
                                    <span className="flex-shrink-0 text-xs bg-blue-50 text-[#0193be] px-2 py-0.5 rounded-full">顧客ID</span>
                                  )}
                                </>
                              );
                            })() : (
                              <>
                                <div className="flex-shrink-0 w-8 h-8 rounded-full overflow-hidden ring-2 ring-slate-200">
                                  {userData?.profilePicture ? (
                                    <img src={userData.profilePicture} alt={item.value} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                                      <UserIcon className="w-4 h-4 text-slate-400" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-[#0193be] truncate">{item.value}</div>
                                  <div className="text-xs text-slate-400">
                                    {userData && <span>{userData.availabilityStatus}</span>}
                                    {extItem._count !== undefined && <span className="ml-2">追客中 {extItem._count}件</span>}
                                  </div>
                                </div>
                                <span className="flex-shrink-0 text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">メンバー</span>
                              </>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
            </div>

            {/* メンバーコメントボタン */}
            {(() => {
              const commentedUsers = users
                .filter(u => u.comment && u.comment.trim() !== '')
                .sort((a, b) => {
                  const dateA = a.commentUpdatedAt ? new Date(a.commentUpdatedAt) : new Date(0);
                  const dateB = b.commentUpdatedAt ? new Date(b.commentUpdatedAt) : new Date(0);
                  return dateB.getTime() - dateA.getTime();
                });
              return (
                <div className="relative">
                  <button
                    ref={commentButtonRef}
                    onClick={() => {
                      const now = Date.now();
                      setLastReadCommentAt(now);
                      localStorage.setItem('lastReadCommentAt', String(now));
                      setIsCommentPopupOpen(prev => !prev);
                    }}
                    className={`relative p-2 rounded-full transition-colors duration-500 ${adminButtonClass}`}
                    title="メンバーコメント一覧"
                    aria-expanded={isCommentPopupOpen}
                  >
                    <SpeechBubbleIcon className="w-6 h-6" />
                    {/* 未読バッジ：前回既読後に更新されたコメント＋リプライの件数を表示 */}
                    {(() => {
                      const unreadComments = commentedUsers.filter(u =>
                        u.commentUpdatedAt && new Date(u.commentUpdatedAt).getTime() > lastReadCommentAt
                      ).length;
                      const unreadReplies = commentReplies.filter(r => {
                        if (new Date(r.createdAt).getTime() <= lastReadCommentAt) return false;
                        // 対象ユーザーのコメント更新日時より前のリプライは除外
                        const targetUser = commentedUsers.find(u => u.name === r.userName);
                        if (targetUser?.commentUpdatedAt && r.createdAt < targetUser.commentUpdatedAt) return false;
                        return true;
                      }).length;
                      const unreadCount = unreadComments + unreadReplies;
                      return unreadCount > 0 ? (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#0193be] px-1 text-xs font-semibold text-white ring-2 ring-white animate-badge-pop">
                          {unreadCount}
                        </span>
                      ) : null;
                    })()}
                  </button>
                  {isCommentPopupOpen && (() => {
                    const rect = commentButtonRef.current?.getBoundingClientRect();
                    const top = rect ? rect.bottom + 8 : 60;
                    return createPortal(
                      <div
                        ref={commentPopupRef}
                        className="fixed z-[200] rounded-xl shadow-xl w-80 max-h-[60vh] flex flex-col animate-fade-in-up"
                        style={{ top, right: 16, background: 'linear-gradient(135deg, #0193be 0%, #0277a8 60%, #015f88 100%)' }}
                      >
                        <div className="p-3 border-b border-white/20 flex justify-between items-center flex-shrink-0">
                          <h3 className="text-base font-bold text-white">メンバータイムライン</h3>
                          <button onClick={() => setIsCommentPopupOpen(false)} className="p-1 text-white/70 hover:text-white rounded-full transition-colors">
                            <XMarkIcon className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="overflow-y-auto p-2">
                          {commentedUsers.length > 0 ? (
                            <ul className="space-y-2">
                              {commentedUsers.map(u => {
                                const userReplies = commentReplies.filter(r => {
                                  if (r.userName !== u.name) return false;
                                  // コメントの更新日時より前に投稿されたリプライは非表示（古いコメントへのリプライを除外）
                                  if (u.commentUpdatedAt && r.createdAt < u.commentUpdatedAt) return false;
                                  return true;
                                });
                                const isReplyOpen = expandedReplyUser === u.name;
                                const replyText = replyInputs[u.name] ?? '';
                                return (
                                  <li key={u.name} className="rounded-lg overflow-hidden bg-white/10">
                                    {/* コメント本体 */}
                                    <button
                                      onClick={() => {
                                        if (u.name === currentUser.name) {
                                          handleViewModeChange('mine');
                                        } else {
                                          handleViewModeChange('others', u.name);
                                        }
                                        setIsCommentPopupOpen(false);
                                      }}
                                      className="w-full text-left p-2 hover:bg-white/10 transition-colors"
                                    >
                                      <div className="flex items-center gap-3 mb-1">
                                        <div className="relative w-8 h-8 flex-shrink-0">
                                          {u.profilePicture ? (
                                            <img src={u.profilePicture} alt={u.name} className="w-8 h-8 rounded-full object-cover"/>
                                          ) : (
                                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                              <UserIcon className="w-5 h-5 text-white/80"/>
                                            </div>
                                          )}
                                          <span className={`absolute top-0 right-0 block h-3 w-3 rounded-full ring-[3px] ring-[#0193be] ${AVAILABILITY_STATUS_STYLES[u.availabilityStatus]?.bg ?? 'bg-slate-400'}`} />
                                        </div>
                                        <div className="flex-1 flex justify-between items-center">
                                          <span className="font-semibold text-sm text-white">{u.name}</span>
                                          {u.commentUpdatedAt && (
                                            <span className="text-xs text-white/70 whitespace-nowrap ml-2">{formatRelativeTime(u.commentUpdatedAt)}</span>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-sm px-2 py-1.5 rounded bg-white/15 text-white/90">{u.comment}</p>
                                    </button>
                                    {/* リプライ一覧 */}
                                    {userReplies.length > 0 && (
                                      <div className="px-2 pb-1 space-y-1">
                                        {userReplies.map(reply => (
                                          <div key={reply.id} className="flex items-start gap-2 pl-3 border-l-2 border-white/30">
                                            <div className="flex-1">
                                              <div className="flex items-baseline gap-1.5">
                                                <span className="text-xs font-semibold text-white/90">{reply.author}</span>
                                                <span className="text-xs text-white/50">{formatRelativeTime(reply.createdAt)}</span>
                                              </div>
                                              <p className="text-xs text-white/80 break-all">{reply.body}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {/* リプライ入力エリア */}
                                    <div className="px-2 pb-2">
                                      {isReplyOpen ? (
                                        <div className="flex gap-1 mt-1">
                                          <input
                                            type="text"
                                            value={replyText}
                                            onChange={e => setReplyInputs(prev => ({ ...prev, [u.name]: e.target.value }))}
                                            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); handleSendReply(u.name); } }}
                                            maxLength={100}
                                            placeholder="返信を入力（100字以内）"
                                            className="flex-1 text-xs px-2 py-1 rounded bg-white/20 text-white placeholder-white/40 outline-none focus:ring-1 focus:ring-white/50"
                                            autoFocus
                                            onClick={e => e.stopPropagation()}
                                          />
                                          <button
                                            onClick={e => { e.stopPropagation(); handleSendReply(u.name); }}
                                            disabled={!replyText.trim()}
                                            className="text-xs px-2 py-1 rounded bg-white/25 text-white hover:bg-white/35 disabled:opacity-40 transition-colors"
                                          >送信</button>
                                          <button
                                            onClick={e => { e.stopPropagation(); setExpandedReplyUser(null); }}
                                            className="text-xs px-1.5 py-1 rounded text-white/60 hover:text-white transition-colors"
                                          ><XMarkIcon className="w-3.5 h-3.5"/></button>
                                        </div>
                                      ) : (
                                        <button
                                          onClick={e => { e.stopPropagation(); setExpandedReplyUser(u.name); }}
                                          className="mt-1 text-xs text-white/60 hover:text-white/90 transition-colors flex items-center gap-1"
                                        >
                                          <SpeechBubbleIcon className="w-3 h-3"/>返信
                                          {userReplies.length > 0 && <span className="ml-0.5">({userReplies.length})</span>}
                                        </button>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="p-4 text-sm text-white/70 text-center">コメントを設定しているメンバーはいません。</p>
                          )}
                        </div>
                      </div>,
                      document.body
                    );
                  })()}
                </div>
              );
            })()}

            {currentUser.isLoggedInAsAdmin && (
              <div className="relative">
                <button
                    onClick={() => setIsAdminMenuOpen(true)}
                    className={`p-2 rounded-full transition-colors duration-500 ${adminButtonClass}`}
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
                  className={`flex items-center gap-2 text-sm p-1 rounded-full transition-colors duration-500 ${userMenuButtonClass}`}
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
                            className={`absolute top-0 right-0 block h-3 w-3 rounded-full ${statusStyle.bg} ring-[3px] ${ringColorClass}`}
                            title={`稼働ステータス: ${status}`}
                          />
                        )
                    })()}
                  </div>
                  <span className="text-lg pr-2">{currentUser.name}</span>
              </button>
              {isUserMenuOpen && (
                  <div 
                    className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-white/10 focus:outline-none z-[200]"
                    role="menu" aria-orientation="vertical"
                  >
                      <div className="py-1" role="none">
                          <div className="px-4 pt-2 pb-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">稼働ステータス</div>
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
                                      className="flex items-center justify-between w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 transition-colors"
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
                      <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                      <div className="py-1" role="none">
                          <button
                            onClick={() => {
                              setIsScheduleModalOpen(true);
                              setIsUserMenuOpen(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 transition-colors"
                            role="menuitem"
                          >
                            <CalendarIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            <span>スケジュール設定</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsWorkHoursModalOpen(true);
                              setIsUserMenuOpen(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 transition-colors"
                            role="menuitem"
                          >
                            <ClockIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            <span>稼働時間設定</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsPasswordModalOpen(true);
                              setIsUserMenuOpen(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 transition-colors"
                            role="menuitem"
                          >
                            <KeyIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            <span>パスワード設定</span>
                          </button>
                          {/* アイコン変更 */}
                          <button
                            onClick={() => {
                              iconFileInputRef.current?.click();
                              setIsUserMenuOpen(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 transition-colors"
                            role="menuitem"
                          >
                            <PhotoIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            <span>アイコン変更</span>
                          </button>
                      </div>
                      <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                      <div className="py-1" role="none">
                        <button
                          onClick={() => {
                            setIsCommentModalOpen(true);
                            setIsUserMenuOpen(false);
                          }}
                          className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 transition-colors"
                          role="menuitem"
                        >
                          <PencilIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                          <span>コメント設定</span>
                        </button>
                        {/* バグ報告・要望 */}
                        <button
                          onClick={() => {
                            setIsFeedbackModalOpen(true);
                            setIsUserMenuOpen(false);
                          }}
                          className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 transition-colors"
                          role="menuitem"
                        >
                          <FlagIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                          <span>バグ報告 / 要望</span>
                        </button>
                      </div>
                      <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                      <div className="py-1" role="none">
                          {/* ダークモードトグル */}
                          <button
                              type="button"
                              onClick={() => setIsDarkMode(prev => !prev)}
                              className="flex items-center justify-between w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 transition-colors"
                              role="menuitem"
                          >
                              <div className="flex items-center gap-3">
                                  {isDarkMode ? (
                                      <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                                          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                                      </svg>
                                  ) : (
                                      <svg className="w-5 h-5 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                                          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                                      </svg>
                                  )}
                                  <span>{isDarkMode ? 'ライトモード' : 'ダークモード'}</span>
                              </div>
                              {/* トグルスイッチ */}
                              <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-500 ${isDarkMode ? 'bg-[#0193be]' : 'bg-slate-300'}`}>
                                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-500 ${isDarkMode ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                              </div>
                          </button>
                      </div>
                      <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                      <div className="py-1" role="none">
                          <button
                              type="button"
                              onClick={() => {
                                setIsNotificationSettingsModalOpen(true);
                                setIsUserMenuOpen(false);
                              }}
                              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 transition-colors"
                              role="menuitem"
                          >
                              <BellIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                              <span>通知設定</span>
                              {/* 有効中インジケーター */}
                              {(notificationSettings.callNotifyEnabled || notificationSettings.precheckInstantNotify) && (
                                <span className="ml-auto w-2 h-2 rounded-full bg-[#0193be] flex-shrink-0" />
                              )}
                          </button>
                      </div>
                      <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                      <div className="py-1" role="none">
                          <button
                              onClick={() => {
                                  handleLogout();
                                  setIsUserMenuOpen(false);
                              }}
                              className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 transition-colors"
                              role="menuitem"
                          >
                              <ArrowRightStartOnRectangleIcon className="w-5 h-5 text-slate-500 dark:text-slate-400" />
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
        {announcement && (() => {
          // 重要度別スタイル設定
          const priorityStyle = announcementPriority === 'high'
            ? {
                wrapperStyle: { background: '#111', border: '1px solid rgba(255,220,0,0.4)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' },
                spanClassName: 'font-semibold tracking-wider px-12 flex-shrink-0 announcement-blink',
                spanStyle: { color: '#ffe600' } as React.CSSProperties,
              }
            : announcementPriority === 'low'
            ? {
                wrapperStyle: { background: '#0193be', border: '1px solid rgba(1,147,190,0.5)', boxShadow: '0 2px 8px rgba(1,147,190,0.2)' },
                spanClassName: 'font-semibold tracking-wider text-white px-12 flex-shrink-0',
                spanStyle: {} as React.CSSProperties,
              }
            : {
                // medium（デフォルト）
                wrapperStyle: { background: 'linear-gradient(135deg, #fef9c3 0%, #fef3c7 50%, #fde68a 100%)', border: '1px solid rgba(251,191,36,0.4)', boxShadow: '0 2px 8px rgba(251,191,36,0.15)' },
                spanClassName: 'font-semibold tracking-wider text-amber-800 px-12 flex-shrink-0',
                spanStyle: {} as React.CSSProperties,
              };

          return (
            <div className="mb-4 overflow-hidden rounded-xl shadow-sm" style={priorityStyle.wrapperStyle}>
              <div className="py-2 overflow-hidden">
                {/*
                  シームレスマーキーの仕組み:
                  - span を marqueeRepeat 個横並びにする（画面幅の3倍以上）
                  - CSS animation で translateX(0) → translateX(-spanWidth) を
                    linear infinite で繰り返す
                  - 移動距離がちょうど span1個分なので、終端が先頭に重なり途切れない
                  - duration = spanWidth / PX_PER_SEC で文字数に関わらず一定速度
                */}
                <div
                  ref={announcementTrackRef}
                  className="flex whitespace-nowrap"
                  style={{ animation: 'marquee-item var(--marquee-duration, 8s) linear infinite' }}
                >
                  {Array.from({ length: marqueeRepeat }).map((_, i) => (
                    <span
                      key={i}
                      data-marquee-item="1"
                      className={priorityStyle.spanClassName}
                      style={priorityStyle.spanStyle}
                    >
                      {announcement}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
        <div>
          <nav className={`border-b-2 tab-nav ${isDarkMode ? 'border-white/10 tab-nav-dark' : 'border-slate-200/80 tab-nav-light'}`}>
            {currentUser.isLinePrechecker ? (
              <div className="grid grid-cols-3" role="tablist">
                  {/* 自分タブ */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'mine'}
                    title="自身の案件一覧"
                    onClick={() => handleViewModeChange('mine')}
                    className={`relative flex justify-center items-center py-3 font-medium transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0193be] rounded-tl-xl ${
                        viewMode === 'mine'
                            ? 'text-[#0193be]'
                            : `text-slate-400 hover:text-[#0193be] ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-white/60'}`
                    }`}
                  >
                    <div className="relative">
                      <UserIcon className={`w-6 h-6 transition-transform duration-500 ${viewMode === 'mine' ? 'scale-110' : ''}`} />
                      {unreadCountForMineTab > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white ring-2 ring-white animate-badge-pop">
                          {unreadCountForMineTab}
                        </span>
                      )}
                    </div>
                    {/* アンダーバー */}
                    <span className={`absolute bottom-[-2px] left-0 right-0 h-[4px] rounded-t-full transition-all duration-500 ${viewMode === 'mine' ? 'opacity-100' : 'opacity-0'}`}
                      style={{ background: 'linear-gradient(90deg, #0193be, #0277a8)' }} />
                  </button>

                  {/* 回線前確タブ */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'precheck'}
                    title="回線前確"
                    onClick={() => handleViewModeChange('precheck')}
                    className={`relative flex justify-center items-center py-3 font-medium transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#118f82] ${
                        viewMode === 'precheck'
                            ? 'text-[#118f82]'
                            : `text-slate-400 hover:text-[#118f82] ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-white/60'}`
                    }`}
                  >
                    <div className="relative">
                      <CircleIcon className={`w-6 h-6 transition-transform duration-500 ${viewMode === 'precheck' ? 'scale-110' : ''}`} />
                      {unreadCountForPrecheckTab > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white ring-2 ring-white animate-badge-pop">
                          {unreadCountForPrecheckTab}
                        </span>
                      )}
                    </div>
                    <span className={`absolute bottom-[-2px] left-0 right-0 h-[4px] rounded-t-full transition-all duration-500 ${viewMode === 'precheck' ? 'opacity-100' : 'opacity-0'}`}
                      style={{ background: 'linear-gradient(90deg, #118f82, #0d7a6f)' }} />
                  </button>

                  {/* 自分以外タブ */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'others'}
                    title="自分以外の案件一覧"
                    onClick={() => handleViewModeChange('others')}
                    className={`relative flex justify-center items-center py-3 font-medium transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0193be] rounded-tr-xl ${
                        viewMode === 'others'
                            ? 'text-[#0193be]'
                            : `text-slate-400 hover:text-[#0193be] ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-white/60'}`
                    }`}
                  >
                    <UsersGroupIcon className={`h-6 w-auto transition-transform duration-500 ${viewMode === 'others' ? 'scale-110' : ''}`} />
                    <span className={`absolute bottom-[-2px] left-0 right-0 h-[4px] rounded-t-full transition-all duration-500 ${viewMode === 'others' ? 'opacity-100' : 'opacity-0'}`}
                      style={{ background: 'linear-gradient(90deg, #0193be, #0277a8)' }} />
                  </button>
              </div>
            ) : (
              <div className="grid grid-cols-2" role="tablist">
                  {/* 自分タブ */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'mine'}
                    title="自身の案件一覧"
                    onClick={() => handleViewModeChange('mine')}
                    className={`relative flex justify-center items-center py-3 font-medium transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0193be] rounded-tl-xl ${
                        viewMode === 'mine'
                            ? 'text-[#0193be]'
                            : `text-slate-400 hover:text-[#0193be] ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-white/60'}`
                    }`}
                  >
                    <div className="relative">
                      <UserIcon className={`w-6 h-6 transition-transform duration-500 ${viewMode === 'mine' ? 'scale-110' : ''}`} />
                      {unreadCountForMineTab > 0 && (
                        <span className="absolute -top-1.5 -right-2.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white ring-2 ring-white">
                          {unreadCountForMineTab}
                        </span>
                      )}
                    </div>
                    <span className={`absolute bottom-[-2px] left-0 right-0 h-[4px] rounded-t-full transition-all duration-500 ${viewMode === 'mine' ? 'opacity-100' : 'opacity-0'}`}
                      style={{ background: 'linear-gradient(90deg, #0193be, #0277a8)' }} />
                  </button>

                  {/* 自分以外タブ */}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'others'}
                    title="自分以外の案件一覧"
                    onClick={() => handleViewModeChange('others')}
                    className={`relative flex justify-center items-center py-3 font-medium transition-all duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0193be] rounded-tr-xl ${
                        viewMode === 'others'
                            ? 'text-[#0193be]'
                            : `text-slate-400 hover:text-[#0193be] ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-white/60'}`
                    }`}
                  >
                    <UsersGroupIcon className={`h-6 w-auto transition-transform duration-500 ${viewMode === 'others' ? 'scale-110' : ''}`} />
                    <span className={`absolute bottom-[-2px] left-0 right-0 h-[4px] rounded-t-full transition-all duration-500 ${viewMode === 'others' ? 'opacity-100' : 'opacity-0'}`}
                      style={{ background: 'linear-gradient(90deg, #0193be, #0277a8)' }} />
                  </button>
              </div>
            )}
          </nav>
          
          <div className={contentContainerClasses}>
            {/* タブ切り替え時フェードトランジション */}
            <div
              className="transition-opacity duration-300 ease-in-out"
              style={{ opacity: isTabTransitioning ? 0 : 1 }}
            >
            <div className="p-4">
                {displayViewMode === 'others' && (
                  <MemberListTabs
                    members={otherMembers}
                    users={users}
                    selectedMember={selectedMember}
                    onSelectMember={handleSelectMember}
                    onListTabClick={handleListTabClick}
                    currentUser={currentUser}
                    onSelectOwnTab={() => handleViewModeChange('mine')}
                    isDarkMode={isDarkMode}
                  />
                )}

                <div className="my-4">
                  {displayViewMode === 'precheck' || (displayViewMode === 'others' && selectedMember === PRECHECKER_ASSIGNEE_NAME) ? (
                      null
                  ) : displayViewMode === 'mine' ? (() => {
                      const mineStatus = currentUserWithData?.availabilityStatus || '受付可';
                      const mineIsAvailable = mineStatus === '受付可';
                      const mineBgHex = { '一時受付不可': '#eab308', '当日受付不可': '#ef4444', '非稼働': '#64748b' }[mineStatus] ?? '#64748b';
                      const mineRingHex = {
                          '受付可': 'white',
                          '一時受付不可': '#eab308',
                          '当日受付不可': '#ef4444',
                          '非稼働': '#64748b',
                      }[mineStatus] ?? 'white';
                      const mineOuterHex = mineIsAvailable ? '#0193be' : 'white';
                      const mineRingBoxShadow = `0 0 0 4px ${mineRingHex}, 0 0 0 9px ${mineOuterHex}`;
                      const mineTextColor = mineIsAvailable ? 'text-[#0193be]' : 'text-white';
                      const mineCalendarHover = mineIsAvailable ? 'hover:bg-slate-200/60' : 'hover:bg-white/20';
                      const mineStatusBgColor = {
                          '受付可': 'bg-[#0193be]',
                          '一時受付不可': 'bg-yellow-500',
                          '当日受付不可': 'bg-red-500',
                          '非稼働': 'bg-slate-500',
                      }[mineStatus] ?? 'bg-[#0193be]';
                      const mineStatusBgHex = {
                          '受付可': '#0193be',
                          '一時受付不可': '#eab308',
                          '当日受付不可': '#ef4444',
                          '非稼働': '#64748b',
                      }[mineStatus] ?? '#0193be';

                      // --- mine: 保有数カウント ---
                      const mineMikomiBases = ['見込C','見込B','見込A','見込S','LL見込'] as const;
                      const mineMikomiRusuBases = ['見込C留守','見込B留守','見込A留守','見込S留守'] as const;
                      const mineToday8 = new Date(); mineToday8.setDate(mineToday8.getDate() + 4); mineToday8.setHours(0,0,0,0);
                      const mineActiveCalls = calls.filter(c => c.assignee === currentUser.name && c.status !== '完了');
                      const mineMikomiCount = mineActiveCalls.filter(c => (mineMikomiBases as readonly string[]).includes(c.rank)).length;
                      const mineMikomiRusuCount = mineActiveCalls.filter(c => (mineMikomiRusuBases as readonly string[]).includes(c.rank)).length;
                      const mineChokiCount = mineActiveCalls.filter(c => {
                          const isTarget = (mineMikomiBases as readonly string[]).includes(c.rank) || (mineMikomiRusuBases as readonly string[]).includes(c.rank);
                          if (!isTarget) return false;
                          if (!c.dateTime) return false;
                          const dt = new Date(c.dateTime); dt.setHours(0,0,0,0);
                          return dt >= mineToday8;
                      }).length;
                      const mineTotalBase = mineMikomiCount + mineMikomiRusuCount;
                      const mineChokiRatio = mineTotalBase > 0 ? mineChokiCount / mineTotalBase : 0;
                      const mineChokiAccent = mineChokiRatio > 0.25
                          ? { text: 'text-red-500', bg: mineIsAvailable ? (isDarkMode ? 'bg-red-500/15' : 'bg-red-50') : 'bg-white/15', border: 'border-red-400/50', num: 'text-red-500' }
                          : mineChokiRatio > 0.15
                          ? { text: 'text-yellow-500', bg: mineIsAvailable ? (isDarkMode ? 'bg-yellow-500/15' : 'bg-yellow-50') : 'bg-white/15', border: 'border-yellow-400/50', num: 'text-yellow-500' }
                          : null;
                      const mineRusuRatio = mineTotalBase > 0 ? mineMikomiRusuCount / mineTotalBase : 0;
                      const mineRusuAccent = mineRusuRatio > 0.45
                          ? { text: 'text-red-500', bg: mineIsAvailable ? (isDarkMode ? 'bg-red-500/15' : 'bg-red-50') : 'bg-white/15', border: 'border-red-400/50', num: 'text-red-500' }
                          : mineRusuRatio > 0.30
                          ? { text: 'text-yellow-500', bg: mineIsAvailable ? (isDarkMode ? 'bg-yellow-500/15' : 'bg-yellow-50') : 'bg-white/15', border: 'border-yellow-400/50', num: 'text-yellow-500' }
                          : null;

                      // 背景スタイル（受付可：白背景、それ以外：ステータスカラー）
                      const mineGradientStyle: React.CSSProperties = mineIsAvailable ? {} : { backgroundColor: mineBgHex };

                      // カウンターカード共通スタイル
                      const mineCounterCardBase = mineIsAvailable
                          ? isDarkMode
                              ? 'bg-white/5 border border-[#0193be]/25 hover:bg-white/10'
                              : 'bg-white/70 border border-[#0193be]/20 hover:bg-white/90'
                          : 'bg-white/15 border border-white/30 hover:bg-white/25';
                      const mineCounterLabel = mineIsAvailable ? (isDarkMode ? 'text-[#0193be]/70' : 'text-[#0193be]/70') : 'text-white/70';
                      const mineCounterNum = mineIsAvailable ? (isDarkMode ? 'text-[#0193be]' : 'text-[#0193be]') : 'text-white';
                      const mineDivider = mineIsAvailable ? (isDarkMode ? 'border-[#0193be]/20' : 'border-[#0193be]/15') : 'border-white/25';

                      return (
                      <div
                          className={`rounded-xl overflow-hidden transition-colors duration-500 ${mineIsAvailable ? (isDarkMode ? 'bg-[#1e2535] border border-[#0193be]/60' : 'bg-white border border-[#0193be]') : ''}`}
                          style={mineGradientStyle}
                      >
                          {/* 上部：プロフィール + 基本情報 */}
                          <div className="flex items-center gap-4 px-5 pt-3 pb-4">
                              <button
                                  onClick={() => currentUserWithData && setProfilePopupUser(currentUserWithData)}
                                  className="relative flex-shrink-0 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 hover:scale-105"
                                  style={{ boxShadow: mineRingBoxShadow }}
                                  title="プロフィールを表示"
                              >
                                  {currentUserWithData?.profilePicture ? (
                                      <img src={currentUserWithData.profilePicture} alt={currentUser.name} className="w-24 h-24 rounded-full object-cover" />
                                  ) : (
                                      <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center">
                                          <UserIcon className="w-12 h-12 text-[#0193be]/80" />
                                      </div>
                                  )}
                              </button>
                              <div className="flex-1 min-w-0">
                                  {currentUserWithData?.comment ? (
                                      <div className="mb-2">
                                          <div className="relative inline-block">
                                              <button
                                                  onClick={() => setIsCommentModalOpen(true)}
                                                  className={`group ${mineStatusBgColor} hover:opacity-90 px-3 py-1.5 rounded-lg shadow-sm flex items-baseline gap-2 transition-opacity`}
                                                  title="コメントを編集"
                                              >
                                                  <p className="text-sm font-bold text-white">
                                                      {currentUserWithData.comment}
                                                  </p>
                                                  {currentUserWithData.commentUpdatedAt && (
                                                      <span className="text-xs text-white/80 whitespace-nowrap">
                                                          {formatRelativeTime(currentUserWithData.commentUpdatedAt)}
                                                      </span>
                                                  )}
                                                  <PencilIcon className="w-3.5 h-3.5 text-white/70 group-hover:text-white transition-colors flex-shrink-0 self-center" />
                                              </button>
                                              <div className="absolute top-full left-6 w-0 h-0 border-r-[12px] border-r-transparent" style={{ borderTopWidth: '6px', borderTopColor: mineStatusBgHex }}></div>
                                          </div>
                                      </div>
                                  ) : (
                                      <button
                                          onClick={() => setIsCommentModalOpen(true)}
                                          className={`mb-2 ${mineTextColor} opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1`}
                                          title="コメントを設定"
                                          aria-label="コメントを設定"
                                      >
                                          <SpeechBubbleIcon className="w-5 h-5" />
                                          <span className="text-xs">コメントを設定</span>
                                      </button>
                                  )}
                                  <div className="flex items-center gap-2 flex-wrap">
                                      <h2 className={`text-4xl font-black tracking-tight transition-colors duration-500 ${mineTextColor}`}>{currentUser.name}</h2>
                                      <button
                                          onClick={() => handleShowUserSchedule(currentUser.name)}
                                          className={`${mineTextColor} opacity-60 hover:opacity-100 p-1 rounded-full ${mineCalendarHover} transition`}
                                          title={`${currentUser.name}さんのスケジュールを表示`}
                                      >
                                          <CalendarIcon className="w-5 h-5" />
                                      </button>
                                      {/* ステータスバッジ */}
                                      <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${mineStatusBgColor} text-white`}>
                                          {mineStatus}
                                      </span>
                                  </div>
                                  <div className={`mt-1 flex items-center gap-3 text-sm flex-wrap ${mineTextColor} opacity-75`}>
                                      {(currentUserWithData && ((currentUserWithData.availableProducts && currentUserWithData.availableProducts.length > 0) || currentUserWithData.isLinePrechecker)) && (
                                          <span className="font-semibold">{getProductsLabel(currentUserWithData)}</span>
                                      )}
                                      {(currentUserWithData?.workStart || currentUserWithData?.workEnd) && (
                                          <>
                                              {(currentUserWithData && ((currentUserWithData.availableProducts && currentUserWithData.availableProducts.length > 0) || currentUserWithData.isLinePrechecker)) && (
                                                  <span className="opacity-40">|</span>
                                              )}
                                              <span>{currentUserWithData?.workStart ?? '11:00'} - {currentUserWithData?.workEnd ?? '20:00'}</span>
                                          </>
                                      )}
                                  </div>
                              </div>
                          </div>
                          {/* 区切り線 */}
                          <div className={`mx-5 border-t ${mineDivider}`} />
                          {/* 下部：カウンターゾーン */}
                          <div className="grid grid-cols-3 gap-2 px-5 py-2">
                              {/* 見込 */}
                              <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 transition-colors ${mineCounterCardBase}`}>
                                  <span className={`text-xl font-black tabular-nums leading-none ${mineCounterNum}`}>{mineMikomiCount}</span>
                                  <span className={`text-xs font-bold tracking-wide ${mineCounterLabel}`}>見込</span>
                              </div>
                              {/* 見込留守（アラート連動） */}
                              <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 transition-colors ${mineRusuAccent ? `${mineRusuAccent.bg} ${mineRusuAccent.border} border` : mineCounterCardBase}`}>
                                  <span className={`text-xl font-black tabular-nums leading-none ${mineRusuAccent ? mineRusuAccent.num : mineCounterNum}`}>{mineMikomiRusuCount}</span>
                                  <span className={`text-xs font-bold tracking-wide ${mineRusuAccent ? mineRusuAccent.text : mineCounterLabel}`}>見込留守</span>
                              </div>
                              {/* 長期見込（アラート連動） */}
                              <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 transition-colors ${mineChokiAccent ? `${mineChokiAccent.bg} ${mineChokiAccent.border} border` : mineCounterCardBase}`}>
                                  <span className={`text-xl font-black tabular-nums leading-none ${mineChokiAccent ? mineChokiAccent.num : mineCounterNum}`}>{mineChokiCount}</span>
                                  <span className={`text-xs font-bold tracking-wide ${mineChokiAccent ? mineChokiAccent.text : mineCounterLabel}`}>長期見込</span>
                              </div>
                          </div>
                      </div>
                      );
                  })()
                  : displayViewMode === 'others' && selectedMember !== '新規依頼' && selectedMember !== '全体' && (() => {
                          const selectedUserDetails = users.find(u => u.name === selectedMember);
                          if (!selectedUserDetails) return null;
                          
                          const status = selectedUserDetails.availabilityStatus;
                          const isAvailable = status === '受付可';
                          const ringHex = {
                              '受付可': 'white',
                              '一時受付不可': '#eab308',
                              '当日受付不可': '#ef4444',
                              '非稼働': '#64748b',
                          }[status] ?? 'white';
                          const outerHex = isAvailable ? '#0193be' : 'white';
                          const ringBoxShadow = `0 0 0 4px ${ringHex}, 0 0 0 9px ${outerHex}`;
                          const statusTextColor = isAvailable ? 'text-[#0193be]' : 'text-white';
                          const statusBgColor = {
                              '受付可': 'bg-[#0193be]',
                              '一時受付不可': 'bg-yellow-500',
                              '当日受付不可': 'bg-red-500',
                              '非稼働': 'bg-slate-500',
                          }[status] ?? 'bg-[#0193be]';
                          const statusBgHex = {
                              '受付可': '#0193be',
                              '一時受付不可': '#eab308',
                              '当日受付不可': '#ef4444',
                              '非稼働': '#64748b',
                          }[status] ?? '#0193be';
                          const calendarHover = isAvailable ? 'hover:bg-slate-200/60' : 'hover:bg-white/20';

                          // --- 保有数カウント ---
                          const mikomiBases = ['見込C','見込B','見込A','見込S','LL見込'] as const;
                          const mikomirususBases = ['見込C留守','見込B留守','見込A留守','見込S留守'] as const;
                          const today8 = new Date(); today8.setDate(today8.getDate() + 4); today8.setHours(0,0,0,0);
                          const activeCalls = calls.filter(c => c.assignee === selectedMember && c.status !== '完了');
                          const mikomiCount = activeCalls.filter(c => (mikomiBases as readonly string[]).includes(c.rank)).length;
                          const mikomiRusuCount = activeCalls.filter(c => (mikomirususBases as readonly string[]).includes(c.rank)).length;
                          const chokiCount = activeCalls.filter(c => {
                              const isTarget = (mikomiBases as readonly string[]).includes(c.rank) || (mikomirususBases as readonly string[]).includes(c.rank);
                              if (!isTarget) return false;
                              if (!c.dateTime) return false;
                              const dt = new Date(c.dateTime); dt.setHours(0,0,0,0);
                              return dt >= today8;
                          }).length;
                          const totalBase = mikomiCount + mikomiRusuCount;
                          const chokiRatio = totalBase > 0 ? chokiCount / totalBase : 0;
                          const chokiAccentColor = chokiRatio > 0.25
                              ? { text: 'text-red-500', bg: isAvailable ? (isDarkMode ? 'bg-red-500/15' : 'bg-red-50') : 'bg-white/15', border: 'border-red-400/50', num: 'text-red-500' }
                              : chokiRatio > 0.15
                              ? { text: 'text-yellow-500', bg: isAvailable ? (isDarkMode ? 'bg-yellow-500/15' : 'bg-yellow-50') : 'bg-white/15', border: 'border-yellow-400/50', num: 'text-yellow-500' }
                              : null;
                          const rusuRatio = totalBase > 0 ? mikomiRusuCount / totalBase : 0;
                          const rusuAccentColor = rusuRatio > 0.45
                              ? { text: 'text-red-500', bg: isAvailable ? (isDarkMode ? 'bg-red-500/15' : 'bg-red-50') : 'bg-white/15', border: 'border-red-400/50', num: 'text-red-500' }
                              : rusuRatio > 0.30
                              ? { text: 'text-yellow-500', bg: isAvailable ? (isDarkMode ? 'bg-yellow-500/15' : 'bg-yellow-50') : 'bg-white/15', border: 'border-yellow-400/50', num: 'text-yellow-500' }
                              : null;

                          // 背景スタイル（受付可：白背景、それ以外：ステータスカラー）
                          const gradientStyle: React.CSSProperties = isAvailable ? {} : { backgroundColor: statusBgHex };

                          // カウンターカード共通スタイル
                          const counterCardBase = isAvailable
                              ? isDarkMode
                                  ? 'bg-white/5 border border-[#0193be]/25 hover:bg-white/10'
                                  : 'bg-white/70 border border-[#0193be]/20 hover:bg-white/90'
                              : 'bg-white/15 border border-white/30 hover:bg-white/25';
                          const counterLabelColor = isAvailable ? (isDarkMode ? 'text-[#0193be]/70' : 'text-[#0193be]/70') : 'text-white/70';
                          const counterNumColor = isAvailable ? (isDarkMode ? 'text-[#0193be]' : 'text-[#0193be]') : 'text-white';
                          const dividerColor = isAvailable ? (isDarkMode ? 'border-[#0193be]/20' : 'border-[#0193be]/15') : 'border-white/25';

                          return (
                              <div
                                  className={`rounded-xl overflow-hidden transition-colors duration-500 ${isAvailable ? (isDarkMode ? 'bg-[#1e2535] border border-[#0193be]/60' : 'bg-white border border-[#0193be]') : ''}`}
                                  style={gradientStyle}
                              >
                                  {/* 上部：プロフィール + 基本情報 */}
                                  <div className="flex items-center gap-4 px-5 pt-3 pb-4">
                                      {/* アイコン：クリックでポップアップ拡大表示 */}
                                      <button
                                          onClick={() => setProfilePopupUser(selectedUserDetails)}
                                          className="relative flex-shrink-0 w-24 h-24 rounded-full transition-all duration-500 hover:scale-105"
                                          style={{ boxShadow: ringBoxShadow }}
                                          title={`${selectedMember}さんのプロフィール画像を拡大`}
                                      >
                                          {selectedUserDetails.profilePicture ? (
                                              <img src={selectedUserDetails.profilePicture} alt={selectedMember} className="w-24 h-24 rounded-full object-cover" />
                                          ) : (
                                              <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center">
                                                  <UserIcon className={`w-12 h-12 ${isAvailable ? 'text-[#0193be]/80' : 'text-slate-400'}`} />
                                              </div>
                                          )}
                                      </button>
                                      <div className="flex-1 min-w-0">
                                          {selectedUserDetails.comment && (
                                              <div className="mb-2">
                                                  <div className={`relative inline-block ${statusBgColor} px-3 py-1.5 rounded-lg shadow-sm`}>
                                                      <div className="flex items-baseline gap-2">
                                                          <p className="text-sm font-bold text-white">
                                                              {selectedUserDetails.comment}
                                                          </p>
                                                          {selectedUserDetails.commentUpdatedAt && (
                                                              <span className="text-xs text-white/80 whitespace-nowrap">
                                                                  {formatRelativeTime(selectedUserDetails.commentUpdatedAt)}
                                                              </span>
                                                          )}
                                                      </div>
                                                      <div className="absolute top-full left-6 w-0 h-0 border-r-[12px] border-r-transparent" style={{ borderTopWidth: '6px', borderTopColor: statusBgHex }}></div>
                                                  </div>
                                              </div>
                                          )}
                                          <div className="flex items-center gap-2 flex-wrap">
                                              <h2 className={`text-4xl font-black tracking-tight transition-colors duration-500 ${statusTextColor}`}>
                                                  {selectedMember}
                                              </h2>
                                              <button
                                                  onClick={() => handleShowUserSchedule(selectedMember)}
                                                  className={`${statusTextColor} opacity-60 hover:opacity-100 p-1 rounded-full ${calendarHover} transition`}
                                                  title={`${selectedMember}さんのスケジュールを表示`}
                                              >
                                                  <CalendarIcon className="w-5 h-5" />
                                              </button>
                                              {/* ステータスバッジ */}
                                              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${statusBgColor} text-white`}>
                                                  {status}
                                              </span>
                                          </div>
                                          <div className={`mt-1 flex items-center gap-3 text-sm flex-wrap ${statusTextColor} opacity-75`}>
                                              {((selectedUserDetails.availableProducts && selectedUserDetails.availableProducts.length > 0) || selectedUserDetails.isLinePrechecker) && (
                                                  <span className="font-semibold">{getProductsLabel(selectedUserDetails)}</span>
                                              )}
                                              {(selectedUserDetails.workStart || selectedUserDetails.workEnd) && (
                                                  <>
                                                      {((selectedUserDetails.availableProducts && selectedUserDetails.availableProducts.length > 0) || selectedUserDetails.isLinePrechecker) && (
                                                          <span className="opacity-40">|</span>
                                                      )}
                                                      <span>{formatWorkTime(selectedUserDetails.workStart ?? '11:00')} - {formatWorkTime(selectedUserDetails.workEnd ?? '20:00')}</span>
                                                  </>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                                  {/* 区切り線 */}
                                  <div className={`mx-5 border-t ${dividerColor}`} />
                                  {/* 下部：カウンターゾーン */}
                                  <div className="grid grid-cols-3 gap-2 px-5 py-2">
                                      {/* 見込 */}
                                      <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 transition-colors ${counterCardBase}`}>
                                          <span className={`text-xl font-black tabular-nums leading-none ${counterNumColor}`}>{mikomiCount}</span>
                                          <span className={`text-xs font-bold tracking-wide ${counterLabelColor}`}>見込</span>
                                      </div>
                                      {/* 見込留守（アラート連動） */}
                                      <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 transition-colors ${rusuAccentColor ? `${rusuAccentColor.bg} ${rusuAccentColor.border} border` : counterCardBase}`}>
                                          <span className={`text-xl font-black tabular-nums leading-none ${rusuAccentColor ? rusuAccentColor.num : counterNumColor}`}>{mikomiRusuCount}</span>
                                          <span className={`text-xs font-bold tracking-wide ${rusuAccentColor ? rusuAccentColor.text : counterLabelColor}`}>見込留守</span>
                                      </div>
                                      {/* 長期見込（アラート連動） */}
                                      <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 transition-colors ${chokiAccentColor ? `${chokiAccentColor.bg} ${chokiAccentColor.border} border` : counterCardBase}`}>
                                          <span className={`text-xl font-black tabular-nums leading-none ${chokiAccentColor ? chokiAccentColor.num : counterNumColor}`}>{chokiCount}</span>
                                          <span className={`text-xs font-bold tracking-wide ${chokiAccentColor ? chokiAccentColor.text : counterLabelColor}`}>長期見込</span>
                                      </div>
                                  </div>
                              </div>
                          );
                      })()}
                </div>
                
                {(viewMode !== 'others' || selectedMember !== '新規依頼') && (
                  <div className={`mb-4 rounded-lg shadow-sm border ${isDarkMode ? 'bg-[#1e2535] border-white/10' : 'bg-white border-slate-200'}`}>
                    <button
                      onClick={() => {
                        setIsFormVisible(prev => {
                          if (prev) { // If form was visible, it's now closing.
                            setFormResetCounter(c => c + 1);
                          }
                          return !prev;
                        });
                      }}
                      className={`w-full flex items-center justify-between p-4 font-semibold text-left focus:outline-none focus:ring-2 focus:ring-offset-0 ${isPrecheckTheme ? 'focus:ring-[#118f82]' : 'focus:ring-[#0193be]'} transition-colors duration-500 ${
                        isFormVisible
                          ? `${isPrecheckTheme ? 'bg-[#118f82]' : 'bg-[#0193be]'} text-white rounded-t-lg`
                          : `${isPrecheckTheme ? 'text-[#118f82]' : 'text-[#0193be]'} rounded-lg ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`
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
                        <div className={`p-4 border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
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
                            prefilledAssignee={prefilledAssignee}
                            prefilledRequester={prefilledRequester}
                            onPrefillConsumed={handlePrefillConsumed}
                            isDarkMode={isDarkMode}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {displayViewMode === 'others' && selectedMember === '新規依頼' && (
                  <>
                    <div className={`mb-4 rounded-lg shadow-sm border ${isDarkMode ? 'bg-[#1e2535] border-white/10' : 'bg-white border-slate-200'}`}>
                      <button
                        onClick={() => setIsShiftCalendarVisible(prev => !prev)}
                        className={`w-full flex items-center justify-between p-4 font-semibold text-left focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#0193be] transition-colors duration-500 ${
                          isShiftCalendarVisible
                            ? `bg-[#0193be] text-white rounded-t-lg`
                            : `text-[#0193be] rounded-lg ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`
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
                          <div className={`p-4 border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                            <ShiftCalendar 
                              users={users}
                              onSelectMemberWithDate={handleSelectMemberFromCalendar}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className={`mb-4 rounded-lg shadow-sm border ${isDarkMode ? 'bg-[#1e2535] border-white/10' : 'bg-white border-slate-200'}`}>
                      <button
                        onClick={() => {
                          setIsFormVisible(prev => {
                            if (prev) {
                              setFormResetCounter(c => c + 1);
                            }
                            return !prev;
                          });
                        }}
                        className={`w-full flex items-center justify-between p-4 font-semibold text-left focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[#0193be] transition-colors duration-500 ${
                          isFormVisible
                            ? `bg-[#0193be] text-white rounded-t-lg`
                            : `text-[#0193be] rounded-lg ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`
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
                          <div className={`p-4 border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                             <CallRequestForm
                              onAddCall={handleAddCall}
                              currentUser={currentUser.name}
                              users={users}
                              calls={calls}
                              formResetCounter={formResetCounter}
                              onAssigneeChange={(assignee) => {
                                if (assignee !== previewMember) {
                                  setPreviewMember(assignee || null);
                                }
                              }}
                              enableProductFiltering={true}
                              isPrecheckTheme={isPrecheckTheme}
                              prefilledDate={prefilledRequestDate}
                              prefilledAssignee={prefilledAssignee}
                              prefilledRequester={prefilledRequester}
                              onPrefillConsumed={handlePrefillConsumed}
                              isDarkMode={isDarkMode}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}


                {displayViewMode === 'others' && selectedMember === '新規依頼' ? (
                  <div>
                    {previewMember ? (
                      (() => {
                        const selectedUserDetails = users.find(u => u.name === previewMember);
                        if (!selectedUserDetails) return null;
                        const status = selectedUserDetails.availabilityStatus;
                        const pvIsAvailable = status === '受付可';
                        const pvRingHex = { '受付可': 'white', '一時受付不可': '#eab308', '当日受付不可': '#ef4444', '非稼働': '#64748b' }[status] ?? 'white';
                        const pvRingBoxShadow = `0 0 0 4px ${pvRingHex}, 0 0 0 9px ${pvIsAvailable ? '#0193be' : 'white'}`;
                        const pvStatusBgHex = { '受付可': '#0193be', '一時受付不可': '#eab308', '当日受付不可': '#ef4444', '非稼働': '#64748b' }[status] ?? '#0193be';
                        const pvStatusBgColor = { '受付可': 'bg-[#0193be]', '一時受付不可': 'bg-yellow-500', '当日受付不可': 'bg-red-500', '非稼働': 'bg-slate-500' }[status] ?? 'bg-[#0193be]';
                        const pvTextColor = pvIsAvailable ? 'text-[#0193be]' : 'text-white';

                        // --- preview: 保有数カウント ---
                        const pvMikomiBases = ['見込C','見込B','見込A','見込S','LL見込'] as const;
                        const pvMikomiRusuBases = ['見込C留守','見込B留守','見込A留守','見込S留守'] as const;
                        const pvToday8 = new Date(); pvToday8.setDate(pvToday8.getDate() + 4); pvToday8.setHours(0,0,0,0);
                        const pvActiveCalls = calls.filter(c => c.assignee === previewMember && c.status !== '完了');
                        const pvMikomiCount = pvActiveCalls.filter(c => (pvMikomiBases as readonly string[]).includes(c.rank)).length;
                        const pvMikomiRusuCount = pvActiveCalls.filter(c => (pvMikomiRusuBases as readonly string[]).includes(c.rank)).length;
                        const pvChokiCount = pvActiveCalls.filter(c => {
                            const isTarget = (pvMikomiBases as readonly string[]).includes(c.rank) || (pvMikomiRusuBases as readonly string[]).includes(c.rank);
                            if (!isTarget) return false;
                            if (!c.dateTime) return false;
                            const dt = new Date(c.dateTime); dt.setHours(0,0,0,0);
                            return dt >= pvToday8;
                        }).length;
                        const pvTotalBase = pvMikomiCount + pvMikomiRusuCount;
                        const pvChokiRatio = pvTotalBase > 0 ? pvChokiCount / pvTotalBase : 0;
                        const pvChokiAccent = pvChokiRatio > 0.25
                            ? { text: 'text-red-500', bg: pvIsAvailable ? (isDarkMode ? 'bg-red-500/15' : 'bg-red-50') : 'bg-white/15', border: 'border-red-400/50', num: 'text-red-500' }
                            : pvChokiRatio > 0.15
                            ? { text: 'text-yellow-500', bg: pvIsAvailable ? (isDarkMode ? 'bg-yellow-500/15' : 'bg-yellow-50') : 'bg-white/15', border: 'border-yellow-400/50', num: 'text-yellow-500' }
                            : null;
                        const pvRusuRatio = pvTotalBase > 0 ? pvMikomiRusuCount / pvTotalBase : 0;
                        const pvRusuAccent = pvRusuRatio > 0.45
                            ? { text: 'text-red-500', bg: pvIsAvailable ? (isDarkMode ? 'bg-red-500/15' : 'bg-red-50') : 'bg-white/15', border: 'border-red-400/50', num: 'text-red-500' }
                            : pvRusuRatio > 0.30
                            ? { text: 'text-yellow-500', bg: pvIsAvailable ? (isDarkMode ? 'bg-yellow-500/15' : 'bg-yellow-50') : 'bg-white/15', border: 'border-yellow-400/50', num: 'text-yellow-500' }
                            : null;
                        // 背景スタイル（受付可：白背景、それ以外：ステータスカラー）
                        const pvGradientStyle: React.CSSProperties = pvIsAvailable ? {} : { backgroundColor: pvStatusBgHex };
                        const pvCounterCardBase = pvIsAvailable
                            ? isDarkMode ? 'bg-white/5 border border-[#0193be]/25 hover:bg-white/10' : 'bg-white/70 border border-[#0193be]/20 hover:bg-white/90'
                            : 'bg-white/15 border border-white/30 hover:bg-white/25';
                        const pvCounterLabel = pvIsAvailable ? (isDarkMode ? 'text-[#0193be]/70' : 'text-[#0193be]/70') : 'text-white/70';
                        const pvCounterNum = pvIsAvailable ? 'text-[#0193be]' : 'text-white';
                        const pvDivider = pvIsAvailable ? (isDarkMode ? 'border-[#0193be]/20' : 'border-[#0193be]/15') : 'border-white/25';

                        return (
                          <div key={previewMember} className="animate-wipe-in-down-slow">
                            <div className="mb-4">
                              {/* previewMember ヘッダーカード */}
                              <div
                                  className={`rounded-xl overflow-hidden transition-colors duration-500 ${pvIsAvailable ? (isDarkMode ? 'bg-[#1e2535] border border-[#0193be]/60' : 'bg-white border border-[#0193be]') : ''}`}
                                  style={pvGradientStyle}
                              >
                                  {/* 上部：プロフィール + 基本情報 */}
                                  <div className="flex items-center gap-4 px-5 pt-3 pb-4">
                                      <div
                                          className="relative flex-shrink-0 w-24 h-24 rounded-full flex items-center justify-center transition-colors duration-500"
                                          style={{ boxShadow: pvRingBoxShadow }}
                                      >
                                          {selectedUserDetails.profilePicture ? (
                                              <img src={selectedUserDetails.profilePicture} alt={previewMember} className="w-24 h-24 rounded-full object-cover" />
                                          ) : (
                                              <div className="w-24 h-24 rounded-full bg-slate-200 flex items-center justify-center">
                                                  <UserIcon className={`w-12 h-12 ${pvIsAvailable ? 'text-[#0193be]/80' : 'text-slate-400'}`} />
                                              </div>
                                          )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                          {selectedUserDetails.comment && (
                                              <div className="mb-2">
                                                  <div className={`relative inline-block ${pvStatusBgColor} px-3 py-1.5 rounded-lg shadow-sm`}>
                                                      <div className="flex items-baseline gap-2">
                                                          <p className="text-sm font-bold text-white">{selectedUserDetails.comment}</p>
                                                          {selectedUserDetails.commentUpdatedAt && (
                                                              <span className="text-xs text-white/80 whitespace-nowrap">{formatRelativeTime(selectedUserDetails.commentUpdatedAt)}</span>
                                                          )}
                                                      </div>
                                                      <div className="absolute top-full left-6 w-0 h-0 border-r-[12px] border-r-transparent" style={{ borderTopWidth: '6px', borderTopColor: pvStatusBgHex }}></div>
                                                  </div>
                                              </div>
                                          )}
                                          <div className="flex items-center gap-2 flex-wrap">
                                              <h2 className={`text-4xl font-black tracking-tight ${pvTextColor}`}>{previewMember}</h2>
                                              <button
                                                  onClick={() => handleShowUserSchedule(previewMember)}
                                                  className={`${pvTextColor} opacity-60 hover:opacity-100 p-1 rounded-full ${pvIsAvailable ? 'hover:bg-slate-200/60' : 'hover:bg-white/20'} transition`}
                                                  title={`${previewMember}さんのスケジュールを表示`}
                                              >
                                                  <CalendarIcon className="w-5 h-5" />
                                              </button>
                                              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${pvStatusBgColor} text-white`}>{status}</span>
                                          </div>
                                          <div className={`mt-1 flex items-center gap-3 text-sm flex-wrap ${pvTextColor} opacity-75`}>
                                              {((selectedUserDetails.availableProducts && selectedUserDetails.availableProducts.length > 0) || selectedUserDetails.isLinePrechecker) && (
                                                  <span className="font-semibold">{getProductsLabel(selectedUserDetails)}</span>
                                              )}
                                              {(selectedUserDetails.workStart || selectedUserDetails.workEnd) && (
                                                  <>
                                                      {((selectedUserDetails.availableProducts && selectedUserDetails.availableProducts.length > 0) || selectedUserDetails.isLinePrechecker) && (
                                                          <span className="opacity-40">|</span>
                                                      )}
                                                      <span>{formatWorkTime(selectedUserDetails.workStart ?? '11:00')} - {formatWorkTime(selectedUserDetails.workEnd ?? '20:00')}</span>
                                                  </>
                                              )}
                                          </div>
                                      </div>
                                  </div>
                                  {/* 区切り線 */}
                                  <div className={`mx-5 border-t ${pvDivider}`} />
                                  {/* 下部：カウンターゾーン */}
                                  <div className="grid grid-cols-3 gap-2 px-5 py-2">
                                      <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 transition-colors ${pvCounterCardBase}`}>
                                          <span className={`text-xl font-black tabular-nums leading-none ${pvCounterNum}`}>{pvMikomiCount}</span>
                                          <span className={`text-xs font-bold tracking-wide ${pvCounterLabel}`}>見込</span>
                                      </div>
                                      <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 transition-colors ${pvRusuAccent ? `${pvRusuAccent.bg} ${pvRusuAccent.border} border` : pvCounterCardBase}`}>
                                          <span className={`text-xl font-black tabular-nums leading-none ${pvRusuAccent ? pvRusuAccent.num : pvCounterNum}`}>{pvMikomiRusuCount}</span>
                                          <span className={`text-xs font-bold tracking-wide ${pvRusuAccent ? pvRusuAccent.text : pvCounterLabel}`}>見込留守</span>
                                      </div>
                                      <div className={`flex flex-col items-center rounded-lg px-3 py-1.5 transition-colors ${pvChokiAccent ? `${pvChokiAccent.bg} ${pvChokiAccent.border} border` : pvCounterCardBase}`}>
                                          <span className={`text-xl font-black tabular-nums leading-none ${pvChokiAccent ? pvChokiAccent.num : pvCounterNum}`}>{pvChokiCount}</span>
                                          <span className={`text-xs font-bold tracking-wide ${pvChokiAccent ? pvChokiAccent.text : pvCounterLabel}`}>長期見込</span>
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
                              recentlyUpdatedCallId={recentlyUpdatedCallId}
                              recentlyAddedCallId={recentlyAddedCallId}
                              newCallIds={newCallIds}
                              members={assigneesForEditing}
                              users={users}
                              currentUser={currentUser}
                              normalDuplicateIds={normalDuplicateIds}
                              precheckDuplicateIds={precheckDuplicateIds}
                              isDarkMode={isDarkMode}
                            />
                          </div>
                        );
                      })()
                    ) : (
                      <div className="text-center py-20 px-6">
                        <h2 className={`text-8xl font-bold font-inconsolata select-none transition-colors duration-500 ${isFormVisible || isShiftCalendarVisible ? 'text-[#0193be]' : (isDarkMode ? 'text-slate-600' : 'text-slate-300')}`}>Mykonos</h2>
                      </div>
                    )}
                  </div>
                ) : (
                  <CallList 
                    calls={filteredCalls}
                    selectedMember={displayViewMode === 'mine' ? currentUser.name : (displayViewMode === 'precheck' ? PRECHECKER_ASSIGNEE_NAME : selectedMember)}
                    onUpdateCall={handleUpdateCall}
                    onSelectCall={handleSelectCall}
                    highlightedCallId={highlightedCallId}
                    recentlyUpdatedCallId={recentlyUpdatedCallId}
                    recentlyAddedCallId={recentlyAddedCallId}
                    newCallIds={newCallIds}
                    members={assigneesForEditing}
                    users={users}
                    isPrecheckTheme={isPrecheckTheme}
                    currentUser={currentUser}
                    normalDuplicateIds={normalDuplicateIds}
                    precheckDuplicateIds={precheckDuplicateIds}
                    isDarkMode={isDarkMode}
                  />
                )}
            </div>
            </div>{/* /フェードトランジションラッパー */}
          </div>
        </div>
      </main>

      <footer className={`relative px-4 sm:px-6 lg:px-8 py-3 text-center text-sm border-t border-b overflow-hidden ${isDarkHeader ? 'text-white border-white/20' : (isDarkMode ? 'text-[#0193be]/80 border-white/10' : 'text-[#0193be]/80 border-slate-200')}`}>
        {/* フッター背景レイヤー */}
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 header-white-fade transition-opacity duration-500" style={{ opacity: displayViewMode === 'others' && !isDarkMode ? 1 : 0 }} />
          <div className="absolute inset-0 header-dark-fade transition-opacity duration-500" style={{ opacity: displayViewMode === 'others' && isDarkMode ? 1 : 0 }} />
          <div className="absolute inset-0 header-gradient-blue transition-opacity duration-500" style={{ opacity: displayViewMode === 'mine' ? 1 : 0 }} />
          <div className="absolute inset-0 header-gradient-teal transition-opacity duration-500" style={{ opacity: displayViewMode === 'precheck' ? 1 : 0 }} />
        </div>
        <p className="relative font-inconsolata">&copy; {new Date().getFullYear()} Mykonos. All rights reserved.</p>
      </footer>

      {/* アイコン変更用の隠しファイル入力 */}
      <input
        ref={iconFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleIconFileChange}
      />
      
      <CallDetailModal 
        calls={selectedCall ? [selectedCall] : searchResults}
        duplicateCalls={pendingDuplicate?.existingCalls}
        selectedCallDuplicates={selectedCallDuplicates}
        onClose={() => {
            setSelectedCall(null);
            setSearchResults(null);
            setIsSearchDeleted(false);
            handleCancelDuplicateCreation();
        }}
        onJump={handleJumpToCall}
        onReactivate={handleReactivateCall}
        showJumpButton={!!searchResults && !isSearchDeleted}
        isDeletedSearch={isSearchDeleted}
        isConfirmingDuplicate={!!pendingDuplicate}
        onConfirmDuplicate={handleConfirmDuplicateCreation}
        isPrecheckTheme={isPrecheckTheme}
        users={users}
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
        title="一時受付不可の確認"
      >
        {pendingUnavailableConfirmation && (
          <div>
            <p>
              <strong className="text-slate-800">{pendingUnavailableConfirmation.assignee}</strong>さんは現在
              <strong className="text-slate-800 mx-1">「一時受付不可」</strong>
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
            announcementExpiresAt={announcementExpiresAt}
            onSetAnnouncementExpiresAt={handleSetAnnouncementExpiresAt}
            announcementPriority={announcementPriority}
            onSetAnnouncementPriority={handleSetAnnouncementPriority}
            appVersion={appVersion}
            onSetAppVersion={handleSetAppVersion}
            onCreateTasks={handleCreateBulkTasks}
            alerts={alerts}
            onJumpToMember={handleJumpToMember}
            calls={calls}
            onOpenSchedule={(user) => { setIsAdminMenuOpen(false); setScheduleOpenedFromAdmin(true); setIsScheduleViewReadOnly(false); setScheduleViewingUser(user); }}
            onUpdateWorkHours={(userName, workStart, workEnd, autoUnavailableOffset) =>
              handleSaveWorkHours(workStart, workEnd, autoUnavailableOffset, userName)
            }
            feedbackReports={feedbackReports}
            onDeleteFeedback={async (id) => {
              await apiDeleteFeedbackReport(id);
              setFeedbackReports(prev => prev.filter(r => r.id !== id));
            }}
            onMarkFeedbackRead={async (id) => {
              await apiMarkFeedbackRead(id);
              setFeedbackReports(prev => prev.map(r => r.id === id ? { ...r, isRead: true } : r));
            }}
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

      {/* AdminMenu からメンバーのスケジュールを編集 / 一般ユーザーが閲覧するモーダル */}
      {scheduleViewingUser && (
        <ScheduleModal
          isOpen={!!scheduleViewingUser}
          onClose={() => {
            setScheduleViewingUser(null);
            setIsScheduleViewReadOnly(false);
            if (scheduleOpenedFromAdmin) {
              setIsAdminMenuOpen(true);
              setScheduleOpenedFromAdmin(false);
            }
          }}
          user={scheduleViewingUser}
          onSave={isScheduleViewReadOnly ? undefined : handleUpdateNonWorkingDays}
          readOnly={isScheduleViewReadOnly}
          onDateSelect={
            // 自分以外のメンバーを readOnly 表示している場合のみ新規作成連携を有効にする
            isScheduleViewReadOnly && scheduleViewingUser.name !== currentUser?.name
              ? handleScheduleDateSelect
              : undefined
          }
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

      {/* 稼働時間設定モーダル */}
      {currentUserWithData && (
        <WorkHoursModal
          isOpen={isWorkHoursModalOpen}
          onClose={() => setIsWorkHoursModalOpen(false)}
          user={currentUserWithData}
          onSave={(workStart, workEnd, autoUnavailableOffset) =>
            handleSaveWorkHours(workStart, workEnd, autoUnavailableOffset)
          }
        />
      )}

      {/* 通知設定モーダル */}
      <NotificationSettingsModal
        isOpen={isNotificationSettingsModalOpen}
        onClose={() => setIsNotificationSettingsModalOpen(false)}
        settings={notificationSettings}
        onChange={handleNotificationSettingsChange}
        isLinePrechecker={!!currentUser?.isLinePrechecker}
        onRequestPermission={handleRequestNotificationPermission}
        notificationPermission={
          !('Notification' in window)
            ? 'unsupported'
            : Notification.permission
        }
      />

      {/* バグ報告・要望モーダル */}
      <FeedbackModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        onSubmit={async (type, title, body) => {
          if (!currentUser) return;
          await submitFeedbackReport({ type, title, body, reporter: currentUser.name });
          // 送信後に手動で再取得（Realtimeが遅延する場合の保険）
          fetchFeedbackReports().then(setFeedbackReports).catch(() => {});
        }}
      />
      
      {/* scheduleViewingUser の readOnly モーダルは AdminMenu 用の編集モーダル（上記）に統合済み */}

      {/* プロフィール画像拡大ポップアップ */}
      {profilePopupUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setProfilePopupUser(null)}
        >
          {/* オーバーレイ */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* コンテンツ */}
          <div
            className="relative flex flex-col items-center gap-5 animate-fade-in-up"
            onClick={e => e.stopPropagation()}
          >
            {/* 閉じるボタン */}
            <button
              onClick={() => setProfilePopupUser(null)}
              className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-white transition"
              aria-label="閉じる"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* 拡大画像 */}
            {(() => {
              const pu = profilePopupUser;
              const isSelf = pu.name === currentUser.name;
              const ringHex: Record<string, string> = {
                '受付可': '#0193be',
                '一時受付不可': '#eab308',
                '当日受付不可': '#ef4444',
                '非稼働': '#64748b',
              };
              const color = ringHex[pu.availabilityStatus] ?? '#0193be';
              return (
                <>
                  <div
                    className="w-[346px] h-[346px] rounded-full shadow-2xl overflow-hidden flex-shrink-0"
                    style={{ outline: `5px solid ${color}`, outlineOffset: '4px' }}
                  >
                    {pu.profilePicture ? (
                      <img src={pu.profilePicture} alt={pu.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                        <UserIcon className="w-48 h-48 text-slate-400" />
                      </div>
                    )}
                  </div>

                  {/* 名前 */}
                  <p className="text-2xl font-bold text-white drop-shadow">{pu.name}</p>

                  {/* コメント（設定されている場合のみ） */}
                  {pu.comment && (
                    <div
                      className="relative px-5 py-3 rounded-xl shadow-lg max-w-xs text-center"
                      style={{ backgroundColor: color }}
                    >
                      {/* 吹き出しの三角 */}
                      <div
                        className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0"
                        style={{
                          borderLeft: '8px solid transparent',
                          borderRight: '8px solid transparent',
                          borderBottom: `8px solid ${color}`,
                        }}
                      />
                      <p className="text-white font-semibold text-base leading-snug">{pu.comment}</p>
                      {pu.commentUpdatedAt && (
                        <p className="text-white/70 text-xs mt-1">{formatRelativeTime(pu.commentUpdatedAt)}</p>
                      )}
                    </div>
                  )}

                  {/* 自分の場合：ステータス変更ボタン群 */}
                  {isSelf && (
                    <div className="flex flex-wrap justify-center gap-2 mt-1">
                      {AVAILABILITY_STATUS_OPTIONS.map(status => {
                        const statusStyles = AVAILABILITY_STATUS_STYLES[status];
                        const isActive = pu.availabilityStatus === status;
                        return (
                          <button
                            key={status}
                            onClick={() => {
                              handleUpdateUserStatus(currentUser.name, status);
                              setProfilePopupUser(prev => prev ? { ...prev, availabilityStatus: status as typeof pu.availabilityStatus } : null);
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold shadow transition-all ${
                              isActive
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-transparent scale-105 text-white'
                                : 'opacity-70 hover:opacity-100 text-white'
                            }`}
                            style={{ backgroundColor: isActive ? color : '#ffffff30' }}
                          >
                            <span className={`h-2.5 w-2.5 rounded-full ${statusStyles.bg}`} />
                            {status}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
