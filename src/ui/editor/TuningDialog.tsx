import { useState } from 'react';
import { Minus, Plus } from '@phosphor-icons/react';
import { findPreset, midiToPitch, pitchOptions, pitchToMidi, TUNING_PRESETS } from '../../model/tuning';
import { Button } from '../controls';
import { Modal } from '../Modal';

const PITCHES = pitchOptions();

/** Edit a track's tuning string by string, starting from any preset. */
export function TuningDialog({ tuning, onApply, onClose }: { tuning: string[]; onApply: (t: string[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(tuning);
  const preset = findPreset(draft);
  const set = (i: number, p: string) => setDraft((d) => d.map((x, j) => (j === i ? p : x)));

  return (
    <Modal
      title="Edit tuning"
      onClose={onClose}
      footer={
        <>
          <span className="text-xs text-muted">{preset ? preset.name : 'Custom tuning'}</span>
          <div className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (draft.length < tuning.length && !window.confirm('Notes on removed strings will be deleted. Continue?')) return;
              onApply(draft);
              onClose();
            }}
          >
            Apply
          </Button>
        </>
      }
    >
      <div className="p-5 flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="label">Start from a preset</span>
          <select
            className="field w-64"
            value={preset?.id ?? ''}
            onChange={(e) => {
              const p = TUNING_PRESETS.find((x) => x.id === e.target.value);
              if (p) setDraft(p.tuning);
            }}
          >
            {!preset && <option value="">Custom</option>}
            {TUNING_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="label">Strings, highest first</span>
          <div className="grid grid-cols-[24px_auto] gap-x-3 gap-y-2 items-center w-fit">
            {draft.map((p, i) => {
              const midi = pitchToMidi(p) ?? 40;
              return (
                <div key={i} className="contents">
                  <span className="text-xs text-muted font-mono text-right">{i + 1}</span>
                  <div className="flex items-center gap-1.5">
                    <Button icon={Minus} tip="Down a semitone" disabled={midi <= 23} onClick={() => set(i, midiToPitch(midi - 1))} />
                    <select className="field w-24 font-mono" value={p} onChange={(e) => set(i, e.target.value)} aria-label={`String ${i + 1} pitch`}>
                      {!PITCHES.includes(p) && <option value={p}>{p}</option>}
                      {PITCHES.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                    <Button icon={Plus} tip="Up a semitone" disabled={midi >= 76} onClick={() => set(i, midiToPitch(midi + 1))} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
