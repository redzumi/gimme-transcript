// Shared ffmpeg helpers for cloud engines: probe duration and compress audio
// to a small mono MP3 before upload.

import { findFfmpeg } from '../whisper/convert'
import { spawnCancellable } from './process'

export const MP3_BITRATE_KBPS = 64

function ffmpeg(): string {
  const bin = findFfmpeg()
  if (!bin) throw new Error('ffmpeg not found. Install it to use cloud transcription.')
  return bin
}

export function runFfmpeg(args: string[], signal?: AbortSignal): Promise<string> {
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

export async function compressToMp3(
  inputPath: string,
  outPath: string,
  signal?: AbortSignal
): Promise<void> {
  await runFfmpeg(
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
