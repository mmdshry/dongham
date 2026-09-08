import type { DbShape } from './types.js';

export const emptyDb = (): DbShape => ({
  users: [],
  sessions: [],
  periods: [],
  members: [],
  expenses: [],
  payments: [],
  invites: [],
  chat: [],
  friends: [],
  attachments: [],
  otps: [],
  notifications: [],
  recurring: [],
  activity: [],
  zarinpalPending: [],
  shebaLookups: [],
  adminAudit: [],
  impersonationTickets: [],
  billingEvents: [],
  platformSettings: { extraAdminPhones: [] },
});
