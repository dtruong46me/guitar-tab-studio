import { useMemo, useState } from 'react';
import type { Song } from '../model/types';
import { paginate, type Orientation } from '../pdf/paginate';
import { SvgOps } from '../render/SvgOps';
import { Icon } from './icons';
import { Modal } from './Modal';

interface Props {
  song: Song;
  track: number;
  onClose: () => void;
  onExported: (name: string) => void;
  onError: (msg: string) => void;
}

/** Print preview drawn from the same paginated ops the PDF writer uses. */
export function PrintPreview({ song, track, onClose, onExported, onError }: Props) {
  const [orientation, setOrientation] = useState<Orientation>('portrait');
  const [scope, setScope] = useState<'current' | 'all'>('current');
  const [busy, setBusy] = useState(false);
  const tracks = useMemo(() => (scope === 'all' ? song.tracks.map((_, i) => i) : [track]), [scope, song.tracks, track]);
  const pages = useMemo(() => paginate(song, { orientation, tracks }), [song, orientation, tracks]);
  const pageW = orientation === 'portrait' ? 560 : 780;

  const exportFile = async () => {
    setBusy(true);
    try {
      // jsPDF is loaded on demand to keep the editor bundle small.
      const { pagesToPdf, pdfFileName } = await import('../pdf/pdfWriter');
      const doc = pagesToPdf(pages, song);
      const name = pdfFileName(song);
      doc.save(name);
      onExported(name);
    } catch (e) {
      onError(`PDF export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Print preview"
      onClose={onClose}
      wide
      footer={
        <>
          <div className="seg" role="group" aria-label="Orientation">
            <button className="!font-sans" aria-pressed={orientation === 'portrait'} onClick={() => setOrientation('portrait')} title="A4 portrait">
              A4 portrait
            </button>
            <button className="!font-sans" aria-pressed={orientation === 'landscape'} onClick={() => setOrientation('landscape')} title="A4 landscape">
              A4 landscape
            </button>
          </div>
          {song.tracks.length > 1 && (
            <div className="seg" role="group" aria-label="Tracks to print">
              <button className="!font-sans" aria-pressed={scope === 'current'} onClick={() => setScope('current')}>
                {song.tracks[track].name}
              </button>
              <button className="!font-sans" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
                All tracks
              </button>
            </div>
          )}
          <span className="text-xs text-muted">
            {pages.length} {pages.length === 1 ? 'page' : 'pages'} · vector PDF
          </span>
          <div className="flex-1" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={exportFile} disabled={busy} autoFocus>
            {Icon.download} {busy ? 'Exporting…' : 'Export PDF'}
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-6 py-6 bg-bg0 min-h-full">
        {pages.map((p) => (
          <figure key={p.number} className="m-0 flex flex-col items-center gap-2">
            <svg
              width={pageW}
              height={(pageW * p.height) / p.width}
              viewBox={`0 0 ${p.width} ${p.height}`}
              style={{ background: 'var(--sheet)', boxShadow: 'var(--shadow-sheet)', borderRadius: 2 }}
              role="img"
              aria-label={`Page ${p.number} of ${pages.length}`}
            >
              <SvgOps ops={p.ops} mode="print" />
            </svg>
            <figcaption className="text-[11px] text-muted">
              Page {p.number} of {pages.length}
            </figcaption>
          </figure>
        ))}
      </div>
    </Modal>
  );
}
