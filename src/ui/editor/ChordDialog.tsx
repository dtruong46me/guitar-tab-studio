import { useState } from 'react';
import { Button } from '../controls';
import { Modal } from '../Modal';

const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const QUALITIES = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'add9'];

/** Pick or type the chord name shown above the selected beat. */
export function ChordDialog({ current, used, onApply, onClose }: { current?: string; used: string[]; onApply: (chord: string | undefined) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(current ?? '');
  const apply = (name: string) => {
    onApply(name.trim() || undefined);
    onClose();
  };
  return (
    <Modal
      title="Chord name"
      onClose={onClose}
      footer={
        <>
          {current && (
            <Button variant="danger" onClick={() => apply('')}>
              Remove chord
            </Button>
          )}
          <div className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => apply(draft)}>
            Apply
          </Button>
        </>
      }
    >
      <div className="p-5 flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="label">Chord</span>
          <input
            autoFocus
            className="field w-48 font-semibold"
            value={draft}
            maxLength={16}
            placeholder="e.g. Am7, F#m, G/B"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && apply(draft)}
          />
          <span className="text-[11px] text-muted">Shown above the staff from this beat. Press Enter to apply.</span>
        </label>
        {used.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="label">In this song</span>
            <div className="flex flex-wrap gap-1">
              {used.map((c) => (
                <Button key={c} size="sm" pressed={c === current} onClick={() => apply(c)}>
                  {c}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <span className="label">Common chords</span>
          <div className="grid grid-cols-7 gap-1">
            {QUALITIES.flatMap((q) =>
              ROOTS.map((r) => (
                <Button key={r + q} size="sm" pressed={r + q === current} onClick={() => apply(r + q)} className="justify-center">
                  {r + q}
                </Button>
              )),
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Chord names already used in a track, in order of first appearance. */
export function usedChords(beats: { chord?: string }[]): string[] {
  return [...new Set(beats.flatMap((b) => (b.chord ? [b.chord] : [])))].slice(0, 24);
}
