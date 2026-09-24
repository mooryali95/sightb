/**
 * Refuse to run inside another site's frame.
 *
 * The hosting sends neither X-Frame-Options nor a CSP frame-ancestors
 * directive, and a <meta> CSP cannot carry frame-ancestors, so this is the
 * defence the app can give itself: framed by anything but Lovable's own
 * editor preview, it renders a notice and a link that opens it on its own
 * instead of the app, so no page can lay its buttons over a signed-in
 * person's approvals and payments.
 */

/** Hosts whose framing is Lovable's editor preview, or a developer's machine. */
export function isPreviewHost(hostname: string): boolean {
  return (
    hostname === 'localhost'
    || hostname.endsWith('.lovableproject.com')
    || (hostname.endsWith('.lovable.app') && /^(id-)?preview--/.test(hostname))
  );
}

/** Whether this window sits in a frame. A frame whose parent hides itself counts as framed. */
export function isFramed(win: Window): boolean {
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}

/**
 * True when the app may render here. Otherwise it writes the notice into
 * `root` and returns false.
 */
export function allowedToRender(win: Window, root: HTMLElement | null): boolean {
  if (!isFramed(win) || isPreviewHost(win.location.hostname)) return true;
  if (root) {
    root.setAttribute('dir', 'rtl');
    root.replaceChildren();
    const box = win.document.createElement('div');
    box.setAttribute('style', 'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;font-family:system-ui,sans-serif;text-align:center');
    const title = win.document.createElement('p');
    title.textContent = 'لا يعمل النظام داخل إطار صفحة أخرى';
    title.setAttribute('style', 'font-size:1.1rem;margin:0');
    const link = win.document.createElement('a');
    link.href = win.location.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'افتح النظام في نافذة مستقلة';
    box.append(title, link);
    root.append(box);
  }
  return false;
}
