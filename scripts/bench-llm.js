// Measures LLM speed on this machine: load time, time to first token, total.
// Run: node scripts/bench-llm.js [cpu|gpu] [threads]
// Try another model: set CHUNGA_LLM=QWEN3_600M_INST_Q4 first.
import { initLlm, askLlm, closeLlm, LLM_CONFIG } from '../src/qvac/llm.js'

if (process.argv[2]) LLM_CONFIG.device = process.argv[2]
if (process.argv[3]) LLM_CONFIG.threads = Number(process.argv[3])
console.log(`▸ model=${process.env.CHUNGA_LLM || 'default'} device=${LLM_CONFIG.device} threads=${LLM_CONFIG.threads ?? 'auto'}`)

const t0 = Date.now()
await initLlm()
console.log(`▸ load: ${((Date.now() - t0) / 1000).toFixed(1)}s`)

// Each call is independent (no kvCache: it would leak the previous message).
const samples = [
  'Hello, I have sent you 3,500 by mistake. Please send it back to 07XX XXX 214.',
  'Hi Wanjiku, the staff meeting has moved to Thursday at 10 am.'
]
for (const text of samples) {
  const { raw, timing } = await askLlm(text)
  console.log(raw)
  console.log('▸', JSON.stringify(timing))
}
await closeLlm()
