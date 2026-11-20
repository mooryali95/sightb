/**
 * The line a section shows when a period is selected and its figures are
 * for the whole life of each project all the same. Spend against budget is
 * read over the project's life, as on the project page; a section that
 * therefore does not follow the period says so instead of silently
 * differing from the cards above it.
 */
export function LifetimeNote({ timePeriod, className = '' }: { timePeriod?: string; className?: string }) {
  if (!timePeriod || timePeriod === 'all') return null;
  return (
    <p role="note" data-lifetime-note className={`text-[11px] text-muted-foreground ${className}`}>
      أرقام هذا القسم لعمر المشروع كله، لا للفترة المحددة
    </p>
  );
}
