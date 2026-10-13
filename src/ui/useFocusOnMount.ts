import { useEffect, useRef } from 'react';

/**
 * Returns a ref that takes focus when the component mounts and whenever `deps` change. Screens
 * use it on their heading so that focus does not fall to the body when the focused control
 * unmounts (WCAG 2.4.3). The element needs `tabIndex={-1}` to be focusable.
 */
export function useFocusOnMount<T extends HTMLElement>(
  deps: readonly unknown[],
  enabled: boolean = true,
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (enabled) ref.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller chooses the deps
  }, deps);
  return ref;
}
