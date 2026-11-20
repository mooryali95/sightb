import { describe, it, expect } from 'vitest';
import { visibleTools, strongestRole, describeRoles, TOOLS } from '../settings-access';

const keys = (a: { isAdmin: boolean; isOwner: boolean }) => visibleTools(a).map((t) => t.key);

describe('which tools the settings page offers', () => {
  it('gives a viewer or editor only the pages every signed-in person may open', () => {
    expect(keys({ isAdmin: false, isOwner: false })).toEqual(['finance', 'alerts', 'organize', 'security']);
  });

  it('adds user management for an admin, and nothing an owner alone may open', () => {
    const k = keys({ isAdmin: true, isOwner: false });
    expect(k).toContain('users');
    expect(k).not.toContain('controlCenter');
    expect(k).not.toContain('audit');
    expect(k).not.toContain('errors');
  });

  it('gives the owner every tool', () => {
    expect(keys({ isAdmin: true, isOwner: true })).toHaveLength(TOOLS.length);
  });

  it('keeps each tool on the audience its own page admits', () => {
    const audience = Object.fromEntries(TOOLS.map((t) => [t.path, t.audience]));
    expect(audience['/users']).toBe('admin');
    expect(audience['/control-center']).toBe('owner');
    expect(audience['/audit']).toBe('owner');
    expect(audience['/errors']).toBe('owner');
  });
});

describe('reading a person’s roles', () => {
  it('names the strongest role held anywhere', () => {
    expect(strongestRole([{ role: 'viewer' }, { role: 'editor' }])).toBe('editor');
    expect(strongestRole([{ role: 'admin' }, { role: 'owner' }])).toBe('owner');
    expect(strongestRole([])).toBeNull();
  });

  it('names the company or project each role covers, strongest first', () => {
    const lines = describeRoles(
      [
        { role: 'viewer', scopeType: 'project', scopeId: 'p1' },
        { role: 'editor', scopeType: 'company', scopeId: 'c1' },
        { role: 'admin', scopeType: 'system', scopeId: null },
      ],
      { company: (id) => (id === 'c1' ? 'شركة الأفق' : undefined), project: (id) => (id === 'p1' ? 'مشروع الجسر' : undefined) },
    );
    expect(lines.map((l) => `${l.label} — ${l.scope}`)).toEqual([
      'أدمن — كل النظام', 'محرر — شركة: شركة الأفق', 'مشاهد — مشروع: مشروع الجسر',
    ]);
  });
});
