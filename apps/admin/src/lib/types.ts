export type AdminUser = {
  id: string;
  phone?: string;
  email?: string;
  hasGoogle?: boolean;
  displayName: string;
  createdAt: string;
  deletedAt?: string;
  bannedAt?: string;
  plan: 'free' | 'premium';
  premiumUntil?: string;
};

export type AdminStats = {
  usersActive: number;
  usersDeleted: number;
  usersPremium: number;
  periods: number;
  expenses: number;
  payments: number;
  sessions: number;
  zarinpalPending: number;
  telegramLinks: number;
  health: { ok: boolean; service: string };
};

export type PeriodListItem = {
  id: string;
  title: string;
  currency: string;
  ownerId: string;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  visibility?: 'private' | 'public';
  kind?: string;
  template?: string;
  encrypted?: boolean;
  memberCount: number;
  expenseCount: number;
};

export type Member = {
  id: string;
  periodId: string;
  userId?: string;
  displayName: string;
  role: 'owner' | 'member' | 'viewer';
  phone?: string;
  email?: string;
};

export type Expense = {
  id: string;
  periodId: string;
  title: string;
  amount: number;
  currency: string;
  note?: string;
  createdAt: string;
  deletedAt?: string;
  attachmentId?: string;
  hasAttachment?: boolean;
};

export type Payment = {
  id: string;
  periodId: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
  currency: string;
  kind: 'settlement' | 'loan';
  status?: string;
  note?: string;
  deletedAt?: string;
};

export type AuditRow = {
  id: string;
  actorUserId: string;
  actorPhone?: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
};

export type BillingEvent = {
  id: string;
  userId: string;
  source: 'bazaar' | 'myket' | 'zarinpal' | 'admin';
  sku?: string;
  amount?: number;
  until: string;
  createdAt: string;
};

export type RecurringRule = {
  id: string;
  periodId: string;
  title: string;
  amount: number;
  currency: string;
  nextAt: string;
  active: boolean;
  cadence?: string;
  intervalDays: number;
};

export type InviteRow = {
  token: string;
  periodId: string;
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
};

export type AttachmentRow = {
  id: string;
  periodId: string;
  mime: string;
  createdAt: string;
  bytes: number;
};

export type ChatRow = {
  id: string;
  periodId: string;
  senderMemberId: string;
  body: string;
  createdAt: string;
};

export type AdminSettings = {
  envAdminPhones: string[];
  extraAdminPhones: string[];
  senator: { configured: boolean; amount?: number; error?: string };
  fx: { rates: Record<string, number>; fetchedAt: string; source?: string } | null;
  sessions: number;
  otpsActive: number;
};
