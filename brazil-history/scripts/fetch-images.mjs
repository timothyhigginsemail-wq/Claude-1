// Downloads every image used in the deck from Wikimedia Commons into public/images,
// so the presentation works fully offline. Run once while online:  npm run fetch-images
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'images')
const list = JSON.parse(await readFile(join(root, 'scripts', 'image-list.json'), 'utf8'))
const WIDTH = Number(process.env.WIDTH || 1920) // a standard Wikimedia thumbnail size
const UA = 'HowBrazilBecameBrazil/1.0 (educational slide deck; local cache script)'

await mkdir(outDir, { recursive: true })
const ok = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const exists = async (p) => { try { await access(p); return true } catch { return false } }

for (const [id, file] of Object.entries(list)) {
  const dest = join(outDir, `${id}.jpg`)
  if (await exists(dest)) { ok.push(id); continue }
  const base = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`
  let url = `${base}?width=${WIDTH}`
  let done = false
  for (let attempt = 1; attempt <= 5 && !done; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' })
      // Images narrower than WIDTH cannot be upscaled: fetch the original file instead
      if (!res.ok && res.status !== 429 && url !== base) { url = base; continue }
      if (res.status === 429) { await sleep(5000 * attempt); continue }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(dest, buf)
      ok.push(id)
      done = true
      console.log(`✓ ${id}  (${Math.round(buf.length / 1024)} KB)`)
    } catch (e) {
      console.warn(`… ${id}: ${e.message} (attempt ${attempt})`)
      await sleep(1500 * attempt)
    }
  }
  if (!done) console.warn(`✗ ${id}: giving up — the deck will load it from Wikimedia at runtime instead`)
  await sleep(400)
}
await writeFile(join(outDir, 'manifest.json'), JSON.stringify(ok, null, 1))
console.log(`\n${ok.length}/${Object.keys(list).length} images cached in public/images`)
