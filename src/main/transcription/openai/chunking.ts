// Prepare audio for OpenAI's 25 MB upload limit: compress to a small mono MP3,
// and if still too large, split into time segments. Returns parts with their
// offset (seconds) for timestamp correction, plus a cleanup() for temp files.

import { spawn } from 'child_process'
import { statSync, readdirSync, unlinkSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { findFfmpeg } from '../../whisper/convert'

const MAX_BYTES = 24 * 1024 * 1024 // 24 MB safety margin under OpenAI's 25 MB
const MP3_BITRATE_KBPS = 64
// Seconds of 64 kbps mono MP3 that fit under MAX_BYTES (~50 min).
const SEGMENT_SEC = Math.floor((MAX_BYTES * 8) / (MP3_BITRATE_KBPS * 1000))

export interface AudioPart {
  path: string
  offsetSec: number
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

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg(), args)
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('close', (code) => (code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg ${code}`))))
    proc.on('error', reject)
  })
}

export function getDurationSec(inputPath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpeg(), ['-i', inputPath])
    let stderr = ''
    proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('close', () => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
      resolve(m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0)
    })
    proc.on('error', () => resolve(0))
  })
}

async function compressToMp3(inputPath: string, outPath: string): Promise<void> {
  await run([
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
  ])
}

export async function planAudioParts(inputPath: string): Promise<AudioPlan> {
  const durationSec = await getDurationSec(inputPath)
  const temps: string[] = []
  const cleanup = (): void => {
    for (const t of temps) {
      try {
        unlinkSync(t)
      } catch {
        /* ignore */
      }
    }
  }

  if (statSync(inputPath).size <= MAX_BYTES) {
    return { parts: [{ path: inputPath, offsetSec: 0 }], durationSec, cleanup }
  }

  // Compress to a small mono MP3 first.
  const mp3 = join(tmpdir(), `openai-${randomUUID()}.mp3`)
  await compressToMp3(inputPath, mp3)
  temps.push(mp3)
  if (statSync(mp3).size <= MAX_BYTES) {
    return { parts: [{ path: mp3, offsetSec: 0 }], durationSec, cleanup }
  }

  // Still too big: split into time segments.
  const dir = mkdtempSync(join(tmpdir(), 'openai-parts-'))
  await run([
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
  ])
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.mp3'))
    .sort()
  const parts: AudioPart[] = files.map((f, i) => ({
    path: join(dir, f),
    offsetSec: i * SEGMENT_SEC
  }))
  return {
    parts,
    durationSec,
    cleanup: () => {
      cleanup()
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  }
}
