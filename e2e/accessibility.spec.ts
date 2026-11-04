import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect, type Page } from '@playwright/test';
import { stubSupabase } from './support/stub';
import { COMPANY_ID, PROJECT_ID } from './support/seed';

/**
 * Every main page passes axe-core on the rules a screen reader or a weak eye
 * depends on: every button and field has a name, every progress bar and chart
 * says what it shows, every scrolled region can be reached by keyboard, and
 * text meets WCAG AA contrast. Run on a phone and a desktop, light and dark,
 * so a fix in one theme cannot hide a regression in the other.
 */
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const RULES = [
  'button-name', 'link-name', 'label', 'select-name', 'input-button-name',
  'aria-progressbar-name', 'svg-img-alt', 'role-img-alt', 'image-alt',
  'scrollable-region-focusable', 'color-contrast', 'aria-command-name',
  'aria-toggle-field-name', 'aria-input-field-name', 'nested-interactive',
];

const ROUTES: Record<string, string> = {
  dashboard: '/',
  finance: '/finance',
  company: `/company/${COMPANY_ID}`,
  project: `/project/${PROJECT_ID}`,
  'project-finance': `/project/${PROJECT_ID}?group=finance&tab=expenses`,
  'project-funds': `/project/${PROJECT_ID}?group=finance&tab=funds`,
  alerts: '/alerts',
  users: '/users',
  security: '/security',
  audit: '/audit',
  organize: '/organize',
  'mobile-expense': '/m/expense/new',
  'new-project': '/project/new',
};

async function scan(page: Page) {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async (rules) => {
    // @ts-expect-error axe is injected above
    const r = await window.axe.run(document, { runOnly: { type: 'rule', values: rules }, resultTypes: ['violations'] });
    type Node = { target: string[]; html: string; any: { data?: { fgColor?: string; bgColor?: string; contrastRatio?: number } }[] };
    return r.violations.map((v: { id: string; nodes: Node[] }) => ({
      id: v.id,
      nodes: v.nodes.map((n) => {
        const c = n.any[0]?.data;
        const contrast = c?.contrastRatio ? ` [${c.fgColor} on ${c.bgColor} = ${c.contrastRatio}]` : '';
        return `${n.target.join(' ')} :: ${n.html.replace(/class="[^"]*"/g, '').slice(0, 200)}${contrast}`;
      }),
    }));
  }, RULES);
}

for (const [view, size] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test.describe(`${view} ${theme}`, () => {
      test.use({ viewport: size, colorScheme: theme });
      for (const [name, path] of Object.entries(ROUTES)) {
        test(`${name} has no accessibility violations`, async ({ page }) => {
          await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
          await stubSupabase(page);
          await page.goto(path);
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(600);
          const violations = await scan(page);
          expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
        });
      }
    });
  }
}
