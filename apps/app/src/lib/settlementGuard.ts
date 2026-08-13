export type SettlementActor = {
  id: string;
  role: 'owner' | 'member' | 'viewer';
} | null | undefined;

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
  return me.id === fromMemberId || me.role === 'owner';
}

export function canConfirmPayment(me: SettlementActor, toMemberId: string): boolean {
  if (!me || me.role === 'viewer') return false;
  return me.id === toMemberId || me.role === 'owner';
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
