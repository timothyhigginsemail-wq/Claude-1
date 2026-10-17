import { Modal } from '../kit';
import { WHY_TEXT, type WhyTopic } from '../content';

export function WhyModal({ topic, onClose }: { topic: WhyTopic; onClose: () => void }) {
  const t = WHY_TEXT[topic];
  return (
    <Modal open onClose={onClose} title={<span>Why? · {t.title}</span>} footer={<button className="btn btn-primary" onClick={onClose}>Back to trading</button>}>
      <p className="text-[14px] text-ink leading-relaxed">{t.lead}</p>
    </Modal>
  );
}
