import { useState } from 'react';
import type { SongMeta } from '../../model/types';
import { Button } from '../controls';
import { Modal } from '../Modal';

type Field = { key: keyof SongMeta; label: string; placeholder?: string; max?: number; wide?: boolean; help?: string };

const FIELDS: Field[] = [
  { key: 'title', label: 'Title', wide: true },
  { key: 'subtitle', label: 'Subtitle', placeholder: 'e.g. Acoustic version', wide: true },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
  { key: 'composer', label: 'Music by' },
  { key: 'lyricist', label: 'Words by' },
  { key: 'arranger', label: 'Arranged by' },
  { key: 'tabbedBy', label: 'Tabbed by' },
  { key: 'copyright', label: 'Copyright', placeholder: 'e.g. 2026 Your Name. All rights reserved.', max: 300, wide: true, help: 'Printed at the bottom of the first PDF page.' },
  { key: 'watermark', label: 'Watermark (optional)', placeholder: 'e.g. DRAFT or your name', max: 60, wide: true, help: 'Printed faintly across every PDF page. Leave empty for none.' },
];

/** All score credits in one place. Applied as a single undoable change. */
export function SongInfoDialog({ meta, onApply, onClose }: { meta: SongMeta; onApply: (m: Partial<SongMeta>) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<SongMeta>(meta);
  const changed = FIELDS.some((f) => draft[f.key] !== meta[f.key]);

  return (
    <Modal
      title="Song info"
      onClose={onClose}
      footer={
        <>
          <span className="text-xs text-muted">Shown at the top of the sheet and in the PDF.</span>
          <div className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!changed}
            onClick={() => {
              const patch: Partial<SongMeta> = {};
              for (const f of FIELDS) if (draft[f.key] !== meta[f.key]) patch[f.key] = draft[f.key].trim();
              onApply(patch);
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <form
        className="p-5 grid grid-cols-2 gap-x-4 gap-y-3"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        {FIELDS.map((f, i) => (
          <label key={f.key} className={`flex flex-col gap-1 ${f.wide ? 'col-span-2' : ''}`}>
            <span className="label">{f.label}</span>
            <input
              autoFocus={i === 0}
              className="field"
              value={draft[f.key]}
              placeholder={f.placeholder}
              maxLength={f.max ?? 120}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            />
            {f.help && <span className="text-[11px] text-muted">{f.help}</span>}
          </label>
        ))}
      </form>
    </Modal>
  );
}
