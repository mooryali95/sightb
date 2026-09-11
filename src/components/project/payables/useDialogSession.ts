import { useCallback, useState } from 'react';

/**
 * The open/closed state of a dialog that owns its own form.
 *
 * `value` is what the dialog was opened on (a request id, a preset, a
 * resource id) and `null` while it is closed. `session` increments on every
 * open; the section passes it as the dialog's `key`, so React remounts the
 * dialog and its `useState` initialisers run again against the fresh value.
 * That is what lets each dialog derive its starting form from props instead
 * of the section setting eight fields by hand and resetting them on close.
 */
export function useDialogSession<T>() {
  const [value, setValue] = useState<T | null>(null);
  const [session, setSession] = useState(0);
  const open = useCallback((next: T) => {
    setValue(next);
    setSession((n) => n + 1);
  }, []);
  const close = useCallback(() => setValue(null), []);
  return { value, session, open, close };
}
