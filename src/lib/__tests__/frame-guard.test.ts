import { describe, it, expect } from 'vitest';
import { allowedToRender, isFramed, isPreviewHost } from '../frame-guard';

/** A window at `href`, framed or not; `topThrows` for a parent that hides itself. */
function fakeWindow(href: string, framed: boolean, topThrows = false): Window {
  const self = {} as Window;
  const top = framed ? ({} as Window) : self;
  return Object.defineProperties(self, {
    self: { get: () => self },
    top: { get: () => { if (topThrows) throw new Error('blocked'); return top; } },
    location: { get: () => new URL(href) },
    document: { get: () => document },
  });
}

describe('isPreviewHost', () => {
  it("allows Lovable's editor previews and a developer's machine", () => {
    expect(isPreviewHost('id-preview--8e5cefc0.lovable.app')).toBe(true);
    expect(isPreviewHost('preview--sightb.lovable.app')).toBe(true);
    expect(isPreviewHost('8e5cefc0.lovableproject.com')).toBe(true);
    expect(isPreviewHost('localhost')).toBe(true);
  });

  it('does not allow the published site or anything else', () => {
    expect(isPreviewHost('sight.basserh.com')).toBe(false);
    expect(isPreviewHost('sightb.lovable.app')).toBe(false);
    expect(isPreviewHost('evil-preview--x.example.com')).toBe(false);
    expect(isPreviewHost('127.0.0.1')).toBe(false);
  });
});

describe('isFramed', () => {
  it('reads a hidden parent as framed', () => {
    expect(isFramed(fakeWindow('https://sight.basserh.com/', false))).toBe(false);
    expect(isFramed(fakeWindow('https://sight.basserh.com/', true))).toBe(true);
    expect(isFramed(fakeWindow('https://sight.basserh.com/', true, true))).toBe(true);
  });
});

describe('allowedToRender', () => {
  it('renders when loaded directly', () => {
    const root = document.createElement('div');
    expect(allowedToRender(fakeWindow('https://sight.basserh.com/login', false), root)).toBe(true);
    expect(root.childNodes).toHaveLength(0);
  });

  it('renders framed inside the editor preview', () => {
    const root = document.createElement('div');
    expect(allowedToRender(fakeWindow('https://id-preview--8e5cefc0.lovable.app/', true), root)).toBe(true);
    expect(root.childNodes).toHaveLength(0);
  });

  it('framed by another site, writes the notice and a link that opens the app on its own', () => {
    const root = document.createElement('div');
    root.innerHTML = '<p>app</p>';
    expect(allowedToRender(fakeWindow('https://sight.basserh.com/login', true), root)).toBe(false);
    expect(root.textContent).toContain('لا يعمل النظام داخل إطار صفحة أخرى');
    expect(root.textContent).not.toContain('app');
    const link = root.querySelector('a')!;
    expect(link.href).toBe('https://sight.basserh.com/login');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  });
});
