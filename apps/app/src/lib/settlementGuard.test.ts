import { describe, expect, it } from 'vitest';
import { canManagePeriod } from '@dongham/ledger';
import {
  canConfirmPayment,
  canMarkPaid,
  canRecordWithoutConfirm,
  hasPendingForEdge,
  settlementActorFrom,
  settlementLocksFromField,
} from './settlementGuard';

const debtor = { id: 'hadi', role: 'member' as const };
const creditor = { id: 'sara', role: 'member' as const };
const owner = { id: 'owner', role: 'owner' as const };
const viewer = { id: 'hadi', role: 'viewer' as const };
const ownerDebtor = { id: 'hadi', role: 'owner' as const };
const manager = { id: 'mgr', role: 'manager' as const };

describe('canMarkPaid', () => {
  it('allows only the debtor', () => {
    expect(canMarkPaid(debtor, 'hadi')).toBe(true);
    expect(canMarkPaid(creditor, 'hadi')).toBe(false);
    expect(canMarkPaid(owner, 'hadi')).toBe(false);
    expect(canMarkPaid(undefined, 'hadi')).toBe(false);
  });

  it('blocks viewers even if they are the debtor', () => {
    expect(canMarkPaid(viewer, 'hadi')).toBe(false);
  });

  it('allows every seat that belongs to the same actor', () => {
    const twoSeats = { id: 'hadi', role: 'member' as const, memberIds: ['hadi', 'hadi-phone'] };
    expect(canMarkPaid(twoSeats, 'hadi-phone')).toBe(true);
    expect(canMarkPaid(twoSeats, 'sara')).toBe(false);
  });
});

describe('canRecordWithoutConfirm', () => {
  it('allows the debtor or the period owner', () => {
    expect(canRecordWithoutConfirm(debtor, 'hadi')).toBe(true);
    expect(canRecordWithoutConfirm(owner, 'hadi')).toBe(true);
    expect(canRecordWithoutConfirm(ownerDebtor, 'hadi')).toBe(true);
    expect(canRecordWithoutConfirm(manager, 'hadi')).toBe(true);
    expect(canRecordWithoutConfirm(creditor, 'hadi')).toBe(false);
    expect(canRecordWithoutConfirm(viewer, 'hadi')).toBe(false);
  });
});

describe('canConfirmPayment', () => {
  it('allows the creditor or the period owner', () => {
    expect(canConfirmPayment(creditor, 'sara')).toBe(true);
    expect(canConfirmPayment(owner, 'sara')).toBe(true);
    expect(canConfirmPayment(debtor, 'sara')).toBe(false);
    expect(canConfirmPayment(viewer, 'sara')).toBe(false);
    expect(canConfirmPayment(undefined, 'sara')).toBe(false);
  });
});

describe('hasPendingForEdge', () => {
  const pending = {
    fromMemberId: 'hadi',
    toMemberId: 'vahid',
    status: 'pending_confirm' as const,
  };

  it('matches the same from-to pair regardless of amount', () => {
    expect(hasPendingForEdge([pending], 'hadi', 'vahid')).toBe(true);
    expect(hasPendingForEdge([pending], 'hadi', 'sara')).toBe(false);
    expect(hasPendingForEdge([pending], 'sara', 'vahid')).toBe(false);
  });

  it('ignores settled, deleted, and other statuses', () => {
    expect(hasPendingForEdge([{ ...pending, status: 'settled' }], 'hadi', 'vahid')).toBe(false);
    expect(hasPendingForEdge([{ ...pending, deletedAt: '2026-01-01' }], 'hadi', 'vahid')).toBe(false);
    expect(hasPendingForEdge([], 'hadi', 'vahid')).toBe(false);
  });
});

describe('settlementActorFrom', () => {
  it('collects userId and same-phone seats like the API', () => {
    const me = settlementActorFrom(
      [
        { id: 'own-1', role: 'owner', userId: 'u1', phone: '09121111111' },
        { id: 'seat-2', role: 'member', phone: '09121111111' },
        { id: 'other', role: 'member', phone: '09123333333' },
      ],
      { userId: 'u1', phone: '09121111111' },
      { ownerId: 'u1' },
    );
    expect(me?.id).toBe('own-1');
    expect(me?.role).toBe('owner');
    expect(me?.memberIds).toEqual(['own-1', 'seat-2']);
    expect(canMarkPaid(me, 'seat-2')).toBe(true);
  });
});

describe('settlementLocksFromField', () => {
  it('locks a member to their own debtor field, not a manager', () => {
    expect(settlementLocksFromField('settlement', 'member')).toBe(true);
    expect(settlementLocksFromField('settlement', 'manager')).toBe(false);
    expect(settlementLocksFromField('settlement', 'owner')).toBe(false);
    expect(settlementLocksFromField('loan', 'member')).toBe(false);
    expect(settlementLocksFromField('settlement', 'member', 2)).toBe(false);
    expect(canManagePeriod('manager')).toBe(true);
  });
});
