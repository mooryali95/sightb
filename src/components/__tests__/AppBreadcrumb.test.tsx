/**
 * Component tests for the top-bar breadcrumb. What must hold: it renders
 * nothing where there is nothing to climb, names the company, portfolio
 * and project chain from the store with links to every level but the
 * current one, falls back to a generic label for an unknown id, and
 * knows the fixed pages.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import type { Company, Portfolio, Project } from '@/types/project';
import { AppBreadcrumb } from '../AppBreadcrumb';

const one = <T,>(row: Partial<T>): T => row as T;
const companies = [one<Company>({ id: 'c1', name: 'شركة الأفق' })];
const portfolios = [one<Portfolio>({ id: 'pf1', companyId: 'c1', name: 'محفظة التعليم' })];
const projects = [
  one<Project>({ id: 'p1', companyId: 'c1', portfolioId: 'pf1', name: 'مشروع الرياض' }),
  one<Project>({ id: 'p2', companyId: 'c1', name: 'مشروع مستقل' }),
];

const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><AppBreadcrumb /></MemoryRouter>);
const labels = () => screen.getAllByRole('listitem').map((li) => li.textContent).filter(Boolean);
const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');

beforeEach(() => { useStore.setState({ companies, portfolios, projects }); });

describe('AppBreadcrumb', () => {
  it('renders nothing on the dashboard or an unknown page', () => {
    expect(renderAt('/').container).toBeEmptyDOMElement();
    expect(renderAt('/settings').container).toBeEmptyDOMElement();
    expect(renderAt('/project/new').container).toBeEmptyDOMElement();
  });

  it('climbs from the dashboard to a company', () => {
    renderAt('/company/c1');
    expect(labels()).toEqual(['لوحة التحكم', 'شركة الأفق']);
    expect(hrefOf('لوحة التحكم')).toBe('/');
    // The current level is a page marker, not an anchor.
    expect(screen.getByText('شركة الأفق').closest('a')).toBeNull();
    expect(screen.getByText('شركة الأفق')).toHaveAttribute('aria-current', 'page');
  });

  it('puts the company before a portfolio, with the company linked', () => {
    renderAt('/portfolio/pf1');
    expect(labels()).toEqual(['لوحة التحكم', 'شركة الأفق', 'محفظة التعليم']);
    expect(hrefOf('شركة الأفق')).toBe('/company/c1');
  });

  it('walks the whole chain to a project, and skips the portfolio for a standalone one', () => {
    renderAt('/project/p1');
    expect(labels()).toEqual(['لوحة التحكم', 'شركة الأفق', 'محفظة التعليم', 'مشروع الرياض']);
    expect(hrefOf('محفظة التعليم')).toBe('/portfolio/pf1');
    expect(screen.getByText('مشروع الرياض').closest('a')).toBeNull();

    const solo = renderAt('/project/p2');
    expect(solo.container.textContent).toContain('مشروع مستقل');
    expect(solo.container.textContent).not.toContain('محفظة التعليم');
  });

  it('falls back to a generic label for an id the store does not hold', () => {
    renderAt('/project/ghost');
    expect(labels()).toEqual(['لوحة التحكم', 'المشروع']);
    const c = renderAt('/company/ghost');
    expect(c.container.textContent).toContain('الشركة');
  });

  it('names the fixed pages', () => {
    renderAt('/users');
    expect(labels()).toEqual(['لوحة التحكم', 'إدارة المستخدمين']);
    const audit = renderAt('/audit/x');
    expect(audit.container.textContent).toContain('السجل الرئيسي');
  });
});
