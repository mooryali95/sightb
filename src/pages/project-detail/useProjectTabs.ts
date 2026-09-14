import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SubTabDef, TabGroup } from './tabsConfig';

export interface ProjectTabs {
  activeGroup: TabGroup;
  activeTab: string;
  /** Sets one or both, and writes both to the URL in a single update. */
  applyTabs: (next: { group?: TabGroup; tab?: string }) => void;
  setActiveTab: (tab: string) => void;
  /** Opens a group on its first section. */
  changeGroup: (group: TabGroup) => void;
  /** Opens a section wherever it lives. */
  navigateToTab: (tab: string) => void;
}

/**
 * The open group and section, mirrored in the URL so a refresh or a shared
 * link lands on the same view. Both params are written in one update: two
 * functional writes in one event each build on the params the render saw,
 * so the second would drop the first.
 */
export function useProjectTabs(subTabs: Record<TabGroup, SubTabDef[]>): ProjectTabs {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeGroup, setActiveGroupState] = useState<TabGroup>((searchParams.get('group') as TabGroup) || 'summary');
  const [activeTab, setActiveTabState] = useState(searchParams.get('tab') || 'overview');

  const applyTabs = (next: { group?: TabGroup; tab?: string }) => {
    if (next.group) setActiveGroupState(next.group);
    if (next.tab) setActiveTabState(next.tab);
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      if (next.group) n.set('group', next.group);
      if (next.tab) n.set('tab', next.tab);
      return n;
    }, { replace: true });
  };

  return {
    activeGroup,
    activeTab,
    applyTabs,
    setActiveTab: (tab) => applyTabs({ tab }),
    changeGroup: (group) => applyTabs({ group, tab: subTabs[group][0]?.value }),
    navigateToTab: (tab) => {
      const group = (Object.keys(subTabs) as TabGroup[]).find((g) => subTabs[g].some((t) => t.value === tab));
      applyTabs({ group, tab });
    },
  };
}
