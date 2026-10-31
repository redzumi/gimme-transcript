// Group ElevenLabs word-level output into transcript segments. A new segment
// starts on a speaker change, a long pause, or once a segment gets long
// (preferring a sentence end). Speaker labels are resolved by the runner.

import type { ElevenLabsResponse } from './client'

export interface ParsedSegment {
  start: number
  end: number
  text: string
  speaker?: string
}

const PAUSE_SEC = 1.5
const SOFT_MAX_SEC = 20 // split at the next sentence end after this
const HARD_MAX_SEC = 40 // split regardless

// 'speaker_0' → 'Speaker 1'; unknown formats are kept as-is.
export function speakerLabel(id: string): string {
  const m = id.match(/^speaker_(\d+)$/)
  return m ? `Speaker ${Number(m[1]) + 1}` : id
}

export function parseWords(resp: ElevenLabsResponse): ParsedSegment[] {
  const words = resp.words ?? []
  const segments: ParsedSegment[] = []
  const push = (seg: ParsedSegment | null): void => {
    if (seg && seg.text.trim()) segments.push({ ...seg, text: seg.text.trim() })
  }
  let cur = null as ParsedSegment | null

  for (const w of words) {
    if (w.type === 'audio_event') continue
    if (w.type === 'spacing') {
      if (cur) cur.text += w.text
      continue
    }
    const start = w.start ?? cur?.end ?? 0
    const end = w.end ?? start
    const speaker = w.speaker_id ? speakerLabel(w.speaker_id) : undefined

    if (cur) {
      const len = cur.end - cur.start
      const sentenceEnd = /[.!?…]["»”)]?\s*$/.test(cur.text)
      if (
        speaker !== cur.speaker ||
        start - cur.end >= PAUSE_SEC ||
        len >= HARD_MAX_SEC ||
        (len >= SOFT_MAX_SEC && sentenceEnd)
      ) {
        push(cur)
        cur = null
      }
    }
    if (!cur) cur = { start, end, text: '', speaker }
    cur.text += w.text
    cur.end = end
  }
  push(cur)

  // No word timestamps (unexpected): fall back to the plain transcript.
  if (segments.length === 0 && resp.text?.trim()) {
    return [{ start: 0, end: 0, text: resp.text.trim() }]
  }
  return segments
}
