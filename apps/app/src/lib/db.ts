import Dexie, { type Table } from 'dexie';
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

export type { SplitMode, RecurringCadence, SettlementStatus, IndexAsset };

export type Charge = { type: 'none' | 'percent' | 'amount'; value: number };

export const noneCharge = (): Charge => ({ type: 'none', value: 0 });

export interface PayoutMethod {
  id: string;
  label?: string;
  cardNumber?: string;
  sheba?: string;
  cardHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  isDefault?: boolean;
}

export interface LocalProfile {
  id: string; // 'self'
  guestKey: string;
  displayName: string;
  userId?: string;
  token?: string;
  phone?: string;
  email?: string;
  usePersianDigits: boolean;
  cardNumber?: string;
  sheba?: string;
  cardHolderName?: string;
  bankName?: string;
  payoutMethods?: PayoutMethod[];
  plan?: 'free' | 'premium';
  premiumUntil?: string;
  debtReminders?: boolean;
  calendarMode?: 'jalali' | 'gregorian';
  autoSync?: boolean;
  prefsUpdatedAt?: string;
  payoutDirty?: boolean;
  avatarDataUrl?: string;
  avatarPreset?: string;
  username?: string;
  profileCoverPreset?: string;
  profileCoverDataUrl?: string;
}

export interface LocalPeriod {
  id: string;
  title: string;
  currency: string;
  baseCurrency: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  synced: boolean;
  ownerGuestKey?: string;
  encrypted?: boolean;
  kind: PeriodKind;
  bankerMemberId?: string;
  template: PeriodTemplate;
  roundTo: RoundTo;
  buildingCharge?: number;
  lunchTurnMemberId?: string;
  visibility?: 'private' | 'public';
  ownerId?: string;
  coverPreset?: string;
  coverDataUrl?: string;
}

