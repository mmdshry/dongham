import { describe, expect, it } from 'vitest';
import { parsePeriodTab, periodChatHref, periodTabSearch } from './periodTabs';

describe('parsePeriodTab', () => {
  it('keeps known tabs', () => {
    expect(parsePeriodTab('chat')).toBe('chat');
    expect(parsePeriodTab('balance')).toBe('balance');
    expect(parsePeriodTab('settings')).toBe('settings');
    expect(parsePeriodTab('more')).toBe('settings');
  });

  it('falls back to expenses', () => {
    expect(parsePeriodTab(null)).toBe('expenses');
    expect(parsePeriodTab('nope')).toBe('expenses');
    expect(parsePeriodTab('')).toBe('expenses');
  });
});

describe('periodTabSearch', () => {
  it('omits the default expenses tab from the query', () => {
    expect(periodTabSearch('expenses')).toBe('');
    expect(periodTabSearch('chat')).toBe('chat');
    expect(periodTabSearch('settings')).toBe('settings');
  });
});

describe('periodChatHref', () => {
  it('opens the chat tab', () => {
    expect(periodChatHref('abc12xy')).toBe('/periods/abc12xy?tab=chat');
  });
});
