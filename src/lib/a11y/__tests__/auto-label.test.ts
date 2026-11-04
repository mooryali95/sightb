import { describe, it, expect, beforeEach } from 'vitest';
import { linkNearestLabel } from '../auto-label';
import { markScrollRegions } from '../scroll-regions';

const html = (markup: string) => {
  document.body.innerHTML = markup;
  return document.body;
};

describe('linkNearestLabel', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('names a field by the label written before it in the same block', () => {
    html('<div><label>اسم المشروع</label><input id="f" /></div>');
    const input = document.getElementById('f') as HTMLInputElement;
    linkNearestLabel(input);
    const label = document.getElementById(input.getAttribute('aria-labelledby')!);
    expect(label?.textContent).toBe('اسم المشروع');
  });

  it('takes the nearest preceding label when a grid holds several pairs', () => {
    html('<div><label>البداية</label><input id="a" /><label>النهاية</label><input id="b" /></div>');
    const b = document.getElementById('b')!;
    linkNearestLabel(b);
    expect(document.getElementById(b.getAttribute('aria-labelledby')!)?.textContent).toBe('النهاية');
  });

  it('reaches one wrapper up, as when an icon sits beside the field', () => {
    html('<div><label>البحث</label><div class="relative"><input id="s" /></div></div>');
    const s = document.getElementById('s')!;
    linkNearestLabel(s);
    expect(document.getElementById(s.getAttribute('aria-labelledby')!)?.textContent).toBe('البحث');
  });

  it('never overrides a name the author gave', () => {
    html('<div><label>خطأ</label><input id="x" aria-label="صحيح" /><label for="y">مربوط</label><input id="y" /></div>');
    const x = document.getElementById('x')!;
    const y = document.getElementById('y')!;
    linkNearestLabel(x);
    linkNearestLabel(y);
    expect(x.hasAttribute('aria-labelledby')).toBe(false);
    expect(y.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('ignores a label that comes after the field, and names by content only when asked', () => {
    html('<div><button id="t"><span id="v">مبلغ مقطوع</span></button><label>بعده</label></div>');
    const t = document.getElementById('t')!;
    linkNearestLabel(t);
    expect(t.hasAttribute('aria-labelledby')).toBe(false);
    linkNearestLabel(t, true);
    expect(t.getAttribute('aria-labelledby')).toBe('v');
  });
});

describe('markScrollRegions', () => {
  it('makes an overflowing box a named, focusable region and gives it back when it fits', () => {
    const root = html('<section><h3>الدفعات</h3><div class="overflow-x-auto" id="r"><table></table></div></section>');
    const r = document.getElementById('r')!;
    let wide = true;
    Object.defineProperty(r, 'scrollWidth', { get: () => (wide ? 900 : 300) });
    Object.defineProperty(r, 'clientWidth', { get: () => 300 });

    markScrollRegions(root);
    expect(r.tabIndex).toBe(0);
    expect(r.getAttribute('role')).toBe('region');
    expect(r.getAttribute('aria-label')).toBe('الدفعات، قابل للتمرير');
    expect(r.hasAttribute('data-scroll-region')).toBe(true);

    wide = false;
    markScrollRegions(root);
    expect(r.hasAttribute('tabindex')).toBe(false);
    expect(r.hasAttribute('role')).toBe(false);
    expect(r.hasAttribute('data-scroll-region')).toBe(false);
  });

  it('leaves a box that does not overflow alone', () => {
    const root = html('<div class="overflow-x-auto" id="n"></div>');
    markScrollRegions(root);
    expect(document.getElementById('n')!.hasAttribute('tabindex')).toBe(false);
  });
});
