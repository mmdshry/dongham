import { describe, expect, it } from 'vitest';
import {
  canConfirmPayment,
  canMarkPaid,
  canRecordWithoutConfirm,
  hasPendingForEdge,
  settlementWriteDenial,
} from './settlement.js';

const debtor = { memberIds: ['hadi'], role: 'member' as const };
const creditor = { memberIds: ['sara'], role: 'member' as const };
const owner = { memberIds: ['owner'], role: 'owner' as const };
const manager = { memberIds: ['mgr'], role: 'manager' as const };
const viewer = { memberIds: ['hadi'], role: 'viewer' as const };
const twoRows = { memberIds: ['hadi', 'hadi-phone'], role: 'member' as const };

describe('settlement predicates', () => {
  it('only the debtor may mark as paid', () => {
    expect(canMarkPaid(debtor, 'hadi')).toBe(true);
    expect(canMarkPaid(twoRows, 'hadi-phone')).toBe(true);
    expect(canMarkPaid(creditor, 'hadi')).toBe(false);
    expect(canMarkPaid(owner, 'hadi')).toBe(false);
    expect(canMarkPaid(viewer, 'hadi')).toBe(false);
    expect(canMarkPaid(null, 'hadi')).toBe(false);
  });

  it('debtor, owner or manager record without confirmation', () => {
    expect(canRecordWithoutConfirm(debtor, 'hadi')).toBe(true);
    expect(canRecordWithoutConfirm(owner, 'hadi')).toBe(true);
    expect(canRecordWithoutConfirm(manager, 'hadi')).toBe(true);
    expect(canRecordWithoutConfirm(creditor, 'hadi')).toBe(false);
    expect(canRecordWithoutConfirm(viewer, 'hadi')).toBe(false);
  });

  it('creditor, owner or manager confirm', () => {
    expect(canConfirmPayment(creditor, 'sara')).toBe(true);
    expect(canConfirmPayment(owner, 'sara')).toBe(true);
    expect(canConfirmPayment(manager, 'sara')).toBe(true);
    expect(canConfirmPayment(debtor, 'sara')).toBe(false);
    expect(canConfirmPayment(undefined, 'sara')).toBe(false);
  });

  it('matches pending edges by pair only', () => {
    const pending = { fromMemberId: 'hadi', toMemberId: 'sara', status: 'pending_confirm' };
    expect(hasPendingForEdge([pending], 'hadi', 'sara')).toBe(true);
    expect(hasPendingForEdge([pending], 'sara', 'hadi')).toBe(false);
    expect(hasPendingForEdge([{ ...pending, status: 'settled' }], 'hadi', 'sara')).toBe(false);
    expect(hasPendingForEdge([{ ...pending, deletedAt: 'x' }], 'hadi', 'sara')).toBe(false);
  });
});

describe('settlementWriteDenial', () => {
  const edge = { fromMemberId: 'hadi', toMemberId: 'sara' };

  it('loans are not gated beyond write access', () => {
    expect(settlementWriteDenial(creditor, { ...edge, kind: 'loan', status: 'settled' })).toBeNull();
  });

  it('creating a settled payment needs the debtor or a manager', () => {
    expect(settlementWriteDenial(debtor, { ...edge, kind: 'settlement', status: 'settled' })).toBeNull();
    expect(settlementWriteDenial(owner, { ...edge, kind: 'settlement', status: 'settled' })).toBeNull();
    expect(settlementWriteDenial(creditor, { ...edge, kind: 'settlement', status: 'settled' })).toBe('debtor_only');
    expect(settlementWriteDenial(viewer, { ...edge, kind: 'settlement' })).toBe('participants_only');
  });

  it('pending claims come only from the debtor', () => {
    expect(settlementWriteDenial(debtor, { ...edge, kind: 'settlement', status: 'pending_confirm' })).toBeNull();
    expect(settlementWriteDenial(owner, { ...edge, kind: 'settlement', status: 'pending_confirm' })).toBe('debtor_only');
  });

  it('confirming needs the creditor or a manager', () => {
    const prev = { ...edge, kind: 'settlement' as const, status: 'pending_confirm' as const };
    const confirm = { ...edge, kind: 'settlement' as const, status: 'settled' as const };
    expect(settlementWriteDenial(creditor, confirm, prev)).toBeNull();
    expect(settlementWriteDenial(manager, confirm, prev)).toBeNull();
    expect(settlementWriteDenial(debtor, confirm, prev)).toBe('creditor_only');
  });

  it('editing an existing payment is limited to its parties or a manager', () => {
    const prev = { ...edge, kind: 'settlement' as const, status: 'settled' as const };
    const stranger = { memberIds: ['ali'], role: 'member' as const };
    expect(settlementWriteDenial(debtor, prev, prev)).toBeNull();
    expect(settlementWriteDenial(creditor, prev, prev)).toBeNull();
    expect(settlementWriteDenial(owner, prev, prev)).toBeNull();
    expect(settlementWriteDenial(stranger, prev, prev)).toBe('participants_only');
  });
});
