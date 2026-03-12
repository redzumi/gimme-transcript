// Prepare audio for whisper-cli.
// Formats natively supported by whisper-cli: flac, mp3, ogg, wav — passed directly.
// Everything else is converted to 16kHz mono WAV via ffmpeg (async, non-blocking).

import { execSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const NATIVE_FORMATS = new Set(['wav', 'mp3', 'ogg', 'flac'])

function ext(filePath: string): string {
  return filePath.toLowerCase().split('.').pop() ?? ''
}

const FFMPEG_FALLBACK_PATHS: Record<NodeJS.Platform, string[]> = {
  darwin: ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'],
  linux: ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/snap/bin/ffmpeg'],
  win32: [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe'
  ]
} as Record<NodeJS.Platform, string[]>

function ffmpegInstallHint(): string {
  if (process.platform === 'darwin') return 'Install with: brew install ffmpeg'
  if (process.platform === 'win32')
    return 'Download from https://ffmpeg.org/download.html and add to PATH'
  return 'Install with: sudo apt install ffmpeg  (or equivalent for your distro)'
}

function findFfmpeg(): string | null {
  const cmd = process.platform === 'win32' ? 'where' : 'which'
  try {
    const result = execSync(`${cmd} ffmpeg`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim()
    return result.split('\n')[0] || null
  } catch {
    const fallbacks = FFMPEG_FALLBACK_PATHS[process.platform] ?? []
    for (const p of fallbacks) {
      if (existsSync(p)) return p
    }
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
  if (!ffmpeg) return Promise.reject(new Error(`ffmpeg not found. ${ffmpegInstallHint()}`))

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-acodec',
      'libmp3lame',
      '-b:a',
      '128k',
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
      if (code === 0) {
        onProgress(100)
        resolve()
      } else reject(new Error(`ffmpeg exited with code ${code}`))
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
        `ffmpeg not found. ${ffmpegInstallHint()}\n` +
          'Required to convert ' +
          ext(inputPath).toUpperCase() +
          ' files.'
      )
    )
  }

  const wavPath = join(tmpdir(), `whisper-${randomUUID()}.wav`)

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, [
      '-y',
      '-i',
      inputPath,
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
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
