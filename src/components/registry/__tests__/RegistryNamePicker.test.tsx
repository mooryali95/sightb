import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import type { Party } from '@/lib/finance/company-ledger';
import { RegistryNamePicker, type RegistryName } from '../RegistryNamePicker';

const parties: Party[] = [
  { id: 'p-anwar', companyId: 'c1', name: 'د أنور أسعد', kind: 'person', archived: false, role: 'مستشار', aliases: [] },
  { id: 'p-omar', companyId: 'c1', name: 'عمر', kind: 'vendor', archived: false, aliases: ['عمر الحربي'] },
  { id: 'p-old', companyId: 'c1', name: 'أنور القديم', kind: 'person', archived: true, aliases: [] },
];
const state = { data: parties as Party[] };
vi.mock('@/hooks/useParties', () => ({ useParties: () => ({ data: state.data, isSuccess: true }) }));
vi.mock('@/pages/company/registry/PartyFormDialog', () => ({
  PartyFormDialog: ({ open, initial }: { open: boolean; initial?: { name?: string } }) =>
    open ? <div role="dialog">إضافة {initial?.name}</div> : null,
}));

beforeAll(() => {
  // cmdk scrolls the active item into view; jsdom has no layout.
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

function Harness({ onChange }: { onChange: (v: RegistryName, p?: Party) => void }) {
  const [v, setV] = useState<RegistryName>({ text: '' });
  return <RegistryNamePicker companyId="c1" ariaLabel="المورّد" value={v} onChange={(n, p) => { setV(n); onChange(n, p); }} />;
}

const open = () => fireEvent.click(screen.getByRole('combobox', { name: 'المورّد' }));
const search = (q: string) => fireEvent.change(screen.getByLabelText('بحث في سجل الموارد'), { target: { value: q } });

describe('RegistryNamePicker', () => {
  it('finds a person however the name is spelled and links the pick', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    open(); search('دأنور');
    expect(screen.queryByText('أنور القديم')).toBeNull();
    fireEvent.click(screen.getByText('د أنور أسعد'));
    expect(onChange).toHaveBeenLastCalledWith({ text: 'د أنور أسعد', partyId: 'p-anwar' }, parties[0]);
    expect(screen.getByRole('combobox')).toHaveTextContent('من السجل');
  });

  it('finds by alias, and keeps an unknown name as text or offers to add it', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    open(); search('الحربي');
    expect(screen.getByText('عمر')).toBeInTheDocument();
    search('سعيد');
    fireEvent.click(screen.getByText(/استخدام «سعيد» كنص فقط/));
    expect(onChange).toHaveBeenLastCalledWith({ text: 'سعيد' }, undefined);
    expect(screen.getByRole('combobox')).toHaveTextContent('نص فقط');
    open(); search('سعيد');
    fireEvent.click(screen.getByText(/إضافة «سعيد» إلى السجل/));
    expect(screen.getByRole('dialog')).toHaveTextContent('إضافة سعيد');
  });

  it('does not offer to add a name the registry already has', () => {
    render(<Harness onChange={vi.fn()} />);
    open(); search('عمر');
    expect(screen.queryByText(/إضافة «عمر» إلى السجل/)).toBeNull();
  });

  it('is a plain input while the registry is empty', () => {
    state.data = [];
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('المورّد'), { target: { value: 'مورد' } });
    expect(onChange).toHaveBeenLastCalledWith({ text: 'مورد' }, undefined);
    state.data = parties;
  });
});
