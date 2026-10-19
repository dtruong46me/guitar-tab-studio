import { memo, useMemo } from 'react';
import type { Song } from '../model/types';
import { drawSystem } from '../layout/draw';
import { layoutTrack } from '../layout/layout';
import { SvgOps } from '../render/SvgOps';

/** The first staff row of a song, rendered with the real notation engine. */
export const TabThumbnail = memo(function TabThumbnail({ song, width = 520 }: { song: Song; width?: number }) {
  const { ops, height } = useMemo(() => {
    const layout = layoutTrack(song, 0, { width, gap: 9 });
    const sys = layout.systems[0];
    return { ops: drawSystem(song, layout, sys), height: sys.height };
  }, [song, width]);
  return (
    <svg viewBox={`-8 -4 ${width + 16} ${height + 8}`} className="w-full h-auto block" aria-hidden="true">
      <SvgOps ops={ops} />
    </svg>
  );
});
