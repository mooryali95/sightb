import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { buildSubTabs } from '../tabsConfig';
import { useProjectTabs } from '../useProjectTabs';

function setup(url = '/project/p1') {
  const wrapper = ({ children }: { children: React.ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
  return renderHook(() => ({ tabs: useProjectTabs(buildSubTabs(true)), search: useLocation().search }), { wrapper });
}

describe('useProjectTabs', () => {
  it('opens on the summary, or on the group and tab the URL names', () => {
    expect(setup().result.current.tabs).toMatchObject({ activeGroup: 'summary', activeTab: 'overview' });
    expect(setup('/project/p1?group=finance&tab=funds').result.current.tabs).toMatchObject({ activeGroup: 'finance', activeTab: 'funds' });
  });

  it('opens a group on its first section and writes both to the URL in one step', () => {
    const { result } = setup();
    act(() => result.current.tabs.changeGroup('finance'));
    expect(result.current.tabs).toMatchObject({ activeGroup: 'finance', activeTab: 'expenses' });
    expect(result.current.search).toBe('?group=finance&tab=expenses');
  });

  it('finds the group a section lives in, and keeps the group when a tab alone changes', () => {
    const { result } = setup();
    act(() => result.current.tabs.navigateToTab('risks'));
    expect(result.current.tabs).toMatchObject({ activeGroup: 'management', activeTab: 'risks' });
    act(() => result.current.tabs.setActiveTab('changeorders'));
    expect(result.current.tabs).toMatchObject({ activeGroup: 'management', activeTab: 'changeorders' });
    expect(result.current.search).toBe('?group=management&tab=changeorders');
  });

  it('keeps unrelated params and leaves an unknown section where it is', () => {
    const { result } = setup('/project/p1?x=1');
    act(() => result.current.tabs.navigateToTab('nowhere'));
    expect(result.current.tabs).toMatchObject({ activeGroup: 'summary', activeTab: 'nowhere' });
    expect(result.current.search).toBe('?x=1&tab=nowhere');
  });
});
