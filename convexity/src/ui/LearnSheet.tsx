import { useState } from 'react';
import { GameState } from '../engine/game';
import { TOPICS, topicById } from '../engine/learn';
import { store } from './store';
import { Sheet } from './common';

type Layer = 'intuition' | 'trader' | 'quant';

export function LearnSheet({ g, topic }: { g: GameState; topic?: string }) {
  const [layer, setLayer] = useState<Layer>('intuition');
  if (!topic) return <Library />;
  const t = topicById(topic);
  const live = t.live?.(g);
  const body = t[layer];
  return (
    <Sheet title={t.title} sub={t.group} right={<button className="pill" onClick={() => store.learn('')}>All topics</button>}>
      <div className="layer-tabs">
        {([['intuition', 'Intuition'], ['trader', 'Trader'], ['quant', 'Quant']] as [Layer, string][]).map(([l, n]) => (
          <button key={l} className={layer === l ? 'on' : ''} onClick={() => setLayer(l)}>{n}</button>
        ))}
      </div>
      <div className="prose"><Rich text={body} /></div>
      {live && (
        <div className="livebox">
          <div className="micro" style={{ color: 'var(--violet)', marginBottom: 4 }}>In your book, right now</div>
          {live}
        </div>
      )}
      <div className="micro" style={{ marginTop: 6 }}>Related</div>
      <div className="row wrap" style={{ gap: 6 }}>
        {TOPICS.filter((x) => x.group === t.group && x.id !== t.id).map((x) => (
          <button key={x.id} className="pill" onClick={() => store.learn(x.id)}>{x.title}</button>
        ))}
      </div>
    </Sheet>
  );
}

function Rich({ text }: { text: string }) {
  const parts = text.split(/<math>|<\/math>/);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <span key={i} className="math">{p}</span> : <span key={i}>{p}</span>))}
    </>
  );
}

function Library() {
  const groups = Array.from(new Set(TOPICS.map((t) => t.group)));
  return (
    <Sheet title="Desk notes" sub="Each topic at three depths, tied to your own book">
      {groups.map((gname) => (
        <div key={gname} className="col" style={{ gap: 6 }}>
          <span className="micro">{gname}</span>
          <div className="row wrap" style={{ gap: 6 }}>
            {TOPICS.filter((t) => t.group === gname).map((t) => (
              <button key={t.id} className="pill" onClick={() => store.learn(t.id)}>{t.title}</button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}
