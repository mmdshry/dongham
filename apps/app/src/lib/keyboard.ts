import { useEffect, useState } from 'react';

function applyInset(px: number) {
  document.documentElement.style.setProperty('--keyboard-inset', `${Math.max(0, Math.round(px))}px`);
}

export function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      const next = Math.max(0, Math.round(overlap > 40 ? overlap : 0));
      setInset(next);
      applyInset(next);
    };

    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      applyInset(0);
    };
  }, []);

  return inset;
}
