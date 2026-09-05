import { isPeriodOwner } from '@dongham/ledger';

export type SettlementActor = {
  id: string;
  role: 'owner' | 'member' | 'viewer';
  userId?: string;
  guestKey?: string;
  ownerId?: string;
  ownerGuestKey?: string;
} | null | undefined;

function actorIsOwner(me: NonNullable<SettlementActor>): boolean {
  return isPeriodOwner({
    ownerId: me.ownerId,
    ownerGuestKey: me.ownerGuestKey,
    userId: me.userId,
    guestKey: me.guestKey,
    memberRole: me.role,
  });
}

export type PendingPaymentEdge = {
  fromMemberId: string;
  toMemberId: string;
  status?: string;
  deletedAt?: string;
};

export function canMarkPaid(me: SettlementActor, fromMemberId: string): boolean {
  if (!me || me.role === 'viewer') return false;
  return me.id === fromMemberId;
}

export function canRecordWithoutConfirm(me: SettlementActor, fromMemberId: string): boolean {
  if (!me || me.role === 'viewer') return false;
  return me.id === fromMemberId || actorIsOwner(me);
}

export function canConfirmPayment(me: SettlementActor, toMemberId: string): boolean {
  if (!me || me.role === 'viewer') return false;
  return me.id === toMemberId || actorIsOwner(me);
}

export function hasPendingForEdge(
  payments: PendingPaymentEdge[],
  fromMemberId: string,
  toMemberId: string,
): boolean {
  return payments.some(
    (p) =>
      !p.deletedAt &&
      p.status === 'pending_confirm' &&
      p.fromMemberId === fromMemberId &&
      p.toMemberId === toMemberId,
  );
}