export interface LocalMember {
  id: string;
  periodId: string;
  displayName: string;
  guestKey?: string;
  userId?: string;
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

export interface LocalExpense {
  id: string;
  periodId: string;
  title: string;
  amount: number;
  currency: string;
  payerId: string;
  payers: { memberId: string; amount: number }[];
  splitMode: SplitMode;
  shares: { memberId: string; value: number; excluded?: boolean }[];
  tax: Charge;
  service: Charge;
  tip: Charge;
  tags: string[];
  note?: string;
  attachmentId?: string;
  attachmentDataUrl?: string;
  fxRate: number;
  createdAt: string;
  occurredAt: string;
  updatedAt: string;
  deletedAt?: string;
  version: number;
}

export interface LocalPayment {
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

export interface LocalChat {
  id: string;
  periodId: string;
  senderMemberId: string;
  body: string;
  expenseId?: string;
  createdAt: string;
  synced: boolean;
}

export interface OutboxItem {
  id?: number;
  periodId: string;
  entity: 'expense' | 'payment' | 'member' | 'chat' | 'period' | 'activity' | 'recurring';
  action: 'upsert' | 'delete';
  payload: unknown;
  createdAt: string;
  tries: number;
}

export interface LocalFriend {
  id: string;
  displayName: string;
  phone?: string;
  email?: string;
  friendUserId?: string;
}

export interface LocalInvite {
  token: string;
  periodId: string;
  createdAt: string;
  expiresAt?: string;
}

export interface LocalRecurring {
  id: string;
  periodId: string;
  title: string;
  amount: number;
  currency: string;
  payerId: string;
  splitMode: SplitMode;
  shares: LocalExpense['shares'];
  intervalDays: number;
  cadence?: RecurringCadence;
  nextAt: string;
  active: boolean;
}

export interface LocalNotification {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface LocalActivity {
  id: string;
  periodId: string;
  actorName: string;
  action: string;
  summary: string;
  createdAt: string;
  entityId?: string;
}

export interface LocalAvatar {
  userId: string;
  dataUrl: string;
  updatedAt: string;
}

class DonghamDB extends Dexie {
  profile!: Table<LocalProfile, string>;
  periods!: Table<LocalPeriod, string>;
  members!: Table<LocalMember, string>;
  expenses!: Table<LocalExpense, string>;
  payments!: Table<LocalPayment, string>;
  chat!: Table<LocalChat, string>;
  outbox!: Table<OutboxItem, number>;
  friends!: Table<LocalFriend, string>;
  invites!: Table<LocalInvite, string>;
  recurring!: Table<LocalRecurring, string>;
  notifications!: Table<LocalNotification, string>;
  activity!: Table<LocalActivity, string>;
  avatars!: Table<LocalAvatar, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super('dongham');
    this.version(1).stores({
      profile: 'id',
      periods: 'id, updatedAt',
      members: 'id, periodId',
      expenses: 'id, periodId, updatedAt, title',
      payments: 'id, periodId, updatedAt',
      chat: 'id, periodId, createdAt',
      outbox: '++id, periodId, createdAt',
      friends: 'id',
      invites: 'token, periodId',
      recurring: 'id, periodId',
      notifications: 'id, createdAt',
      meta: 'key',
    });
    this.version(2)
      .stores({
        profile: 'id',
        periods: 'id, updatedAt',
        members: 'id, periodId',
        expenses: 'id, periodId, updatedAt, title',
        payments: 'id, periodId, updatedAt',
        chat: 'id, periodId, createdAt',
        outbox: '++id, periodId, createdAt',
        friends: 'id',
        invites: 'token, periodId',
        recurring: 'id, periodId',
        notifications: 'id, createdAt',
        activity: 'id, periodId, createdAt',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        await tx
          .table('periods')
          .toCollection()
          .modify((p: LocalPeriod) => {
            if (!p.kind) p.kind = 'split';
            if (!p.template) p.template = 'custom';
            if (p.roundTo === undefined) p.roundTo = 0;
          });
        await tx
          .table('expenses')
          .toCollection()
          .modify((e: LocalExpense) => {
            if (!e.service) e.service = noneCharge();
            if (!e.tip) e.tip = noneCharge();
            if (!e.payers) e.payers = [];
            if (!e.occurredAt) e.occurredAt = e.createdAt;
          });
        await tx
          .table('profile')
          .toCollection()
          .modify((p: LocalProfile) => {
            if (!p.plan) p.plan = 'free';
          });
      });
    this.version(3).upgrade(async (tx) => {
      await tx
        .table('recurring')
        .toCollection()
        .modify((r: LocalRecurring) => {
          if (!r.cadence) {
            r.cadence =
              r.intervalDays >= 50 ? 'jalaliBimonthly' : r.intervalDays >= 28 ? 'jalaliMonthly' : 'days';
          }
        });
      await tx
        .table('payments')
        .toCollection()
        .modify((p: LocalPayment) => {
          if (!p.status) p.status = 'settled';
          if (!p.indexAsset) p.indexAsset = 'none';
        });
      await tx
        .table('profile')
        .toCollection()
        .modify((p: LocalProfile) => {
          if (!p.payoutMethods) p.payoutMethods = [];
          if (p.debtReminders === undefined) p.debtReminders = true;
        });
    });
    this.version(4).upgrade(async (tx) => {
      await tx
        .table('periods')
        .toCollection()
        .modify((p: LocalPeriod) => {
          if (!p.visibility) p.visibility = 'private';
        });
    });
    this.version(5).upgrade(async (tx) => {
      await tx
        .table('profile')
        .toCollection()
        .modify((p: LocalProfile) => {
          if (!p.calendarMode) p.calendarMode = 'jalali';
        });
    });
    this.version(6).stores({
      avatars: 'userId',
    });
    this.version(7).upgrade(async (tx) => {
      await tx
        .table('profile')
        .toCollection()
        .modify((p: LocalProfile) => {
          if (p.autoSync === undefined && p.token) p.autoSync = true;
        });
    });
  }
}

export const db = new DonghamDB();

export const POT_DISPLAY_NAME = '?????';
