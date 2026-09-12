import { useState } from 'react';

/** Which rows of a column are expanded. */
export function useOpenSet() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    const n = new Set(open);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setOpen(n);
  };
  return { isOpen: (id: string) => open.has(id), toggle };
}
