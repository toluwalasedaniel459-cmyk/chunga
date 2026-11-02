// Which sentences Chunga reads aloud for a result. Only our fixed, hand-written
// EN/SW text is spoken (verdict, top 2 reasons, top 2 advice), never the AI's
// free text, so every sentence can be cached and is always correct Swahili.
import { SPOKEN_VERDICT, REASONS, ADVICE } from './messages.js'

export function spokenSentences ({ verdict, reasonCodes = [] }, lang) {
  if (!SPOKEN_VERDICT[verdict] || !['en', 'sw'].includes(lang)) return []
  const reasons = reasonCodes.filter((c) => REASONS[c]).slice(0, 2).map((c) => REASONS[c][lang])
  const advice = ADVICE[verdict].slice(0, 2).map((a) => a[lang])
  return [SPOKEN_VERDICT[verdict][lang], ...reasons, ...advice]
}

// Every sentence that can ever be spoken, for pre-generating the cache.
export function allSpokenSentences (lang) {
  const set = new Set()
  for (const v of Object.keys(SPOKEN_VERDICT)) set.add(SPOKEN_VERDICT[v][lang])
  for (const code of Object.keys(REASONS)) set.add(REASONS[code][lang])
  for (const v of Object.keys(ADVICE)) ADVICE[v].slice(0, 2).forEach((a) => set.add(a[lang]))
  return [...set]
}
