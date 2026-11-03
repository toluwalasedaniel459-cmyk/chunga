// Chunga Executa plugin – AI helper process.
//
// Runs the local QVAC LLM in its own process, started by plugin.js with
// stdin closed and stdout pointed at the plugin's stderr. QVAC's own worker
// inherits these, so nothing it prints can ever reach the Executa protocol
// stream (stdout). The two processes talk over Node's IPC channel:
//
//   plugin → worker   { type: 'ask', id, text, budgetMs }
//   worker → plugin   { type: 'state', state: 'loading' | 'ready' | 'error', message? }
//                     { type: 'answer', id, raw, timing }
//                     { type: 'failed', id, message }
//
// If QVAC crashes (e.g. on a CPU it doesn't support), only this process dies;
// the plugin keeps answering with the rules.
import { cancel } from '@qvac/sdk'
import { initLlm, askLlm, closeLlm } from './lib/qvac/llm.js'

const send = (msg) => { if (process.connected) process.send(msg) }

let lastPct = -1
send({ type: 'state', state: 'loading' })
initLlm({
  // Shown in the Agent's trace view (stderr) while the model downloads the first time.
  onProgress: (p) => {
    const pct = Math.floor(p.percentage / 10) * 10
    if (pct !== lastPct) { lastPct = pct; console.error(`[chunga-ai] downloading model ${pct}%`) }
  }
})
  .then(() => send({ type: 'state', state: 'ready' }))
  .catch((err) => send({ type: 'state', state: 'error', message: err.message }))

// One question at a time (the model runs one completion at a time anyway).
let queue = Promise.resolve()
process.on('message', (msg) => {
  if (msg?.type !== 'ask') return
  queue = queue.then(() => answer(msg)).catch(() => {})
})

async function answer ({ id, text, budgetMs }) {
  let run = null
  let timedOut = false
  // Stop the model if it would take longer than the tool's time budget.
  const timer = setTimeout(() => {
    timedOut = true
    if (run?.requestId) cancel({ requestId: run.requestId }).catch(() => {})
  }, budgetMs)
  try {
    const { raw, timing } = await askLlm(text, { onRun: (r) => { run = r } })
    if (timedOut) send({ type: 'failed', id, message: `AI took longer than ${Math.round(budgetMs / 1000)} s` })
    else send({ type: 'answer', id, raw, timing })
  } catch (err) {
    send({ type: 'failed', id, message: timedOut ? `AI took longer than ${Math.round(budgetMs / 1000)} s` : err.message })
  } finally {
    clearTimeout(timer)
  }
}

// Plugin closed the channel (it is shutting down) → free the model and exit.
process.on('disconnect', async () => {
  await closeLlm().catch(() => {})
  process.exit(0)
})
