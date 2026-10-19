import { SHORTCUTS } from '../editor/keymap';
import { Modal } from './Modal';

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="p-4 grid grid-cols-1 gap-5">
        {SHORTCUTS.map((g) => (
          <section key={g.group}>
            <h3 className="heading mb-2">{g.group}</h3>
            <dl className="grid grid-cols-[170px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              {g.items.map(([keys, desc]) => (
                <div key={keys} className="contents">
                  <dt className="font-mono text-xs text-accent-text">{keys}</dt>
                  <dd className="m-0">{desc}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
