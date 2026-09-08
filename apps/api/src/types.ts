import type {
  IndexAsset,
  MemberRole,
  PeriodKind,
  PeriodTemplate,
  RecurringCadence,
  RoundTo,
  SettlementStatus,
  SplitMode,
} from '@dongham/ledger';

export type {
  IndexAsset,
  MemberRole,
  PeriodKind,
  PeriodTemplate,
  RecurringCadence,
  RoundTo,
  SettlementStatus,
  SplitMode,
};

export interface UserPayoutMethod {
  id: string;
  label?: string;
  cardNumber: string;
  sheba?: string;
  cardHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  isDefault?: boolean;
}

export interface UserRecord {
  id: string;
  phone?: string;
  email?: string;
  passwordHash?: string;
  googleId?: string;
  displayName: string;
  createdAt: string;
  deletedAt?: string;
  bannedAt?: string;
  plan?: 'free' | 'premium';
  premiumUntil?: string;
  usePersianDigits?: boolean;
  debtReminders?: boolean;
  calendarMode?: 'jalali' | 'gregorian';
  autoSync?: boolean;
  fxWatchlist?: string[];
  payoutMethods?: UserPayoutMethod[];
  prefsUpdatedAt?: string;
  avatarDataUrl?: string;
  avatarPreset?: string;
  avatarUpdatedAt?: string;
  hasAvatar?: boolean;
  username?: string;
  profileCoverPreset?: string;
  profileCoverDataUrl?: string;
}

export interface DeviceSession {
  id: string;
  userId: string;
  deviceId: string;
  token: string;
  createdAt: string;
}

export type Charge = { type: 'none' | 'percent' | 'amount'; value: number };

export interface PeriodRecord {
  id: string;
  title: string;
  currency: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  kind?: PeriodKind;
  bankerMemberId?: string;
  template?: PeriodTemplate;
  roundTo?: RoundTo;
  buildingCharge?: number;
  lunchTurnMemberId?: string;
  encrypted?: boolean;
  visibility?: 'private' | 'public';
  coverPreset?: string;
  coverDataUrl?: string;
}

export interface MemberRecord {
  id: string;
  periodId: string;
  userId?: string;
  guestKey?: string;
  displayName: string;
  weightDefault: number;
  role: MemberRole;
  phone?: string;
  email?: string;
  cardNumber?: string;
  sheba?: string;
  cardHolderName?: string;
  bankName?: string;
  excludeFromNew?: boolean;
  isPot?: boolean;
  unitLabel?: string;
}

export interface ExpenseRecord {
  id: string;
  periodId: string;
  title: string;
  amount: number;
  currency: string;
  payerId: string;
  payers?: { memberId: string; amount: number }[];
  splitMode: SplitMode;
  shares: { memberId: string; value: number; excluded?: boolean }[];
  tax: Charge;
  service?: Charge;
  tip?: Charge;
  tags: string[];
  note?: string;
  attachmentId?: string;
  attachmentDataUrl?: string;
  fxRate: number;
  createdAt: string;
  occurredAt?: string;
  updatedAt: string;
  deletedAt?: string;
  clientId?: string;
  version: number;
}

export interface PaymentRecord {
  id: string;
  periodId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: string;
  kind: 'settlement' | 'loan';
  note?: string;
  fxRate: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  version: number;
  status?: SettlementStatus;
  receiptDataUrl?: string;
  indexAsset?: IndexAsset;
  indexRateAtCreate?: number;
}

export interface InviteRecord {
  token: string;
  periodId: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
}

export interface ChatMessageRecord {
  id: string;
  periodId: string;
  senderMemberId: string;
  body: string;
  expenseId?: string;
  createdAt: string;
}

export interface FriendRecord {
  id: string;
  userId: string;
  friendUserId?: string;
  displayName: string;
  phone?: string;
  email?: string;
}

export interface AttachmentRecord {
  id: string;
  periodId: string;
  mime: string;
  dataBase64: string;
  createdAt: string;
}

export interface OtpRecord {
  phone: string;
  code: string;
  expiresAt: number;
}

export interface ActivityRecord {
  id: string;
  periodId: string;
  actorName: string;
  action: string;
  summary: string;
  createdAt: string;
  entityId?: string;
}

export interface AdminAuditRecord {
  id: string;
  actorUserId: string;
  actorPhone?: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface ImpersonationTicket {
  code: string;
  userId: string;
  actorUserId: string;
  expiresAt: number;
  token?: string;
  consumedAt?: number;
}

export interface BillingEvent {
  id: string;
  userId: string;
  source: 'bazaar' | 'myket' | 'zarinpal' | 'admin';
  sku?: string;
  amount?: number;
  until: string;
  createdAt: string;
}

export interface PlatformSettings {
  extraAdminPhones?: string[];
}

export interface FxCacheRecord {
  rates: Record<string, number>;
  fetchedAt: string;
  source?: string;
}

export interface SyncOp {
  id: string;
  periodId: string;
  entity: 'expense' | 'payment' | 'member' | 'chat' | 'period' | 'activity' | 'recurring';
  action: 'upsert' | 'delete';
  payload: unknown;
  clientId: string;
  deviceId: string;
  baseVersion: number;
  createdAt: string;
}

export interface DbShape {
  users: UserRecord[];
  sessions: DeviceSession[];
  periods: PeriodRecord[];
  members: MemberRecord[];
  expenses: ExpenseRecord[];
  payments: PaymentRecord[];
  invites: InviteRecord[];
  chat: ChatMessageRecord[];
  friends: FriendRecord[];
  attachments: AttachmentRecord[];
  otps: OtpRecord[];
  notifications: {
    id: string;
    userId: string;
    title: string;
    body: string;
    read: boolean;
    createdAt: string;
  }[];
  recurring: {
    id: string;
    periodId: string;
    title: string;
    amount: number;
    currency: string;
    payerId: string;
    splitMode: ExpenseRecord['splitMode'];
    shares: ExpenseRecord['shares'];
    intervalDays: number;
    cadence?: RecurringCadence;
    nextAt: string;
    active: boolean;
  }[];
  activity: ActivityRecord[];
  fxCache?: FxCacheRecord;
  zarinpalPending?: {
    authority: string;
    userId: string;
    sku: string;
    amount: number;
    createdAt: string;
  }[];
  shebaLookups?: ShebaLookupDay[];
  adminAudit?: AdminAuditRecord[];
  impersonationTickets?: ImpersonationTicket[];
  billingEvents?: BillingEvent[];
  platformSettings?: PlatformSettings;
}

export interface ShebaLookupCache {
  iban: string;
  depositNumber: string;
  bank: string;
  bankName: string;
  bankCode: string;
  holderName: string;
}

export interface ShebaLookupDay {
  identity: string;
  day: string;
  count: number;
  cache: Record<string, ShebaLookupCache>;
}
