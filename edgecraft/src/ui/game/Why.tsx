import { Modal } from '../kit';
import { WHY_TEXT, WHY_TO_LAB, type WhyTopic } from '../content';
import { EXPERIMENTS } from '../../lab/experiments';

export function WhyModal({ topic, onClose, onOpenLab }: { topic: WhyTopic; onClose: () => void; onOpenLab: (exp?: number) => void }) {
  const t = WHY_TEXT[topic];
  const expId = WHY_TO_LAB[topic];
  const exp = EXPERIMENTS.find((e) => e.id === expId);
  const Comp = exp?.Component;
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={<span>Why? · {t.title}</span>}
      footer={
        <>
          <button className="btn" onClick={() => onOpenLab(expId)}>Open in Experiment Lab</button>
          <button className="btn btn-primary" onClick={onClose}>Back to the game</button>
        </>
      }
    >
      <p className="text-[14px] text-ink leading-relaxed mb-4">{t.lead}</p>
      {Comp && (
        <div className="border-t border-line pt-4">
          <div className="label mb-2">Interactive · {exp!.title}</div>
          <Comp compact />
        </div>
      )}
    </Modal>
  );
}
