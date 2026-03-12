// Prepare audio for whisper-cli.
// Formats natively supported by whisper-cli: flac, mp3, ogg, wav — passed directly.
// Everything else is converted to 16kHz mono WAV via ffmpeg (async, non-blocking).

import { execSync, spawn } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const NATIVE_FORMATS = new Set(['wav', 'mp3', 'ogg', 'flac'])

function ext(filePath: string): string {
  return filePath.toLowerCase().split('.').pop() ?? ''
}

function findFfmpeg(): string | null {
  try {
    return execSync('which ffmpeg', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim() || null
  } catch {
    return null
  }
}

export interface ConvertResult {
  audioPath: string
  tempFile: boolean
}

export function convertForPlayback(
  inputPath: string,
  outputPath: string,
  onProgress: (percent: number) => void
): Promise<void> {
  const ffmpeg = findFfmpeg()
  if (!ffmpeg) return Promise.reject(new Error('ffmpeg not found. Install with: brew install ffmpeg'))

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, [
      '-y', '-i', inputPath,
      '-vn', '-acodec', 'libmp3lame', '-b:a', '128k',
      outputPath
    ])

    let totalSeconds = 0

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      if (!totalSeconds) {
        const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/)
        if (m) totalSeconds = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])
      }
      const tm = text.match(/time=(\d+):(\d+):(\d+\.\d+)/)
      if (tm && totalSeconds > 0) {
        const cur = +tm[1] * 3600 + +tm[2] * 60 + parseFloat(tm[3])
        onProgress(Math.min(99, (cur / totalSeconds) * 100))
      }
    })

    proc.on('close', (code) => {
      if (code === 0) { onProgress(100); resolve() }
      else reject(new Error(`ffmpeg exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

export function prepareAudio(inputPath: string): Promise<ConvertResult> {
  if (NATIVE_FORMATS.has(ext(inputPath))) {
    return Promise.resolve({ audioPath: inputPath, tempFile: false })
  }

  const ffmpeg = findFfmpeg()
  if (!ffmpeg) {
    return Promise.reject(
      new Error(
        'ffmpeg not found. Install it with: brew install ffmpeg\n' +
        'Required to convert ' + ext(inputPath).toUpperCase() + ' files.'
      )
    )
  }

  const wavPath = join(tmpdir(), `whisper-${randomUUID()}.wav`)

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, [
      '-y', '-i', inputPath,
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
      wavPath
    ])

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ audioPath: wavPath, tempFile: true })
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`))
      }
    })

    proc.on('error', reject)
  })
}
