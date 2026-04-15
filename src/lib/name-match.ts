/**
 * Fuzzy company name matching — used to normalize feedback customer names
 * against Chargebee's canonical company names.
 */

const STRIP_WORDS = /\b(inc|llc|ltd|corp|co|company|the|a|an|group|holdings|services|solutions|technologies|technology|tech)\b/g
const PUNCTUATION = /[^\w\s]/g

export function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(PUNCTUATION, ' ')
    .replace(STRIP_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function jaccardScore(a: string, b: string): number {
  if (a === b) return 1.0

  // Substring containment — handles "Acme" matching "Acme Corp Solutions"
  if (a.includes(b) || b.includes(a)) return 0.85

  const wordsA = new Set(a.split(' ').filter((w) => w.length > 1))
  const wordsB = new Set(b.split(' ').filter((w) => w.length > 1))
  if (wordsA.size === 0 || wordsB.size === 0) return 0

  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length
  const union = new Set([...wordsA, ...wordsB]).size

  return intersection / union
}

export function bestChargebeeMatch(
  feedbackName: string,
  chargebeeNames: string[],
  threshold = 0.6,
): string | null {
  const norm = normalizeForMatch(feedbackName)
  if (!norm) return null

  let bestScore = 0
  let bestName: string | null = null

  for (const cbName of chargebeeNames) {
    const score = jaccardScore(norm, normalizeForMatch(cbName))
    if (score > bestScore) {
      bestScore = score
      bestName = cbName
    }
  }

  return bestScore >= threshold ? bestName : null
}
