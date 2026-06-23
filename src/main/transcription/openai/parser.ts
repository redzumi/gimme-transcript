// Parse OpenAI transcription responses into intermediate segments. Speaker
// labels (diarize) are resolved to speakerIds by the runner.

export interface ParsedSegment {
  start: number
  end: number
  text: string
  speaker?: string
}

interface VerboseJson {
  text?: string
  duration?: number
  segments?: { start: number; end: number; text: string }[]
}

interface DiarizedJson {
  text?: string
  segments?: { speaker?: string; start: number; end: number; text: string }[]
}

export function parseVerboseJson(resp: unknown): ParsedSegment[] {
  const r = resp as VerboseJson
  if (Array.isArray(r.segments)) {
    return r.segments.map((s) => ({ start: s.start, end: s.end, text: (s.text ?? '').trim() }))
  }
  return r.text ? [{ start: 0, end: r.duration ?? 0, text: r.text.trim() }] : []
}

export function parseDiarizedJson(resp: unknown): ParsedSegment[] {
  const r = resp as DiarizedJson
  if (Array.isArray(r.segments)) {
    return r.segments.map((s) => ({
      start: s.start,
      end: s.end,
      text: (s.text ?? '').trim(),
      speaker: s.speaker
    }))
  }
  return r.text ? [{ start: 0, end: 0, text: r.text.trim() }] : []
}

// Plain json/text: no timestamps, whole transcript as one segment.
export function parseTextResponse(resp: unknown, durationSec: number): ParsedSegment[] {
  const text = ((resp as { text?: string }).text ?? '').trim()
  return text ? [{ start: 0, end: durationSec, text }] : []
}
