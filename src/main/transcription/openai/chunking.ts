// Prepare audio for OpenAI's upload limits: 25 MB per file and a per-request
// duration cap (gpt-4o-* models reject audio longer than ~1400 s). Compress to
// a small mono MP3 and, if still too large or too long, split into time
// segments. Returns parts with their offset and duration (seconds) for
// timestamp correction, plus a cleanup() for temp files.

import { statSync, readdirSync, unlinkSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { findFfmpeg } from '../../whisper/convert'
import { spawnCancellable } from '../process'

const MAX_BYTES = 24 * 1024 * 1024 // 24 MB safety margin under OpenAI's 25 MB
const MP3_BITRATE_KBPS = 64
// Seconds of 64 kbps mono MP3 that fit under MAX_BYTES (~50 min).
const SIZE_SEGMENT_SEC = Math.floor((MAX_BYTES * 8) / (MP3_BITRATE_KBPS * 1000))
// Per-request duration cap with a margin under the 1400 s model limit. Smaller
// uploads also make slow connections less likely to hit network timeouts.
export const MAX_PART_SEC = 1200
const SEGMENT_SEC = Math.min(SIZE_SEGMENT_SEC, MAX_PART_SEC)

export interface AudioPart {
  path: string
  offsetSec: number
  durationSec: number
}

export interface AudioPlan {
  parts: AudioPart[]
  durationSec: number
  cleanup: () => void
}

function ffmpeg(): string {
  const bin = findFfmpeg()
  if (!bin) throw new Error('ffmpeg not found. Install it to use OpenAI transcription.')
  return bin
}

function run(args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawnCancellable(ffmpeg(), args, signal)
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('close', (code) => {
      if (signal?.aborted) reject(signal.reason)
      else if (code === 0) resolve(stderr)
      else reject(new Error(`ffmpeg ${code}`))
    })
    proc.on('error', reject)
  })
}

export async function getDurationSec(inputPath: string, signal?: AbortSignal): Promise<number> {
  // ffmpeg exits with a non-zero code when probing without an output file.
  return new Promise((resolve, reject) => {
    const proc = spawnCancellable(ffmpeg(), ['-i', inputPath], signal)
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('close', () => {
      if (signal?.aborted) {
        reject(signal.reason)
        return
      }
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
      resolve(m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0)
    })
    proc.on('error', () => resolve(0))
  })
}

async function compressToMp3(
  inputPath: string,
  outPath: string,
  signal?: AbortSignal
): Promise<void> {
  await run(
    [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      `${MP3_BITRATE_KBPS}k`,
      outPath
    ],
    signal
  )
}

export async function planAudioParts(inputPath: string, signal?: AbortSignal): Promise<AudioPlan> {
  const durationSec = await getDurationSec(inputPath, signal)
  const temps: string[] = []
  let dir: string | undefined
  const cleanup = (): void => {
    for (const t of temps) {
      try {
        unlinkSync(t)
      } catch {
        /* ignore */
      }
    }
    if (dir) rmSync(dir, { recursive: true, force: true })
  }

  // Unknown duration (0) can't be split reliably; rely on the size check only.
  const fitsDuration = durationSec <= MAX_PART_SEC
  if (fitsDuration && statSync(inputPath).size <= MAX_BYTES) {
    return { parts: [{ path: inputPath, offsetSec: 0, durationSec }], durationSec, cleanup }
  }

  // Compress to a small mono MP3 first.
  const mp3 = join(tmpdir(), `openai-${randomUUID()}.mp3`)
  temps.push(mp3)
  try {
    await compressToMp3(inputPath, mp3, signal)
    if (fitsDuration && statSync(mp3).size <= MAX_BYTES) {
      return { parts: [{ path: mp3, offsetSec: 0, durationSec }], durationSec, cleanup }
    }

    // Still too big or too long: split into time segments.
    const partsDir = mkdtempSync(join(tmpdir(), 'openai-parts-'))
    dir = partsDir
    await run(
      [
        '-y',
        '-i',
        mp3,
        '-f',
        'segment',
        '-segment_time',
        String(SEGMENT_SEC),
        '-c',
        'copy',
        join(dir, 'part-%03d.mp3')
      ],
      signal
    )
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.mp3'))
      .sort()
    const parts: AudioPart[] = files.map((f, i) => {
      const offsetSec = i * SEGMENT_SEC
      return {
        path: join(partsDir, f),
        offsetSec,
        durationSec: Math.max(0, Math.min(SEGMENT_SEC, durationSec - offsetSec))
      }
    })
    return {
      parts,
      durationSec,
      cleanup
    }
  } catch (err) {
    cleanup()
    throw err
  }
}
