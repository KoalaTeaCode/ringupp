import { nouns } from './nouns.js'
import { adjectives } from './adjectives.js'

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomThreeWords() {
    const firstNoun = randomItem(nouns)
    const secondNoun = randomItem(nouns)
    const adjective = randomItem(adjectives)
    return `${firstNoun}-${adjective}-${secondNoun}`
}
