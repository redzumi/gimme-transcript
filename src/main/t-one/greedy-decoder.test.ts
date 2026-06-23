import { describe, it, expect } from 'vitest'
import { greedyDecode } from './greedy-decoder'
import { LABELS, NUM_CLASSES } from './constants'

// Build (frames, NUM_CLASSES) logprobs where each frame's argmax is `tokens[f]`.
function makeLogprobs(tokens: number[]): Float32Array {
  const data = new Float32Array(tokens.length * NUM_CLASSES).fill(-10)
  tokens.forEach((t, f) => {
    data[f * NUM_CLASSES + t] = 0 // highest in this frame
  })
  return data
}

describe('greedyDecode', () => {
  it('collapses consecutive repeats and drops the blank class', () => {
    // tokens 0,0,1,blank,1 -> groupby [0,1,blank,1] -> drop blank -> а б б
    const tokens = [0, 0, 1, NUM_CLASSES - 1, 1]
    expect(greedyDecode(makeLogprobs(tokens), tokens.length)).toBe('абб')
  })

  it('maps indices to LABELS and trims whitespace', () => {
    // index of space is LABELS.length - 1 (last real label)
    const space = LABELS.length - 1
    const tokens = [space, 0, 1, 2, space] // " абв " -> trim -> "абв"
    expect(greedyDecode(makeLogprobs(tokens), tokens.length)).toBe('абв')
  })

  it('returns empty string for all-blank input', () => {
    const blank = NUM_CLASSES - 1
    expect(greedyDecode(makeLogprobs([blank, blank, blank]), 3)).toBe('')
  })
})
