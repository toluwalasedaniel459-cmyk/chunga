// QVAC local speech-to-text (Whisper): turns a voice note into text.
//
// QVAC APIs used (from @qvac/sdk 0.22.0):
//   loadModel()   – load the Whisper model (+ Silero VAD) once
//   transcribe()  – audio file path → text. QVAC decodes .mp3 .m4a .ogg .wav
//                   .flac .aac itself with its bundled FFmpeg, fully offline.
//   unloadModel() – free memory on shutdown
import * as sdk from '@qvac/sdk'
import { loadModel, transcribe, unloadModel, VAD_SILERO_5_1_2 } from '@qvac/sdk'

// Multilingual Whisper (NOT the "_EN_" English-only models) so Swahili works.
// CHUNGA_WHISPER lets you try WHISPER_TINY_Q8_0 or WHISPER_SMALL_Q8_0.
export const WHISPER_MODEL_NAME = process.env.CHUNGA_WHISPER || 'WHISPER_BASE_Q8_0'
const WHISPER_MODEL = sdk[WHISPER_MODEL_NAME]

const WHISPER_CONFIG = {
  language: 'auto', // detect English or Swahili automatically
  translate: false, // keep the original language (don't translate to English)
  temperature: 0.0,
  // Hints for words Whisper often misspells in Kenyan messages.
  initial_prompt: 'M-PESA, Safaricom, Ksh, PIN, Fuliza, M-Shwari, mkopo, pesa, tafadhali.',
  contextParams: { use_gpu: process.env.CHUNGA_WHISPER_GPU === '1' }, // CPU by default
  vadModelSrc: VAD_SILERO_5_1_2 // voice-activity detection skips silence
}

let modelId = null
let loading = null

export function isWhisperReady () {
  return modelId !== null
}

// Load ONCE (at app start) and reuse for every voice note.
export async function initWhisper ({ onProgress } = {}) {
  if (modelId) return modelId
  if (!loading) {
    const t0 = Date.now()
    loading = loadModel({ modelSrc: WHISPER_MODEL, modelConfig: WHISPER_CONFIG, onProgress })
      .then((id) => {
        modelId = id
        console.log(`[whisper] ${WHISPER_MODEL_NAME} loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
        return id
      })
      .catch((err) => { loading = null; throw err })
  }
  return loading
}

export async function closeWhisper () {
  if (modelId) await unloadModel({ modelId })
  modelId = null
  loading = null
}

// Transcribe one audio file. Returns { text, ms }.
export async function transcribeFile (filePath) {
  const id = await initWhisper()
  const start = performance.now()
  const text = await transcribe({ modelId: id, audioChunk: filePath })
  const ms = Math.round(performance.now() - start)
  // Whisper sometimes adds markers like [MUSIC] or (laughs); drop them.
  const clean = String(text).replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  return { text: clean, ms }
}
