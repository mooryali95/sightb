import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectGroupTabs } from '../ProjectGroupTabs';
import { buildSubTabs, buildTabGroups, type TabGroup } from '../tabsConfig';

const quiet = { count: 0, level: 'info' as const, hint: '' };
const groups = buildTabGroups({ planning: quiet, finance: quiet, tracking: quiet, management: quiet });
const subTabs = buildSubTabs(true);

function setup(activeGroup: TabGroup, activeTab: string, onTabChange = vi.fn()) {
  const props = {
    groups, subTabs, activeGroup, activeTab, onGroupChange: vi.fn(), onTabChange,
    renderSection: (value: string) => <p>قسم {value}</p>,
  };
  const view = render(<ProjectGroupTabs {...props} />);
  return { ...view, onTabChange, rerender: (tab: string) => view.rerender(<ProjectGroupTabs {...props} activeTab={tab} />) };
}
const trigger = (label: string) => screen.getByRole('button', { name: label });

describe('ProjectGroupTabs', () => {
  it('opens a group on its active section, or its first', () => {
    setup('management', 'risks');
    expect(trigger('المخاطر')).toHaveAttribute('aria-expanded', 'true');
    expect(trigger('أوامر التغيير')).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the section the active tab moves to while the group stays open, keeping what was open', () => {
    const { rerender } = setup('management', 'changeorders');
    expect(trigger('أوامر التغيير')).toHaveAttribute('aria-expanded', 'true');
    expect(trigger('المخاطر')).toHaveAttribute('aria-expanded', 'false');
    rerender('risks');
    expect(trigger('المخاطر')).toHaveAttribute('aria-expanded', 'true');
    expect(trigger('أوامر التغيير')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('قسم risks')).toBeInTheDocument();
  });

  it('reports the section a person opens by hand, and closing one leaves the rest', () => {
    const { onTabChange } = setup('finance', 'expenses');
    fireEvent.click(trigger('الموازنة'));
    expect(onTabChange).toHaveBeenLastCalledWith('budget');
    expect(trigger('الموازنة')).toHaveAttribute('aria-expanded', 'true');
    expect(trigger('المصروفات')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(trigger('المصروفات'));
    expect(trigger('المصروفات')).toHaveAttribute('aria-expanded', 'false');
    expect(trigger('الموازنة')).toHaveAttribute('aria-expanded', 'true');
  });
});
