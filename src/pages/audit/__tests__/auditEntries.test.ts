import { describe, expect, it } from 'vitest';
import { describeDetails, filterEntries, groupByDay, isFiltered, toAuditEntry, NO_FILTER, type AuditEntry } from '../auditEntries';

const entry = (over: Partial<AuditEntry>): AuditEntry => ({
  id: 'e', userId: 'u1', userEmail: 'pm@example.com', action: 'insert', entityType: 'company',
  entityId: null, entityName: null, details: null, createdAt: '2026-09-10T08:05:00Z', ...over,
});
const rows = [
  entry({ id: 'e1', entityName: 'شركة الأفق', details: { name: 'شركة الأفق' }, createdAt: '2026-09-10T11:30:00Z' }),
  entry({ id: 'e2', action: 'update', entityType: 'project', entityName: 'مشروع الجسر', details: { old: { status: 'active', budget: 100 }, new: { status: 'closed', budget: 100 } } }),
  entry({ id: 'e3', action: 'update', entityType: 'user_role', userEmail: null, details: { target_email: 'x@y.com', old_role: 'viewer', new_role: 'editor', scope_type: 'company' }, createdAt: '2026-09-08T09:00:00Z' }),
  entry({ id: 'e4', action: 'delete', entityType: 'portfolio', entityName: 'محفظة الرياض', createdAt: '2026-09-08T07:00:00Z' }),
];
const ids = (list: AuditEntry[]) => list.map((e) => e.id);

describe('toAuditEntry', () => {
  it('keeps the details bag and turns a missing one into null', () => {
    expect(toAuditEntry({ ...rows[0], details: undefined }).details).toBeNull();
    expect(toAuditEntry({ ...rows[0], details: { name: 'x' } }).details).toEqual({ name: 'x' });
  });
});

describe('filterEntries and isFiltered', () => {
  it('returns everything for the empty filter, which counts as no filter', () => {
    expect(ids(filterEntries(rows, NO_FILTER))).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_FILTER, query: '   ' })).toBe(false);
    expect(isFiltered({ ...NO_FILTER, action: 'delete' })).toBe(true);
  });

  it('narrows by entity type and action together', () => {
    expect(ids(filterEntries(rows, { ...NO_FILTER, entityType: 'project' }))).toEqual(['e2']);
    expect(ids(filterEntries(rows, { ...NO_FILTER, action: 'update' }))).toEqual(['e2', 'e3']);
    expect(ids(filterEntries(rows, { ...NO_FILTER, entityType: 'project', action: 'delete' }))).toEqual([]);
  });

  it('matches the query against the actor email, the entity name and the details, trimmed and case-folded', () => {
    expect(ids(filterEntries(rows, { ...NO_FILTER, query: 'PM@EXAMPLE' }))).toEqual(['e1', 'e2', 'e4']);
    expect(ids(filterEntries(rows, { ...NO_FILTER, query: ' الأفق ' }))).toEqual(['e1']);
    expect(ids(filterEntries(rows, { ...NO_FILTER, query: 'x@y' }))).toEqual(['e3']);
    expect(ids(filterEntries(rows, { ...NO_FILTER, query: 'closed' }))).toEqual(['e2']);
  });
});

describe('groupByDay', () => {
  it('groups consecutive entries under their day, keeping the arrival order', () => {
    const groups = groupByDay(rows);
    expect(groups.map(([, list]) => ids(list))).toEqual([['e1', 'e2'], ['e3', 'e4']]);
    expect(groups[0][0]).not.toBe(groups[1][0]);
  });
});

describe('describeDetails', () => {
  it('says nothing for an empty bag and names a plain insert', () => {
    expect(describeDetails(rows[3])).toBeNull();
    expect(describeDetails(entry({ details: {} }))).toBeNull();
    expect(describeDetails(rows[0])).toBe('شركة الأفق');
  });

  it('lists only the fields an update changed, and falls back to the name when none did', () => {
    expect(describeDetails(rows[1])).toBe('status: active → closed');
    expect(describeDetails(entry({ action: 'update', details: { old: { a: 1 }, new: { a: 1 }, name: 'ثابت' } }))).toBe('ثابت');
  });

  it('spells a role change and an invite with their labels', () => {
    expect(describeDetails(rows[2])).toBe('x@y.com • مشاهد → محرر • شركة');
    expect(describeDetails(entry({ entityType: 'user_role', details: { target_email: 'a@b.c', role: 'owner', scope_type: 'galaxy' } }))).toBe('a@b.c • مالك • galaxy');
    expect(describeDetails(entry({ entityType: 'user_invite', details: { invited_email: 'n@y.com', role: 'editor', old_status: 'pending', new_status: 'accepted' } }))).toBe('n@y.com • محرر • pending → accepted');
  });
});
