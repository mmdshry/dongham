import { Capacitor } from '@capacitor/core';
import { useEffect, useState } from 'react';

function applyInset(px: number) {
  document.documentElement.style.setProperty('--keyboard-inset', `${Math.max(0, Math.round(px))}px`);
}

export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let removeListeners: (() => void) | undefined;

    const set = (px: number) => {
      if (cancelled) return;
      const next = Math.max(0, Math.round(px));
      setInset(next);
      applyInset(next);
    };

    void (async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const { Keyboard } = await import('@capacitor/keyboard');
          const show = await Keyboard.addListener('keyboardWillShow', (e) => set(e.keyboardHeight));
          const hide = await Keyboard.addListener('keyboardWillHide', () => set(0));
          if (cancelled) {
            void show.remove();
            void hide.remove();
            return;
          }
          removeListeners = () => {
            void show.remove();
            void hide.remove();
          };
          return;
        } catch {
          /* fall through to visualViewport */
        }
      }

      if (cancelled) return;
      const vv = window.visualViewport;
      if (!vv) return;
      const sync = () => {
        const overlap = window.innerHeight - vv.height - vv.offsetTop;
        set(overlap > 40 ? overlap : 0);
      };
      vv.addEventListener('resize', sync);
      vv.addEventListener('scroll', sync);
      removeListeners = () => {
        vv.removeEventListener('resize', sync);
        vv.removeEventListener('scroll', sync);
      };
    })();

    return () => {
      cancelled = true;
      removeListeners?.();
      applyInset(0);
    };
  }, []);

  return inset;
}
