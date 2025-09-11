
export type ListType = '回線' | 'MF' | 'OK' | 'NG';

export type Rank = 
  | '留守入電' 
  | 'SMS反響' 
  | '見込C' 
  | '見込B' 
  | '見込A' 
  | '見込S' 
  | 'LL見込' 
  | '見込C留守' 
  | '見込B留守' 
  | '見込A留守' 
  | '見込S留守' 
  | 'キャッチ' 
  | 'オナ確' 
  | '共有' 
  | '対応' 
  | '立ち上げ' 
  | 'トス' 
  | 'クレーム'
  | 'SB光前確'
  | 'AIR前確'
  | '賃ね前確'
  | 'IMP依頼';

export type CallStatus = '追客中' | '完了';

export type AvailabilityStatus = '受付可' | '受付不可' | '当日受付不可' | '非稼働';

export type CallRequestUpdatableFields = 'customerId' | 'requester' | 'assignee' | 'listType' | 'rank' | 'dateTime' | 'notes' | 'status' | 'absenceCount' | 'prechecker' | 'imported';

export interface EditChange {
  field: CallRequestUpdatableFields;
  oldValue: any;
  newValue: any;
}

export interface EditHistory {
  editor: string;
  timestamp: string;
  changes: EditChange[];
}
export interface CallRequest {
  id: string;
  customerId: string;
  requester: string;
  assignee: string;
  listType: ListType | '';
  rank: Rank;
  dateTime: string;
  notes: string;
  status: CallStatus;
  createdAt: string;
  completedAt?: string;
  history?: EditHistory[];
  absenceCount?: number;
  prechecker?: string | null;
  imported?: boolean;
}

export interface User {
  name: string;
  isAdmin: boolean;
  isLinePrechecker?: boolean;
  isSuperAdmin?: boolean;
  createdAt: string;
  isLoggedInAsAdmin?: boolean;
  profilePicture?: string | null;
  availabilityStatus: AvailabilityStatus;
  nonWorkingDays?: string[];
  availableProducts?: string[];
  comment?: string;
  password?: string;
  commentUpdatedAt?: string;
}