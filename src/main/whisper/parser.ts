// T-023: Parse whisper.cpp stdout into Segment objects.
// Line format: [HH:MM:SS.mmm --> HH:MM:SS.mmm]   text

import { randomUUID } from 'crypto'
import type { Segment } from '../../renderer/src/types/ipc'

const SEGMENT_RE = /^\[(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})\]\s+(.*)/
const PROGRESS_RE = /progress\s*=\s*(\d+)\s*%/i

function parseTimestamp(ts: string): number {
  const parts = ts.split(':')
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
}

export function parseSegmentLine(line: string): Segment | null {
  const match = SEGMENT_RE.exec(line.trim())
  if (!match) return null
  const text = match[3].trim()
  if (!text) return null
  return {
    id: randomUUID(),
    start: parseTimestamp(match[1]),
    end: parseTimestamp(match[2]),
    text,
    speakerId: null
  }
}

export function parseProgressLine(line: string): number | null {
  const match = PROGRESS_RE.exec(line)
  if (!match) return null
  return parseInt(match[1])
}
