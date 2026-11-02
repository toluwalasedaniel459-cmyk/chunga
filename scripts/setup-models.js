// Downloads every model Chunga needs, so the app then works with Wi-Fi off.
// Run ONCE while online:  npm run setup-models
// Add --all to also fetch the larger Whisper "small" model (better Swahili).
//
// QVAC API used: downloadAsset() – downloads a model into the QVAC cache
// (~/.qvac/models) without loading it into memory.
import { downloadAsset, LLAMA_3_2_1B_INST_Q4_0, WHISPER_BASE_Q8_0, WHISPER_SMALL_Q8_0, VAD_SILERO_5_1_2 } from '@qvac/sdk'

const models = [
  ['LLM: Llama 3.2 1B Instruct Q4_0', LLAMA_3_2_1B_INST_Q4_0],
  ['Speech: Whisper base Q8_0 (multilingual)', WHISPER_BASE_Q8_0],
  ['Speech: Silero VAD 5.1.2', VAD_SILERO_5_1_2]
]
if (process.argv.includes('--all')) models.push(['Speech: Whisper small Q8_0 (multilingual)', WHISPER_SMALL_Q8_0])

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
