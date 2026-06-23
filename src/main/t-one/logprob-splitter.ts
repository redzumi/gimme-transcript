// Streaming log-probability splitter — port of
// tone/logprob_splitter.py::StreamingLogprobSplitter.
//
// Splits a stream of acoustic log-probabilities into phrases on long-enough
// silences, carrying leftover frames + a frame offset across calls. Log-prob
// buffers are row-major Float32Array of shape (frames, NUM_CLASSES).

import {
  NUM_CLASSES,
  SILENCE_THRESHOLD,
  MIN_SILENCE_DURATION,
  SPEECH_EXPAND_SIZE,
  MAX_PHRASE_DURATION
} from './constants'

export interface LogprobBuffer {
  data: Float32Array
  frames: number
}

export interface LogprobPhrase {
  data: Float32Array
  frames: number
  startFrame: number // absolute, in acoustic frames
  endFrame: number
}

export interface SplitterState {
  past: Float32Array // leftover logprobs (row-major, NUM_CLASSES stride)
  pastFrames: number
  offset: number
}

export function initialSplitterState(): SplitterState {
  return { past: new Float32Array(0), pastFrames: 0, offset: 0 }
}

// is_speech = exp(logprobs[..., -2:]).sum(-1) <= SILENCE_THRESHOLD
// (last two classes = space + blank; their combined probability marks silence)
function computeIsSpeech(data: Float32Array, frames: number): Uint8Array {
  const isSpeech = new Uint8Array(frames)
  for (let f = 0; f < frames; f++) {
    const base = f * NUM_CLASSES
    const sum = Math.exp(data[base + NUM_CLASSES - 2]) + Math.exp(data[base + NUM_CLASSES - 1])
    isSpeech[f] = sum <= SILENCE_THRESHOLD ? 1 : 0
  }
  return isSpeech
}

interface Run {
  start: number // in original (un-padded) frame coords; may be < 0 or > frames
  end: number
}

// Port of _iterate_over_phrases: returns [start, end) phrase ranges in the
// combined-buffer frame coordinates.
function iterateOverPhrases(isSpeech: Uint8Array, isLast: boolean): Array<[number, number]> {
  const speechLen = isSpeech.length
  const padFront = MIN_SILENCE_DURATION
  const padBack = isLast ? MIN_SILENCE_DURATION : 0
  const paddedLen = speechLen + padFront + padBack

  // silence[i] = !is_speech (pad positions are silence). Map padded coord ->
  // original coord by subtracting padFront.
  const silenceAt = (i: number): boolean => {
    const orig = i - padFront
    if (orig < 0 || orig >= speechLen) return true // padded region = silence
    return isSpeech[orig] === 0
  }

  // Detect maximal silence runs over the padded array; keep separators whose
  // duration >= MIN_SILENCE_DURATION.
  const separators: Run[] = []
  let i = 0
  while (i < paddedLen) {
    if (silenceAt(i)) {
      let j = i
      while (j < paddedLen && silenceAt(j)) j++
      const start = i - padFront
      const end = j - padFront
      if (end - start >= MIN_SILENCE_DURATION) separators.push({ start, end })
      i = j
    } else {
      i++
    }
  }

  // speech_starts = silence_ends; speech_ends = silence_starts[1:] + [speechLen]
  const phrases: Array<[number, number]> = []
  for (let k = 0; k < separators.length; k++) {
    let speechStart = separators[k].end
    const speechEnd = k + 1 < separators.length ? separators[k + 1].start : speechLen
    while (speechEnd - speechStart >= MAX_PHRASE_DURATION) {
      phrases.push([speechStart, speechStart + MAX_PHRASE_DURATION])
      speechStart += MAX_PHRASE_DURATION
    }
    if (k < separators.length - 1) {
      // Do not yield the last (unfinished) speech unless force-split above.
      phrases.push([speechStart, speechEnd])
    }
  }
  return phrases
}

export function splitterForward(
  input: LogprobBuffer,
  state: SplitterState,
  isLast: boolean
): { phrases: LogprobPhrase[]; state: SplitterState } {
  const expand = SPEECH_EXPAND_SIZE

  // Step 1. Combine leftover (past) logprobs with the new chunk.
  const totalFrames = state.pastFrames + input.frames
  const combined = new Float32Array(totalFrames * NUM_CLASSES)
  combined.set(state.past.subarray(0, state.pastFrames * NUM_CLASSES), 0)
  combined.set(input.data.subarray(0, input.frames * NUM_CLASSES), state.pastFrames * NUM_CLASSES)

  // Step 2. speech mask.
  const isSpeech = computeIsSpeech(combined, totalFrames)

  // Step 3. Build phrases.
  const phrases: LogprobPhrase[] = []
  let lastPhrase = 0
  for (const [phraseStart, phraseEnd] of iterateOverPhrases(isSpeech, isLast)) {
    const from = Math.max(0, phraseStart - expand)
    const to = Math.min(totalFrames, phraseEnd + expand)
    const frames = Math.max(0, to - from)
    phrases.push({
      data: combined.slice(from * NUM_CLASSES, to * NUM_CLASSES),
      frames,
      startFrame: phraseStart + state.offset,
      endFrame: phraseEnd + state.offset
    })
    lastPhrase = phraseEnd
  }

  // Step 4. Drop consumed logprobs, keeping a tail (the last `expand` frames if
  // there is no trailing speech) for the next call.
  let hasTrailingSpeech = false
  for (let f = lastPhrase; f < totalFrames; f++) {
    if (isSpeech[f] === 1) {
      hasTrailingSpeech = true
      break
    }
  }
  if (!hasTrailingSpeech) {
    lastPhrase = Math.max(lastPhrase, totalFrames - expand)
  }
  lastPhrase = Math.max(0, Math.min(lastPhrase, totalFrames))

  const nextOffset = state.offset + lastPhrase
  const past = combined.slice(lastPhrase * NUM_CLASSES, totalFrames * NUM_CLASSES)
  return {
    phrases,
    state: { past, pastFrames: totalFrames - lastPhrase, offset: nextOffset }
  }
}
