/** Names and choices for the ledger's sides: the company, its projects, its people. */
import type { LedgerNode, Party } from '@/lib/finance/company-ledger';
import { PARTY_KIND_LABELS } from '@/lib/finance/company-ledger';

export interface LedgerProject { id: string; name: string; weight: number }

export const COMPANY_LABEL = 'المنظومة';

export function nodeName(node: LedgerNode, parties: Party[], projects: LedgerProject[]): string {
  if (node.kind === 'company') return COMPANY_LABEL;
  if (node.kind === 'project') return projects.find((p) => p.id === node.id)?.name ?? 'مشروع محذوف';
  return parties.find((p) => p.id === node.id)?.name ?? 'طرف محذوف';
}

export function nodeTag(node: LedgerNode, parties: Party[]): string {
  if (node.kind === 'company') return 'الشركة';
  if (node.kind === 'project') return 'مشروع';
  const p = parties.find((x) => x.id === node.id);
  return p ? PARTY_KIND_LABELS[p.kind] : 'طرف';
}

/** `company`, `project:<id>` or `party:<id>`, for a select's value. */
export const encodeNode = (n: LedgerNode) => (n.kind === 'company' ? 'company' : `${n.kind}:${n.id}`);
export function decodeNode(v: string): LedgerNode {
  if (v === 'company') return { kind: 'company', id: null };
  const [kind, id] = v.split(':');
  return { kind: kind as LedgerNode['kind'], id };
}

export function nodeOptions(parties: Party[], projects: LedgerProject[]): { value: string; label: string; group: string }[] {
  return [
    { value: 'company', label: COMPANY_LABEL, group: 'الشركة' },
    ...projects.map((p) => ({ value: `project:${p.id}`, label: p.name, group: 'المشاريع' })),
    ...parties.filter((p) => !p.archived).map((p) => ({ value: `party:${p.id}`, label: p.name, group: PARTY_KIND_LABELS[p.kind] })),
  ];
}
