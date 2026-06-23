// T-one acoustic model file management: resolve path + lazy download from
// HuggingFace (mirrors the download/redirect/progress pattern in ipc/models.ts).

import { existsSync, createWriteStream, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'
import https from 'https'
import http from 'http'
import type { ClientRequest, IncomingMessage } from 'http'
import { BrowserWindow } from 'electron'
import { getModelsDir } from '../storage/paths'
import { HF_MODEL_URL, MODEL_DIR_NAME, MODEL_FILE_NAME } from './constants'

export function toneModelDir(): string {
  const dir = join(getModelsDir(), MODEL_DIR_NAME)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function toneModelPath(): string {
  return join(toneModelDir(), MODEL_FILE_NAME)
}

export function isToneModelDownloaded(): boolean {
  return existsSync(toneModelPath())
}

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    function fetch(fetchUrl: string): void {
      const parsed = new URL(fetchUrl)
      const lib = parsed.protocol === 'https:' ? https : http
      const req: ClientRequest = (
        lib.get as (u: string, cb: (res: IncomingMessage) => void) => ClientRequest
      )(fetchUrl, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume()
          const location = res.headers.location
          fetch(
            location.startsWith('http') ? location : `${parsed.protocol}//${parsed.host}${location}`
          )
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let received = 0
        const startTime = Date.now()
        const file = createWriteStream(dest)

        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          const elapsed = (Date.now() - startTime) / 1000 || 0.001
          const percent = total > 0 ? (received / total) * 100 : 0
          broadcast('models:download-progress', {
            model: 't-one',
            percent: Math.min(Math.round(percent), 99),
            bytesPerSec: Math.round(received / elapsed)
          })
        })
        res.pipe(file)

        file.on('finish', () => {
          broadcast('models:download-progress', { model: 't-one', percent: 100, bytesPerSec: 0 })
          broadcast('models:download-done', { model: 't-one' })
          resolve()
        })
        file.on('error', (err) => {
          try {
            unlinkSync(dest)
          } catch {
            /* ignore */
          }
          reject(err)
        })
        res.on('error', (err) => {
          try {
            unlinkSync(dest)
          } catch {
            /* ignore */
          }
          reject(err)
        })
      })
      req.on('error', reject)
    }
    fetch(url)
  })
}

let downloadPromise: Promise<string> | null = null

// Resolve the model path, downloading it once if missing. Concurrent callers
// share a single in-flight download.
export function ensureToneModel(): Promise<string> {
  const dest = toneModelPath()
  if (existsSync(dest)) return Promise.resolve(dest)
  if (downloadPromise) return downloadPromise
  downloadPromise = download(HF_MODEL_URL, dest)
    .then(() => dest)
    .catch((err) => {
      broadcast('models:download-error', {
        model: 't-one',
        message: err instanceof Error ? err.message : String(err)
      })
      throw err
    })
    .finally(() => {
      downloadPromise = null
    })
  return downloadPromise
}
