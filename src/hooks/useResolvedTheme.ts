import { useEffect, useState } from 'react';

export type ResolvedTheme = 'light' | 'dark';

function currentResolvedTheme(): ResolvedTheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * The theme actually in effect, resolving `system` to a concrete value.
 *
 * Watches the class on `<html>` rather than reading the store, so it reports the
 * truth for `system` as well as an explicit choice, and stays correct if the OS
 * preference changes mid-session. The canvas needs this because it has to
 * re-resolve its palette from CSS variables whenever the theme flips.
 */
export function useResolvedTheme(): ResolvedTheme {
  const [theme, setTheme] = useState<ResolvedTheme>(currentResolvedTheme);

  useEffect(() => {
    const root = document.documentElement;

    const observer = new MutationObserver(() => {
      setTheme((prev) => {
        const next = currentResolvedTheme();
        return next === prev ? prev : next;
      });
    });

    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
