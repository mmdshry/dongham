import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  registerSW: vi.fn(),
  unregister: vi.fn(async () => true),
  cachesDelete: vi.fn(async () => true),
  cachesKeys: vi.fn(async () => ['stale-runtime']),
  reload: vi.fn(),
  getRegistrations: vi.fn(async () => [] as { unregister: () => Promise<boolean> }[]),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.isNativePlatform() },
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: unknown) => mocks.registerSW(opts),
}));

describe('initPwa', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReturnValue(false);
    mocks.registerSW.mockReset();
    mocks.unregister.mockClear();
    mocks.cachesDelete.mockClear();
    mocks.cachesKeys.mockClear();
    mocks.reload.mockReset();
    mocks.cachesKeys.mockResolvedValue(['stale-runtime']);
    mocks.getRegistrations.mockResolvedValue([]);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: globalThis,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        onLine: true,
        serviceWorker: {
          controller: null,
          getRegistrations: mocks.getRegistrations,
        },
      },
    });
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: mocks.cachesKeys,
        delete: mocks.cachesDelete,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers auto-update on the web', async () => {
    const { initPwa } = await import('./pwa');
    initPwa({ isDev: false });
    expect(mocks.registerSW).toHaveBeenCalledWith(expect.objectContaining({ immediate: true }));
    expect(mocks.unregister).not.toHaveBeenCalled();
  });

  it('unregisters leftover service workers in Vite dev and reloads', async () => {
    mocks.getRegistrations.mockResolvedValue([{ unregister: mocks.unregister }]);
    const { initPwa } = await import('./pwa');
    initPwa({ isDev: true, reload: mocks.reload });
    await vi.waitFor(() => expect(mocks.unregister).toHaveBeenCalled());
    expect(mocks.registerSW).not.toHaveBeenCalled();
    expect(mocks.cachesDelete).toHaveBeenCalledWith('stale-runtime');
    expect(mocks.reload).toHaveBeenCalled();
  });

  it('does not reload in Vite dev when no service worker is registered', async () => {
    const { initPwa } = await import('./pwa');
    initPwa({ isDev: true, reload: mocks.reload });
    await vi.waitFor(() => expect(mocks.getRegistrations).toHaveBeenCalled());
    expect(mocks.registerSW).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
  });

  it('unregisters the service worker and drops caches on Capacitor', async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.getRegistrations.mockResolvedValue([{ unregister: mocks.unregister }]);
    const { initPwa } = await import('./pwa');
    initPwa({ isDev: false, reload: mocks.reload });
    await vi.waitFor(() => expect(mocks.unregister).toHaveBeenCalled());
    expect(mocks.registerSW).not.toHaveBeenCalled();
    expect(mocks.cachesDelete).toHaveBeenCalledWith('stale-runtime');
    expect(mocks.reload).not.toHaveBeenCalled();
  });
});
