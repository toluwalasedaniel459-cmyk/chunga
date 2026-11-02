// QVAC local OCR: reads the text in a screenshot of a message.
//
// QVAC APIs used (from @qvac/sdk 0.22.0):
//   loadModel()   – load the EasyOCR Latin recognizer (OCR_LATIN); QVAC also
//                   fetches its matching CRAFT text detector automatically
//   ocr()         – image file (PNG / JPEG / BMP) → text blocks with bounding boxes
//   unloadModel() – free memory on shutdown
import { loadModel, ocr, unloadModel, OCR_LATIN } from '@qvac/sdk'

const OCR_CONFIG = {
  langList: ['en'], // Latin-script recognizer; Swahili uses the same letters
  // Smaller detection canvas = much less memory and time. The QVAC docs suggest
  // lowering canvasSize on memory-constrained devices (default 2560, magRatio 1.5).
  magRatio: Number(process.env.CHUNGA_OCR_MAG || 1.0),
  canvasSize: Number(process.env.CHUNGA_OCR_CANVAS || 1280),
  defaultRotationAngles: [], // screenshots are upright, so skip rotation retries
  contrastRetry: false
}

let modelId = null
let loading = null

export async function initOcr () {
  if (modelId) return modelId
  if (!loading) {
    const t0 = Date.now()
    loading = loadModel({ modelSrc: OCR_LATIN, modelConfig: OCR_CONFIG })
      .then((id) => {
        modelId = id
        console.log(`[ocr] loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
        return id
      })
      .catch((err) => { loading = null; throw err })
  }
  return loading
}

export async function closeOcr () {
  if (modelId) await unloadModel({ modelId })
  modelId = null
  loading = null
}

// Put OCR blocks back in reading order (top to bottom, then left to right)
// and join them into one message text.
function blocksToText (blocks) {
  const withPos = blocks
    .filter((b) => b.text && b.text.trim())
    .map((b) => {
      const pts = Array.isArray(b.bbox) ? b.bbox.flat(Infinity) : []
      const ys = pts.filter((_, i) => i % 2 === 1)
      const xs = pts.filter((_, i) => i % 2 === 0)
      return { text: b.text.trim(), y: ys.length ? Math.min(...ys) : 0, x: xs.length ? Math.min(...xs) : 0, h: ys.length ? Math.max(...ys) - Math.min(...ys) : 0 }
    })
    .sort((a, b) => (Math.abs(a.y - b.y) < Math.max(8, a.h / 2) ? a.x - b.x : a.y - b.y))
  return withPos.map((b) => b.text).join(' ').replace(/\s+/g, ' ').trim()
}

// Fix common OCR slips that matter for scam rules. In our tests OCR read the
// Kenyan number "07XX…" as "O7XX…" (letter O), which hid the phone number.
export function fixOcrText (text) {
  return text
    .replace(/(^|[\s(+:])[Oo](?=[17][\dXx]{2})/g, '$10') // O7XX… / O1XX… → 07XX… / 01XX…
    .replace(/(\d)[Oo](?=\d)/g, '$10') // 3,5O0 → 3,500
}

// Read one image. Returns { text, blocks, ms }.
export async function readImage (filePath) {
  const id = await initOcr()
  const start = performance.now()
  const { blocks } = ocr({ modelId: id, image: filePath, options: { paragraph: false } })
  const result = await blocks
  return { text: fixOcrText(blocksToText(result)), blocks: result, ms: Math.round(performance.now() - start) }
}
