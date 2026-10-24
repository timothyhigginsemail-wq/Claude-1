import { bib } from '../data/bibliography'

export function SourceList({ keys }: { keys: string[] }) {
  return (
    <div className="sources">
      <div className="sources-h">Sources</div>
      <ol>
        {keys.map((k) => {
          const r = bib[k]
          if (!r) return <li key={k}>[missing: {k}]</li>
          return <li key={k}>{r.text}{r.url && <> <a href={r.url} target="_blank" rel="noreferrer">↗</a></>}</li>
        })}
      </ol>
    </div>
  )
}
