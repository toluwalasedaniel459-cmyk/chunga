// Copies Chunga's shared detection code from ../src into lib/ so this folder is
// a self-contained npm package. Runs automatically before `npm pack` / `npm publish`.
import { cp, mkdir, rm } from 'node:fs/promises'

const SHARED = [
  'combine.js',
  'detect/rules.js',
  'detect/parse.js',
  'detect/messages.js',
  'detect/result.js',
  'qvac/llm.js'
]

const src = new URL('../src/', import.meta.url)
const lib = new URL('./lib/', import.meta.url)
await rm(lib, { recursive: true, force: true })
for (const file of SHARED) {
  const to = new URL(file, lib)
  await mkdir(new URL('.', to), { recursive: true })
  await cp(new URL(file, src), to)
}
await cp(new URL('../LICENSE', import.meta.url), new URL('./LICENSE', import.meta.url))
console.log(`Copied ${SHARED.length} shared files into executa/lib/ (+ LICENSE)`)
