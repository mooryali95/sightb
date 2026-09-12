import { useEffect, useRef } from 'react';

/**
 * Auto-populates `data-label` on each <td> based on its corresponding <th>
 * text, so the table can render as stacked cards on mobile via CSS.
 *
 * Usage:
 *   const tableRef = useResponsiveTableLabels<HTMLTableElement>([deps]);
 *   <table ref={tableRef} className="data-table data-table--mobile-cards" ...>
 *
 * The last column is marked with data-cell="actions" so the CSS can style it
 * as a full-width action bar without a label.
 */
export function useResponsiveTableLabels<T extends HTMLTableElement = HTMLTableElement>(
  deps?: ReadonlyArray<unknown>,
) {
  const ref = useRef<T | null>(null);

  // Intentionally run on every render when no deps are supplied — the work is
  // idempotent and ensures newly rendered rows get labels.
  useEffect(() => {
    const table = ref.current;
    if (!table) return;

    const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
      (th.textContent || '').trim(),
    );
    if (headers.length === 0) return;

    const rows = table.querySelectorAll('tbody tr');
    rows.forEach((row) => {
      // Direct children only, without `:scope > td`: browsers resolve that
      // fine, but jsdom's selector engine rebuilds `:scope` from the row's
      // own classes and chokes on a Tailwind slash (`bg-destructive/5`),
      // which made any over-spent row throw under test.
      const cells = Array.from(row.children).filter((el): el is HTMLTableCellElement => el.tagName === 'TD');
      cells.forEach((cell, idx) => {
        const label = headers[idx] ?? '';
        if (!cell.getAttribute('data-label')) {
          cell.setAttribute('data-label', label);
        }
        // Heuristic: last column is usually actions
        if (idx === cells.length - 1 && label === '') {
          cell.setAttribute('data-cell', 'actions');
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
