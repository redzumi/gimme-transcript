// Greedy CTC decoder — port of tone/decoder.py::GreedyCTCDecoder.
//
//   tokens = logprobs.argmax(axis=-1)        # most probable symbol per frame
//   tokens = [t for t, _ in groupby(tokens)] # collapse consecutive repeats
//   "".join(LABELS[t] for t in tokens if t < len(LABELS)).strip()
//
// `logprobs` is a row-major Float32Array of shape (frames, NUM_CLASSES); the
// blank class (index === LABELS.length) is dropped by the `t < LABELS.length`
// guard.

import { LABELS, NUM_CLASSES } from './constants'

export function greedyDecode(logprobs: Float32Array, frames: number): string {
  let prev = -1
  let out = ''

  for (let f = 0; f < frames; f++) {
    const base = f * NUM_CLASSES
    let best = 0
    let bestVal = logprobs[base]
    for (let c = 1; c < NUM_CLASSES; c++) {
      const v = logprobs[base + c]
      if (v > bestVal) {
        bestVal = v
        best = c
      }
    }
    if (best === prev) continue // groupby: skip consecutive repeats (incl. blank)
    prev = best
    if (best < LABELS.length) out += LABELS[best]
  }

  return out.trim()
}
