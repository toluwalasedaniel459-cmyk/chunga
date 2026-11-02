// Measures Whisper speed and accuracy on one clip.
// Run: npm run bench-whisper [-- data/audio/audio-scam-agent.wav]
// Try another size: set CHUNGA_WHISPER=WHISPER_TINY_Q8_0 or WHISPER_SMALL_Q8_0 first.
import { initWhisper, transcribeFile, closeWhisper, WHISPER_MODEL_NAME } from '../src/qvac/transcribe.js'

const file = process.argv[2] || 'data/audio/audio-scam-agent.wav'
const t0 = Date.now()
await initWhisper({ onProgress: (p) => process.stdout.write(`\r▸ Downloading ${p.percentage.toFixed(0)}%  `) })
console.log(`\n▸ ${WHISPER_MODEL_NAME} load: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
const { text, ms } = await transcribeFile(file)
console.log(`▸ transcribe: ${(ms / 1000).toFixed(1)}s`)
console.log(`▸ text: ${text}`)
await closeWhisper()
