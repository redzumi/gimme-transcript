// Streaming CTC pipeline driver — port of
// tone/pipeline.py::StreamingCTCPipeline. Wires the acoustic model → splitter →
// greedy decoder and converts phrase frame indices to seconds.

import { acousticForward } from './acoustic-model'
import { greedyDecode } from './greedy-decoder'
import { initialSplitterState, splitterForward, type SplitterState } from './logprob-splitter'
import { FRAME_SIZE, MEAN_TIME_BIAS, PADDING, SAMPLE_RATE } from './constants'

export interface TextPhrase {
  text: string
  startTime: number // seconds
  endTime: number
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

export class TonePipeline {
  private modelState: Uint16Array | null = null
  private splitState: SplitterState = initialSplitterState()

  // Process one 300 ms chunk (CHUNK_SIZE int32 samples).
  async forward(chunk: Int32Array, isLast: boolean): Promise<TextPhrase[]> {
    const { logprobs, frames, state } = await acousticForward(chunk, this.modelState)
    this.modelState = state

    const result = splitterForward({ data: logprobs, frames }, this.splitState, isLast)
    this.splitState = result.state

    // start_time = max(0, round(frame*FRAME_SIZE - MEAN_TIME_BIAS - PADDING/SR, 2))
    const padOffset = PADDING / SAMPLE_RATE
    const phrases: TextPhrase[] = []
    for (const phrase of result.phrases) {
      const text = greedyDecode(phrase.data, phrase.frames)
      if (!text) continue // skip empty phrases (no UI segment for silence)
      const startTime = Math.max(
        0,
        round2(phrase.startFrame * FRAME_SIZE - MEAN_TIME_BIAS - padOffset)
      )
      const endTime = Math.max(
        startTime,
        round2(phrase.endFrame * FRAME_SIZE - MEAN_TIME_BIAS - padOffset)
      )
      phrases.push({ text, startTime, endTime })
    }
    return phrases
  }
}
