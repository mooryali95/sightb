import { useEffect, useState, type ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SubTabDef, TabGroup, TabGroupDef } from './tabsConfig';

interface ProjectGroupTabsProps {
  groups: TabGroupDef[];
  subTabs: Record<TabGroup, SubTabDef[]>;
  activeGroup: TabGroup;
  activeTab: string;
  onGroupChange: (group: TabGroup) => void;
  onTabChange: (tab: string) => void;
  renderSection: (value: string) => ReactNode;
}

const BADGE_CLASS: Record<TabGroupDef['badgeLevel'], string> = {
  critical: 'bg-destructive text-destructive-foreground',
  warning: 'bg-warning text-warning-foreground',
  info: 'bg-primary text-primary-foreground',
};

/** The five business groups, and under each either one section or an accordion. */
export function ProjectGroupTabs({ groups, subTabs, activeGroup, activeTab, onGroupChange, onTabChange, renderSection }: ProjectGroupTabsProps) {
  return (
    <Tabs value={activeGroup} onValueChange={(v) => onGroupChange(v as TabGroup)} className="space-y-4">
      <TabsList className="sticky top-[57px] z-10 bg-muted/50 backdrop-blur-sm h-auto w-full p-1 gap-1 flex md:grid md:grid-cols-5 overflow-x-auto overflow-y-hidden snap-x snap-mandatory no-scrollbar">
        {groups.map((group) => {
          const Icon = group.icon;
          const trigger = (
            <TabsTrigger
              key={group.key}
              value={group.key}
              className="relative shrink-0 snap-start flex items-center gap-2 min-h-[44px] px-3.5 md:px-3 py-2 text-xs md:text-[13px] font-medium data-[state=active]:shadow-sm"
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="leading-tight whitespace-nowrap">{group.label}</span>
              {group.badge > 0 && (
                <span className={`min-w-[18px] h-[18px] rounded-full text-xs font-bold flex items-center justify-center px-1 ${BADGE_CLASS[group.badgeLevel]}`}>
                  {group.badge}
                </span>
              )}
            </TabsTrigger>
          );
          return group.badgeHint && group.badge > 0 ? (
            <Tooltip key={group.key}>
              <TooltipTrigger asChild>{trigger}</TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">{group.badgeHint}</TooltipContent>
            </Tooltip>
          ) : trigger;
        })}
      </TabsList>

      {groups.map((group) => {
        const sections = subTabs[group.key];
        if (sections.length === 1) {
          return (
            <TabsContent key={group.key} value={group.key} className="mt-2">
              {renderSection(sections[0].value)}
            </TabsContent>
          );
        }
        return (
          <TabsContent key={group.key} value={group.key} className="mt-2">
            <SectionAccordion sections={sections} activeTab={activeTab} onTabChange={onTabChange} renderSection={renderSection} />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

/**
 * A group's sections as an accordion that may hold several open. It opens
 * on the active section, or the first, and whenever the active section
 * changes while the group stays open (the floating button, an alert's
 * action, a shared link) that section opens too instead of only the URL
 * moving; the sections a person opened by hand stay as they are.
 */
function SectionAccordion({ sections, activeTab, onTabChange, renderSection }: {
  sections: SubTabDef[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  renderSection: (value: string) => ReactNode;
}) {
  const hostsActive = Boolean(activeTab) && sections.some((s) => s.value === activeTab);
  const [open, setOpen] = useState<string[]>(() => (hostsActive ? [activeTab] : [sections[0].value]));

  useEffect(() => {
    if (!hostsActive) return;
    setOpen((prev) => (prev.includes(activeTab) ? prev : [...prev, activeTab]));
  }, [activeTab, hostsActive]);

  return (
    <Accordion
      type="multiple"
      value={open}
      onValueChange={(vals) => {
        setOpen(vals);
        if (vals.length > 0) onTabChange(vals[vals.length - 1]);
      }}
      className="space-y-2"
    >
      {sections.map((s) => {
        const Icon = s.icon;
        return (
          <AccordionItem key={s.value} value={s.value} className="border border-border rounded-lg bg-card px-3 md:px-4">
            <AccordionTrigger className="text-sm font-semibold py-3 hover:no-underline">
              <div className="flex items-center gap-2 text-foreground">
                <Icon className="w-4 h-4 text-primary" />
                <span>{s.label}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-2 pb-4">{renderSection(s.value)}</AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
