import { describe, expect, it } from 'vitest';
import {
  hasUnreadChat,
  hasUnseenPeriodActivity,
  periodActivityTimestamps,
  periodHasAttention,
} from './periodAttention';

describe('hasUnreadChat', () => {
  const msgs = [
    { senderMemberId: 'me', createdAt: '2026-09-08T12:00:00.000Z' },
    { senderMemberId: 'you', createdAt: '2026-09-08T13:00:00.000Z' },
  ];

  it('is false when muted, missing lastRead, or only own messages are new', () => {
    // lastReadAt is seeded on join; until that exists we do not paint historical chat red.
    expect(hasUnreadChat({ messages: msgs, selfMemberIds: ['me'], lastReadAt: '2026-09-08T12:30:00.000Z', muted: true })).toBe(
      false,
    );
    expect(hasUnreadChat({ messages: msgs, selfMemberIds: ['me'], lastReadAt: null })).toBe(false);
    expect(
      hasUnreadChat({
        messages: [{ senderMemberId: 'me', createdAt: '2026-09-08T14:00:00.000Z' }],
        selfMemberIds: ['me'],
        lastReadAt: '2026-09-08T12:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('is true when someone else wrote after lastRead', () => {
    expect(hasUnreadChat({ messages: msgs, selfMemberIds: ['me'], lastReadAt: '2026-09-08T12:30:00.000Z' })).toBe(true);
  });
});

describe('hasUnseenPeriodActivity', () => {
  it('ignores history until lastSeenAt is set, then flags later events', () => {
    expect(hasUnseenPeriodActivity({ timestamps: ['2026-09-08T12:00:00.000Z'] })).toBe(false);
    expect(
      hasUnseenPeriodActivity({
        lastSeenAt: '2026-09-08T12:00:00.000Z',
        timestamps: ['2026-09-08T11:00:00.000Z', '2026-09-08T13:00:00.000Z'],
      }),
    ).toBe(true);
    expect(
      hasUnseenPeriodActivity({
        lastSeenAt: '2026-09-08T14:00:00.000Z',
        timestamps: ['2026-09-08T13:00:00.000Z'],
      }),
    ).toBe(false);
  });
});

describe('periodActivityTimestamps', () => {
  it('collects expense/payment/activity/lifecycle times and skips chat', () => {
    const times = periodActivityTimestamps({
      expenses: [{ createdAt: 'e1', updatedAt: 'e2' }],
      payments: [{ createdAt: 'p1', deletedAt: 'p2' }],
      activity: [{ createdAt: 'a1' }],
      completedAt: 'c1',
      deletedAt: 'd1',
    });
    expect(times).toEqual(['e1', 'e2', 'p1', 'p2', 'a1', 'c1', 'd1']);
  });
});

describe('periodHasAttention', () => {
  it('is true when either flag is set', () => {
    expect(periodHasAttention(true, false)).toBe(true);
    expect(periodHasAttention(false, true)).toBe(true);
    expect(periodHasAttention(false, false)).toBe(false);
  });
});
