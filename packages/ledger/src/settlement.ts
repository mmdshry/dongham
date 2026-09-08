import { canManagePeriod } from './ownership.js';
import type { MemberRole, SettlementStatus } from './types.js';

/**
 * Who the actor is inside one period: every member row that belongs to them
 * (a cloud user can match several rows by userId / phone / email) plus the
 * effective role the server or client resolved for them.
 */
export type SettlementActor =
  | {
      memberIds: readonly string[];
      role: MemberRole | null | undefined;
    }
  | null
  | undefined;

export type SettlementDenial = 'debtor_only' | 'creditor_only' | 'participants_only';

export const SETTLEMENT_DENIAL_MESSAGE: Record<SettlementDenial, string> = {
  debtor_only: 'فقط بدهکار می‌تواند این پرداخت را ثبت کند',
  creditor_only: 'فقط طلبکار می‌تواند تأیید کند',
  participants_only: 'فقط طرف‌های پرداخت یا مدیر دوره می‌توانند آن را تغییر دهند',
};

function active(actor: SettlementActor): actor is NonNullable<SettlementActor> {
  return Boolean(actor && actor.role && actor.role !== 'viewer');
}

function isSelf(actor: NonNullable<SettlementActor>, memberId: string): boolean {
  return actor.memberIds.includes(memberId);
}

/** Owner or manager may act on behalf of any member. */
function privileged(actor: NonNullable<SettlementActor>): boolean {
  return canManagePeriod(actor.role);
}

/** Debtor says «پرداختم» and waits for the creditor to confirm. */
export function canMarkPaid(actor: SettlementActor, fromMemberId: string): boolean {
  if (!active(actor)) return false;
  return isSelf(actor, fromMemberId);
}

/** Debtor, owner or manager records a settled payment without confirmation. */
export function canRecordWithoutConfirm(actor: SettlementActor, fromMemberId: string): boolean {
  if (!active(actor)) return false;
  return isSelf(actor, fromMemberId) || privileged(actor);
}

/** Creditor, owner or manager confirms a pending payment. */
export function canConfirmPayment(actor: SettlementActor, toMemberId: string): boolean {
  if (!active(actor)) return false;
  return isSelf(actor, toMemberId) || privileged(actor);
}

export type PendingPaymentEdge = {
  fromMemberId: string;
  toMemberId: string;
  status?: string;
  deletedAt?: string;
};

export function hasPendingForEdge(
  payments: readonly PendingPaymentEdge[],
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

export type SettlementWrite = {
  kind?: 'loan' | 'settlement';
  status?: SettlementStatus;
  fromMemberId: string;
  toMemberId: string;
};

function isPendingStatus(status: SettlementStatus | undefined): boolean {
  return status === 'pending_confirm' || status === 'sent';
}

/**
 * Single rule set for creating / editing / confirming a payment. Returns `null`
 * when allowed. Loans are only gated by period write access, like the UI.
 */
export function settlementWriteDenial(
  actor: SettlementActor,
  next: SettlementWrite,
  prev?: SettlementWrite | null,
): SettlementDenial | null {
  const kind = next.kind || prev?.kind || 'settlement';
  if (kind !== 'settlement') return null;
  if (!active(actor)) return 'participants_only';
  const status = next.status || 'settled';
  if (!prev) {
    if (isPendingStatus(status)) return canMarkPaid(actor, next.fromMemberId) ? null : 'debtor_only';
    return canRecordWithoutConfirm(actor, next.fromMemberId) ? null : 'debtor_only';
  }
  const confirming = isPendingStatus(prev.status) && status === 'settled';
  if (confirming) return canConfirmPayment(actor, prev.toMemberId) ? null : 'creditor_only';
  const party = isSelf(actor, prev.fromMemberId) || isSelf(actor, prev.toMemberId) || privileged(actor);
  return party ? null : 'participants_only';
}
