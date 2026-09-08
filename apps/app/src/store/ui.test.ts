import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildToast, TOAST_DURATION_MS } from '../lib/toast';
import { useUiStore } from './ui';

describe('ui toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUiStore.getState().setToast(null);
  });

  afterEach(() => {
    useUiStore.getState().setToast(null);
    vi.useRealTimers();
  });

  it('stores kind and message', () => {
    useUiStore.getState().setToast('خطا', 'error');
    const toast = useUiStore.getState().toast;
    expect(toast?.message).toBe('خطا');
    expect(toast?.kind).toBe('error');
  });

  it('replaces the previous toast and clears the old timer', () => {
    useUiStore.getState().setToast('اول', 'info');
    const firstId = useUiStore.getState().toast?.id;
    vi.advanceTimersByTime(1000);
    useUiStore.getState().setToast('دوم', 'success');
    expect(useUiStore.getState().toast?.message).toBe('دوم');
    expect(useUiStore.getState().toast?.id).not.toBe(firstId);
    vi.advanceTimersByTime(TOAST_DURATION_MS.success - 1);
    expect(useUiStore.getState().toast?.message).toBe('دوم');
    vi.advanceTimersByTime(2);
    expect(useUiStore.getState().toast).toBeNull();
  });

  it('clears immediately on null', () => {
    useUiStore.getState().setToast('x', 'error');
    useUiStore.getState().setToast(null);
    expect(useUiStore.getState().toast).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(useUiStore.getState().toast).toBeNull();
  });

  it('does not auto-dismiss sticky toasts', () => {
    useUiStore.getState().setToast('صف', 'warn', { sticky: true });
    vi.advanceTimersByTime(20_000);
    expect(useUiStore.getState().toast?.message).toBe('صف');
    expect(useUiStore.getState().toast?.sticky).toBe(true);
  });
});

describe('buildToast', () => {
  it('makes toasts with actions sticky', () => {
    const toast = buildToast('اعمال تبدیل', 'warn', { action: { label: 'اعمال', onClick: () => undefined } });
    expect(toast.sticky).toBe(true);
    expect(toast.actions).toHaveLength(1);
  });
});
