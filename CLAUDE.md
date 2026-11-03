# CLAUDE.md

## Knowledge base viewer

The Markdown knowledge base lives in `notes/` (one folder per topic, each with an
`_index.md`; notes use `[[wikilinks]]` and YAML frontmatter: tags, type, status,
created, updated). `viewer.html` is generated from it by `build-viewer.js`.

- **When the user says "rebuild viewer"**, run `node build-viewer.js` from the repo root
  (no install needed), then report the summary it prints (notes, links, ghost links,
  orphans). To build from another folder: `node build-viewer.js path/to/notes --out viewer.html`.
- Rebuild the viewer after adding, renaming or editing notes, and commit `viewer.html`
  together with the note changes.
- Don't edit `viewer.html` by hand; change `build-viewer.js` instead.
