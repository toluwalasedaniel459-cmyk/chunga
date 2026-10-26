// Step 0 smoke test: can QVAC run a small local LLM on this machine?
// Downloads the model on first run (needs internet once), then works offline.
// Run: npm run smoke
import { loadModel, completion, unloadModel, LLAMA_3_2_1B_INST_Q4_0 } from '@qvac/sdk'

const t0 = Date.now()

try {
  // Load the 1B instruct model. onProgress only fires while downloading.
  const modelId = await loadModel({
    modelSrc: LLAMA_3_2_1B_INST_Q4_0,
    modelConfig: { ctx_size: 2048 },
    onProgress: (p) => {
      process.stdout.write(`\r▸ Downloading ${p.percentage.toFixed(0)}%   `)
    }
  })
  const loadMs = Date.now() - t0
  console.log(`\n▸ Model loaded in ${(loadMs / 1000).toFixed(1)}s`)

  // One short, deterministic completion (temp 0 = same answer every time).
  const t1 = Date.now()
  const run = completion({
    modelId,
    history: [
      { role: 'system', content: 'You are a fraud analyst. Answer with one word: SCAM or SAFE.' },
      { role: 'user', content: 'Message: "I have sent you Ksh 2,000 by mistake, please send it back to 07XX XXX XXX."' }
    ],
    stream: false,
    generationParams: { temp: 0, seed: 42, predict: 16 }
  })
  const final = await run.final
  console.log(`▸ Model answer: ${final.contentText.trim()}`)
  console.log(`▸ Completion took ${((Date.now() - t1) / 1000).toFixed(1)}s`)
  if (final.stats?.tokensPerSecond) console.log(`▸ ${final.stats.tokensPerSecond.toFixed(1)} tokens/s`)

  // Unloading the last model also shuts down the QVAC worker so Node exits.
  await unloadModel({ modelId })
  console.log('✔ QVAC smoke test passed')
} catch (error) {
  console.error('✖ QVAC smoke test failed:', error)
  process.exit(1)
}
