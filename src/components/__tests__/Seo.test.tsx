/**
 * Unit tests for the head tags. What must hold: each route gets its own
 * title and description, only the public welcome page is indexable, the
 * canonical URL is the site plus the matched path, and an unknown route
 * falls back to the generic tags with the welcome page as canonical.
 * Helmet writes the head asynchronously, so every read waits for it.
 */
import { describe, it, expect } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { Seo } from '../Seo';

const meta = (selector: string) => document.head.querySelector(`meta[${selector}]`)?.getAttribute('content') ?? null;
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;

async function headAt(path: string) {
  cleanup();
  render(<HelmetProvider><MemoryRouter initialEntries={[path]}><Seo /></MemoryRouter></HelmetProvider>);
  await waitFor(() => expect(canonical()).toContain(path === '/' ? 'basserh.com/' : path.split('/')[1]));
  return { title: document.title, description: meta('name="description"'), robots: meta('name="robots"'), canonical: canonical() };
}

describe('Seo', () => {
  it('lets the welcome page be indexed and marks every signed-in page noindex', async () => {
    const welcome = await headAt('/welcome');
    expect(welcome.title).toBe('رؤية بصيرة — منصة إدارة المحافظ والمشاريع المالية');
    expect(welcome.robots).toBeNull();
    expect(welcome.canonical).toBe('https://sight.basserh.com/welcome');

    const dashboard = await headAt('/');
    expect(dashboard.title).toBe('لوحة التحكم — رؤية بصيرة');
    expect(dashboard.robots).toBe('noindex, follow');
    expect(dashboard.canonical).toBe('https://sight.basserh.com/');
  });

  it('matches the detail routes by pattern and keeps the real path as canonical', async () => {
    const project = await headAt('/project/abc-123');
    expect(project.title).toBe('تفاصيل المشروع — رؤية بصيرة');
    expect(project.canonical).toBe('https://sight.basserh.com/project/abc-123');
    expect(meta('property="og:url"')).toBe('https://sight.basserh.com/project/abc-123');
    expect((await headAt('/company/c1')).title).toBe('تفاصيل الشركة — رؤية بصيرة');
    expect((await headAt('/portfolio/p1')).title).toBe('تفاصيل المحفظة — رؤية بصيرة');
    expect((await headAt('/users')).title).toBe('إدارة المستخدمين — رؤية بصيرة');
  });

  it('mirrors the title and description into the Open Graph and Twitter tags', async () => {
    const login = await headAt('/login');
    await waitFor(() => expect(meta('property="og:title"')).toBe('تسجيل الدخول — رؤية بصيرة'));
    expect(meta('name="twitter:title"')).toBe('تسجيل الدخول — رؤية بصيرة');
    expect(meta('property="og:site_name"')).toBe('رؤية بصيرة');
    expect(meta('property="og:description"')).toBe(login.description);
    expect(login.description).toMatch(/^سجّل الدخول/);
  });

  it('falls back to the generic tags and the welcome canonical for a route it does not know', async () => {
    cleanup();
    render(<HelmetProvider><MemoryRouter initialEntries={['/project/abc/extra']}><Seo /></MemoryRouter></HelmetProvider>);
    await waitFor(() => expect(document.title).toBe('رؤية بصيرة — إدارة المحافظ والمشاريع المالية'));
    expect(meta('name="robots"')).toBe('noindex, follow');
    expect(canonical()).toBe('https://sight.basserh.com/welcome');
  });
});
