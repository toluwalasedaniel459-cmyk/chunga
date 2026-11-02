// Pre-generates every sentence Chunga can read aloud, in English and Swahili,
// with QVAC text-to-speech, so replays in the app are instant and offline.
// Run on a PC with AVX2:  npm run prepare-voice   (add -- --sw for Swahili only)
import { closeTts, speakSentence } from '../src/qvac/tts.js'
import { allSpokenSentences } from '../src/detect/spoken.js'

const langs = process.argv.includes('--sw') ? ['sw'] : process.argv.includes('--en') ? ['en'] : ['en', 'sw']
for (const lang of langs) {
  const sentences = allSpokenSentences(lang)
  console.log(`▸ ${lang}: ${sentences.length} sentences`)
  for (const [i, s] of sentences.entries()) {
    const r = await speakSentence(s, lang)
    console.log(`  ${String(i + 1).padStart(2)}/${sentences.length} ${r.cached ? 'cached' : `${(r.ms / 1000).toFixed(1)}s`}  ${s}`)
  }
}
await closeTts()
console.log('Done. Spoken results now play instantly from tts-cache/.')
