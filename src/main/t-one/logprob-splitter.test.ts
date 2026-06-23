import { describe, it, expect } from 'vitest'
import { splitterForward, initialSplitterState } from './logprob-splitter'
import { NUM_CLASSES, MIN_SILENCE_DURATION } from './constants'

type Kind = 's' | 'q' // speech | silence

// is_speech = exp(lp[-2]) + exp(lp[-1]) <= SILENCE_THRESHOLD (0.9)
// speech -> both small (~0); silence -> blank prob 1 (sum > 0.9)
function makeFrames(kinds: Kind[]): Float32Array {
  const data = new Float32Array(kinds.length * NUM_CLASSES).fill(-10)
  kinds.forEach((k, f) => {
    if (k === 'q') data[f * NUM_CLASSES + (NUM_CLASSES - 1)] = 0 // blank prob ~1 => silence
  })
  return data
}

describe('splitterForward', () => {
  it('splits speech on a long-enough silence and flushes on isLast', () => {
    const kinds: Kind[] = [
      ...Array<Kind>(5).fill('s'),
      ...Array<Kind>(MIN_SILENCE_DURATION + 5).fill('q'), // 25 silence frames
      ...Array<Kind>(5).fill('s')
    ]
    const data = makeFrames(kinds)
    const { phrases } = splitterForward(
      { data, frames: kinds.length },
      initialSplitterState(),
      true
    )

    expect(phrases.length).toBe(2)
    expect(phrases[0].startFrame).toBe(0)
    expect(phrases[0].endFrame).toBe(5)
    expect(phrases[1].startFrame).toBe(30)
    expect(phrases[1].endFrame).toBe(35)
  })

  it('does not emit a phrase mid-stream without a trailing separator', () => {
    const kinds: Kind[] = [...Array<Kind>(10).fill('s')]
    const data = makeFrames(kinds)
    const { phrases, state } = splitterForward(
      { data, frames: kinds.length },
      initialSplitterState(),
      false
    )
    // No silence separator yet -> nothing finalized, frames carried in state.
    expect(phrases.length).toBe(0)
    expect(state.pastFrames).toBeGreaterThan(0)
  })
})
