import * as React from 'react';

/**
 * Most forms here place a visible `<Label>` beside its field without
 * `htmlFor`, so a screen reader announced the field with no name. Rather than
 * thread ids through every form, a field with no name of its own looks for
 * the nearest label written before it in the same block (its parent, or the
 * parent's parent when the field sits in a wrapper) and points at it.
 *
 * A field that already has a name (aria-label, aria-labelledby, or a label
 * bound by `for`) is left alone, so an explicit choice always wins. When no
 * label is found, `fallbackToContent` names the element by its own text: a
 * select trigger then reads its current value, which beats silence.
 */
export function linkNearestLabel(el: HTMLElement | null, fallbackToContent = false): void {
  if (!el || el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) return;
  const bound = (el as HTMLInputElement).labels;
  if (bound && bound.length > 0) return;

  let scope: HTMLElement | null = el.parentElement;
  for (let depth = 0; scope && depth < 2; depth++, scope = scope.parentElement) {
    const before = Array.from(scope.children).filter(
      (c): c is HTMLLabelElement =>
        c instanceof HTMLLabelElement &&
        !c.htmlFor &&
        !!c.textContent?.trim() &&
        (c.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    );
    const label = before[before.length - 1];
    if (label) {
      if (!label.id) label.id = `lbl-${Math.random().toString(36).slice(2, 10)}`;
      el.setAttribute('aria-labelledby', label.id);
      return;
    }
  }

  if (fallbackToContent) {
    // Point at the element that shows the current value; the name follows it as it changes.
    const shown = el.querySelector<HTMLElement>('span') ?? el;
    if (!shown.id) shown.id = `ctl-${Math.random().toString(36).slice(2, 10)}`;
    el.setAttribute('aria-labelledby', shown.id);
  }
}

/** A ref that forwards to `forwarded` and links the nearest label on mount. */
export function useAutoLabel<T extends HTMLElement>(
  forwarded: React.ForwardedRef<T>,
  fallbackToContent = false,
): React.RefCallback<T> {
  return React.useCallback(
    (node: T | null) => {
      if (typeof forwarded === 'function') forwarded(node);
      else if (forwarded) forwarded.current = node;
      linkNearestLabel(node, fallbackToContent);
    },
    [forwarded, fallbackToContent],
  );
}
