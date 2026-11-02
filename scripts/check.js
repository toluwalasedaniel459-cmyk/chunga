// Check one message by hand from the terminal.
//   npm run check -- "I sent you 2,000 by mistake, please send it back"
//   npm run check -- "Nimekutumia pesa kimakosa" --sender "+2547XX XXX 214" --sw
//   npm run check -- "..." --rules        (rules only, no AI)
import { analyse } from '../src/detect/analyse.js'
import { initLlm, closeLlm } from '../src/qvac/llm.js'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : '')
const text = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--sender')

if (!text) {
  console.log('Usage: npm run check -- "message text" [--sender "+2547..."] [--sw] [--rules]')
  process.exit(1)
}

const lang = flag('--sw') ? 'sw' : 'en'
const useLlm = !flag('--rules')

function print (title, r) {
  console.log(`\n${title}: ${r.label} (${r.confidence}%)  [${r.decidedBy}]`)
  for (const reason of r.reasons) console.log(`  • ${reason.text}  (${reason.source === 'ai' ? 'AI' : 'rule'})`)
  if (r.summary) console.log(`  “${r.summary}”`)
  console.log('  What to do:')
  for (const a of r.advice) console.log(`   - ${a}`)
}

if (useLlm) {
  console.log('Loading AI…')
  await initLlm()
}

const { result, timing } = await analyse(text, {
  sender: option('--sender'),
  lang,
  useLlm,
  onRules: (r) => {
    print('Instant check (rules)', r)
    if (useLlm) process.stdout.write('\nAI is double-checking')
  },
  onToken: () => process.stdout.write('.')
})

if (useLlm) {
  print('\nFinal answer (rules + AI)', result)
  await closeLlm()
}
console.log(`\nTiming: ${JSON.stringify(timing)}`)
