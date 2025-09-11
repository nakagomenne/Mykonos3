import { ListType, Rank, CallStatus, User, AvailabilityStatus } from './types';

export const LIST_TYPE_OPTIONS: ListType[] = ['回線', 'MF', 'OK', 'NG'];

export const PRECHECK_RANK_OPTIONS: Rank[] = ['SB光前確', 'AIR前確', '賃ね前確', 'IMP依頼'];

export const RANK_OPTIONS: Rank[] = [
  '留守入電',
  'SMS反響',
  '見込C',
  '見込B',
  '見込A',
  '見込S',
  'LL見込',
  '見込C留守',
  '見込B留守',
  '見込A留守',
  '見込S留守',
  'キャッチ',
  'オナ確',
  '共有',
  '対応',
  '立ち上げ',
  'トス',
  'クレーム',
  ...PRECHECK_RANK_OPTIONS,
];

export const NON_PRECHECK_RANK_OPTIONS: Rank[] = RANK_OPTIONS.filter(rank => !PRECHECK_RANK_OPTIONS.includes(rank));

export const CALL_STATUS_OPTIONS: CallStatus[] = ['追客中', '完了'];

export const AVAILABILITY_STATUS_OPTIONS: AvailabilityStatus[] = ['受付可', '受付不可', '当日受付不可', '非稼働'];

export const ADMIN_USER_NAME = '中込賢三';
export const PRECHECKER_ASSIGNEE_NAME = '回線前確';


const now = new Date().toISOString();

export const DEFAULT_INITIAL_PASSWORD = 'NNE040121';
export const MASTER_PASSWORD = 'RedBullGOAT33';
export const NAKAGOMI_INITIAL_PASSWORD = 'RedBullGOAT33';

export const DEFAULT_USERS: User[] = [
  { name: '脇本隆太', isAdmin: true, isLinePrechecker: true, isSuperAdmin: true, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
  { name: ADMIN_USER_NAME, isAdmin: true, isLinePrechecker: true, isSuperAdmin: true, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: NAKAGOMI_INITIAL_PASSWORD },
  { name: '島袋南海', isAdmin: true, isLinePrechecker: false, isSuperAdmin: false, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
  { name: '戸田直希', isAdmin: true, isLinePrechecker: false, isSuperAdmin: false, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
  { name: '手塚紗也花', isAdmin: false, isLinePrechecker: true, isSuperAdmin: false, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
  { name: '樋口脩祐', isAdmin: false, isLinePrechecker: false, isSuperAdmin: false, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
  { name: '中尾孝祐', isAdmin: false, isLinePrechecker: false, isSuperAdmin: false, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
  { name: '長島摩里愛', isAdmin: false, isLinePrechecker: false, isSuperAdmin: false, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
  { name: '秋吉聖良', isAdmin: false, isLinePrechecker: false, isSuperAdmin: false, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
  { name: '向原将太', isAdmin: false, isLinePrechecker: false, isSuperAdmin: false, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
  { name: '内堀智博', isAdmin: false, isLinePrechecker: false, isSuperAdmin: false, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
  { name: '中川恭紀', isAdmin: false, isLinePrechecker: false, isSuperAdmin: false, createdAt: now, profilePicture: null, availabilityStatus: '受付可', nonWorkingDays: [], availableProducts: ['回線', '水'], comment: '', password: DEFAULT_INITIAL_PASSWORD },
];

export const SUPER_ADMIN_NAMES = ['脇本隆太', '中込賢三'];


export const STATUS_STYLES: Record<CallStatus, { bg: string; text: string; ring: string }> = {
  '追客中': { bg: 'bg-yellow-100', text: 'text-yellow-800', ring: 'ring-yellow-600/20' },
  '完了': { bg: 'bg-green-100', text: 'text-green-800', ring: 'ring-green-600/20' },
};

export const RANK_STYLES: Record<Rank, { backgroundColor: string; color: string; border?: string }> = {
  // Solid bg, white text
  '留守入電': { backgroundColor: '#c200c9', color: '#ffffff' },
  'SMS反響': { backgroundColor: '#ca004c', color: '#ffffff' },
  '見込C': { backgroundColor: '#0193be', color: '#ffffff' },
  '見込B': { backgroundColor: '#30dc74', color: '#ffffff' },
  '見込A': { backgroundColor: '#e465c0', color: '#ffffff' },
  '見込S': { backgroundColor: '#5a3286', color: '#ffffff' },
  'LL見込': { backgroundColor: '#ff7e6e', color: '#ffffff' },
  'トス': { backgroundColor: '#f9bb07', color: '#ffffff' },
  '賃ね前確': { backgroundColor: '#008b7c', color: '#ffffff' },
  
  // Light bg, dark/colored text
  'キャッチ': { backgroundColor: '#e6cff2', color: '#5a3286' },
  'オナ確': { backgroundColor: '#753800', color: '#ffc8aa' },
  '共有': { backgroundColor: '#d4edbc', color: '#01b96e' },
  '対応': { backgroundColor: '#b10202', color: '#ffcfc9' },
  '立ち上げ': { backgroundColor: '#e2e2e2', color: '#fd0000' },
  'SB光前確': { backgroundColor: '#ffeb00', color: '#0193be' },
  'AIR前確': { backgroundColor: '#e8eaed', color: '#003361' },
  'IMP依頼': { backgroundColor: '#f55d00', color: '#f1f1f1' },
  'クレーム': { backgroundColor: '#3d3d3d', color: '#fff600' },
  
  // Bordered
  '見込C留守': { backgroundColor: '#ffffff', color: '#0193be', border: '1px solid #0193be' },
  '見込B留守': { backgroundColor: '#ffffff', color: '#30dc74', border: '1px solid #30dc74' },
  '見込A留守': { backgroundColor: '#ffffff', color: '#e465c0', border: '1px solid #e465c0' },
  '見込S留守': { backgroundColor: '#ffffff', color: '#5a3286', border: '1px solid #5a3286' },
};

export const AVAILABILITY_STATUS_STYLES: Record<AvailabilityStatus, { bg: string; text: string }> = {
  '受付可': { bg: 'bg-[#0193be]', text: 'text-white' },
  '受付不可': { bg: 'bg-yellow-500', text: 'text-white' },
  '当日受付不可': { bg: 'bg-red-500', text: 'text-white' },
  '非稼働': { bg: 'bg-slate-500', text: 'text-white' },
};

const generateTimeSlots = (): string[] => {
  const slots: string[] = [];
  for (let h = 11; h <= 21; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 21 && m > 0) continue;
      const hour = h.toString().padStart(2, '0');
      const minute = m.toString().padStart(2, '0');
      slots.push(`${hour}:${minute}`);
    }
  }
  return slots;
};
export const TIME_SLOTS = generateTimeSlots();

export const SPECIAL_TIME_OPTIONS_TOP = ['至急', 'このあとOK'];
export const PRECHECK_SPECIAL_TIME_OPTIONS_TOP = ['待機中', ...SPECIAL_TIME_OPTIONS_TOP];
export const SPECIAL_TIME_OPTIONS_BOTTOM = ['時設なし', '入電待ち'];
export const ALL_TIME_OPTIONS = [
  ...SPECIAL_TIME_OPTIONS_TOP,
  ...TIME_SLOTS,
  ...SPECIAL_TIME_OPTIONS_BOTTOM,
];
export const PRECHECK_ALL_TIME_OPTIONS = [
  ...PRECHECK_SPECIAL_TIME_OPTIONS_TOP,
  ...TIME_SLOTS,
  ...SPECIAL_TIME_OPTIONS_BOTTOM,
];