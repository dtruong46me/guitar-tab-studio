import { useMemo, useState } from 'react';
import type { Song } from '../model/types';
import { paginate, type Orientation } from '../pdf/paginate';
import { SvgOps } from '../render/SvgOps';
import { DownloadSimple } from '@phosphor-icons/react';
import { Button, Segmented } from './controls';
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
          <Segmented
            label="Page orientation"
            value={orientation}
            onChange={setOrientation}
            options={[
              { value: 'portrait', label: 'A4 portrait' },
              { value: 'landscape', label: 'A4 landscape' },
            ]}
          />
          {song.tracks.length > 1 && (
            <Segmented
              label="Tracks to print"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'current', label: song.tracks[track].name },
                { value: 'all', label: 'All tracks' },
              ]}
            />
          )}
          <span className="text-xs text-muted">
            {pages.length} {pages.length === 1 ? 'page' : 'pages'} · vector PDF
          </span>
          <div className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={DownloadSimple} onClick={exportFile} disabled={busy}>
            {busy ? 'Exporting...' : 'Download PDF'}
          </Button>
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
