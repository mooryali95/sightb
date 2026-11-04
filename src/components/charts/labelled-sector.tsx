import { Sector } from 'recharts';

type SectorShapeProps = React.ComponentProps<typeof Sector> & { name?: string; percent?: number };

/**
 * Recharts draws every pie slice as `role="img"` with no name, so a screen
 * reader met a row of unnamed images. Each slice now says what it is and its
 * share: «تشغيل ٤٠٪» reads as «تشغيل 40%».
 */
export function labelledSector(props: SectorShapeProps) {
  const share = typeof props.percent === 'number' ? ` ${Math.round(props.percent * 100)}%` : '';
  return <Sector {...props} aria-label={`${props.name ?? ''}${share}`.trim()} />;
}

/**
 * Recharts applies a custom slice only while some slice is "active", so the
 * index is pinned at -1 (none active) and both shapes are the labelled one;
 * hovering still works, since the hovered slice is drawn the same way.
 */
export const labelledSlices = { activeIndex: -1, activeShape: labelledSector, inactiveShape: labelledSector } as const;

/**
 * Slice names go in the legend, not on the ring, where they clipped and
 * overlapped on a phone. `share` reads «مصروف (3%)», `count` «تشغيل (1)».
 */
export function pieLegendText(mode: 'share' | 'count') {
  return (name: string, entry: { payload?: { percent?: number; value?: number } }) => (
    <span className="text-xs text-foreground">
      {name} ({mode === 'share' ? `${Math.round((entry.payload?.percent ?? 0) * 100)}%` : entry.payload?.value ?? 0})
    </span>
  );
}
