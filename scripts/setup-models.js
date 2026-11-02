// Downloads every model Chunga needs, so the app then works with Wi-Fi off.
// Run ONCE while online:  npm run setup-models
// Add --voice for the read-aloud models (Chatterbox multilingual, ~1.1 GB),
// and --all for those plus the larger Whisper "small" model (better Swahili).
//
// QVAC API used: downloadAsset() – downloads a model into the QVAC cache
// (~/.qvac/models) without loading it into memory.
import {
  downloadAsset, LLAMA_3_2_1B_INST_Q4_0, WHISPER_BASE_Q8_0, WHISPER_SMALL_Q8_0, VAD_SILERO_5_1_2,
  OCR_LATIN, OCR_CRAFT, TTS_T3_MULTILINGUAL_CHATTERBOX_Q4_0, TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0
} from '@qvac/sdk'

const all = process.argv.includes('--all')
const models = [
  ['LLM: Llama 3.2 1B Instruct Q4_0', LLAMA_3_2_1B_INST_Q4_0],
  ['Speech: Whisper base Q8_0 (multilingual)', WHISPER_BASE_Q8_0],
  ['Speech: Silero VAD 5.1.2', VAD_SILERO_5_1_2],
  ['Screenshots: EasyOCR Latin recognizer', OCR_LATIN],
  // OCR_LATIN also needs this text detector; QVAC would otherwise fetch it on
  // the first screenshot, which would fail offline.
  ['Screenshots: CRAFT text detector', OCR_CRAFT]
]
if (all) models.push(['Speech: Whisper small Q8_0 (multilingual)', WHISPER_SMALL_Q8_0])
if (all || process.argv.includes('--voice')) {
  models.push(['Read aloud: Chatterbox multilingual T3 Q4_0', TTS_T3_MULTILINGUAL_CHATTERBOX_Q4_0])
  models.push(['Read aloud: Chatterbox multilingual S3Gen Q4_0', TTS_S3GEN_MULTILINGUAL_CHATTERBOX_Q4_0])
}

for (const [name, model] of models) {
  const mb = (model.expectedSize / 1e6).toFixed(0)
  process.stdout.write(`▸ ${name} (${mb} MB) `)
  // Retry a few times: the model registry can time out on slow networks.
  for (let attempt = 1; ; attempt++) {
    try {
      await downloadAsset({
        assetSrc: model,
        onProgress: (p) => process.stdout.write(`\r▸ ${name} (${mb} MB) ${p.percentage.toFixed(0)}%   `)
      })
      console.log(`\r✔ ${name} (${mb} MB)            `)
      break
    } catch (err) {
      if (attempt === 3) { console.error(`\n✖ ${name}: ${err.message}`); process.exit(1) }
      console.log(`\n  retrying (${err.message.slice(0, 80)})…`)
    }
  }
}
console.log('\nAll models downloaded. You can now turn Wi-Fi off and run: npm start')
process.exit(0)
