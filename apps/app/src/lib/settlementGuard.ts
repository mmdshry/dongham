import {
  canConfirmPayment as ledgerCanConfirm,
  canManagePeriod,
  canMarkPaid as ledgerCanMarkPaid,
  canRecordWithoutConfirm as ledgerCanRecord,
  isPeriodOwner,
  memberBelongsToActor,
  type MemberRole,
  type SettlementActor as LedgerActor,
} from '@dongham/ledger';

export { hasPendingForEdge } from '@dongham/ledger';
export type { PendingPaymentEdge } from '@dongham/ledger';

/** The local "me" member plus every other seat that belongs to the same person. */
export type SettlementActor = {
  id: string;
  role: MemberRole;
  memberIds?: readonly string[];
  userId?: string;
  guestKey?: string;
  ownerId?: string;
  ownerGuestKey?: string;
} | null | undefined;

/**
 * Adapter to the shared rule set in `@dongham/ledger`. A member row marked
 * `owner` only counts as owner when it really is the period owner; otherwise it
 * is a plain member (same as the server's `periodRole`).
 */
function toLedgerActor(me: SettlementActor): LedgerActor {
  if (!me) return null;
  const owner = isPeriodOwner({
    ownerId: me.ownerId,
    ownerGuestKey: me.ownerGuestKey,
    userId: me.userId,
    guestKey: me.guestKey,
    memberRole: me.role,
  });
  const role: MemberRole = owner ? 'owner' : me.role === 'owner' ? 'member' : me.role;
  const memberIds = me.memberIds?.length ? [...new Set(me.memberIds)] : [me.id];
  return { memberIds, role };
}

export function canMarkPaid(me: SettlementActor, fromMemberId: string): boolean {
  return ledgerCanMarkPaid(toLedgerActor(me), fromMemberId);
}

export function canRecordWithoutConfirm(me: SettlementActor, fromMemberId: string): boolean {
  return ledgerCanRecord(toLedgerActor(me), fromMemberId);
}

export function canConfirmPayment(me: SettlementActor, toMemberId: string): boolean {
  return ledgerCanConfirm(toLedgerActor(me), toMemberId);
}

/** Owner/manager may pick any debtor; a plain member's «از» stays on their own seat(s). */
export function settlementLocksFromField(
  kind: 'settlement' | 'loan',
  role: MemberRole | null | undefined,
  selfSeatCount = 1,
): boolean {
  if (kind !== 'settlement') return false;
  if (canManagePeriod(role)) return false;
  return selfSeatCount <= 1;
}

type Seat = {
  id: string;
  role: MemberRole;
  userId?: string;
  guestKey?: string;
  phone?: string;
  email?: string;
};

type ProfileMatch = {
  userId?: string;
  guestKey?: string;
  phone?: string;
  email?: string;
} | null | undefined;

type PeriodOwner = {
  ownerId?: string;
  ownerGuestKey?: string;
} | null | undefined;

/** Primary seat (userId, then guestKey) plus every matching row — same as API `actorMemberIds`. */
export function settlementActorFrom(
  members: readonly Seat[],
  profile: ProfileMatch,
  period?: PeriodOwner,
): NonNullable<SettlementActor> | undefined {
  if (!profile) return undefined;
  const mine = members.filter((m) => memberBelongsToActor(m, profile));
  if (!mine.length) return undefined;
  const primary =
    mine.find((m) => profile.userId && m.userId === profile.userId) ||
    mine.find((m) => profile.guestKey && m.guestKey === profile.guestKey) ||
    mine[0];
  const owner = isPeriodOwner({
    ownerId: period?.ownerId,
    ownerGuestKey: period?.ownerGuestKey,
    userId: profile.userId,
    guestKey: profile.guestKey,
    memberRole: primary.role,
  });
  const role: MemberRole = owner ? 'owner' : primary.role === 'owner' ? 'member' : primary.role;
  return {
    id: primary.id,
    role,
    memberIds: mine.map((m) => m.id),
    userId: profile.userId,
    guestKey: profile.guestKey,
    ownerId: period?.ownerId,
    ownerGuestKey: period?.ownerGuestKey,
  };
}
