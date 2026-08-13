import { describe, expect, it } from 'vitest';
import {
  canConfirmPayment,
  canMarkPaid,
  canRecordWithoutConfirm,
  hasPendingForEdge,
} from './settlementGuard';

const debtor = { id: 'hadi', role: 'member' as const };
const creditor = { id: 'sara', role: 'member' as const };
const owner = { id: 'owner', role: 'owner' as const };
const viewer = { id: 'hadi', role: 'viewer' as const };
const ownerDebtor = { id: 'hadi', role: 'owner' as const };

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
});

describe('canRecordWithoutConfirm', () => {
  it('allows the debtor or the period owner', () => {
    expect(canRecordWithoutConfirm(debtor, 'hadi')).toBe(true);
    expect(canRecordWithoutConfirm(owner, 'hadi')).toBe(true);
    expect(canRecordWithoutConfirm(ownerDebtor, 'hadi')).toBe(true);
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
