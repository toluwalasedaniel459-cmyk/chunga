// Measures OCR speed and what it reads from one screenshot.
// Run: npm run bench-ocr [-- data/images/img-scam-reversal.png]
// Try other settings: set CHUNGA_OCR_CANVAS=960 (smaller = faster) first.
import { initOcr, readImage, closeOcr } from '../src/qvac/ocr.js'
import { analyse } from '../src/detect/analyse.js'

const file = process.argv[2] || 'data/images/img-scam-reversal.png'
const t0 = Date.now()
await initOcr()
console.log(`▸ OCR load: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
const { text, blocks, ms } = await readImage(file)
console.log(`▸ OCR read: ${(ms / 1000).toFixed(1)}s, ${blocks.length} text blocks`)
console.log(`▸ text: ${text}`)
const { result } = await analyse(text, { useLlm: false })
console.log(`▸ rules verdict: ${result.verdict} (${result.reasons.map((r) => r.code).join(', ')})`)
await closeOcr()
