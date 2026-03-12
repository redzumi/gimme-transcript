// T-021: Model download manager — fetch from Hugging Face with progress events.

import { ipcMain, BrowserWindow } from 'electron'
import { existsSync, createWriteStream, unlinkSync } from 'fs'
import { join } from 'path'
import https from 'https'
import http from 'http'
import type { ClientRequest, IncomingMessage } from 'http'
import type { WhisperModel, ModelInfo } from '../../renderer/src/types/ipc'
import { getModelsDir } from '../storage/paths'

const MODEL_SIZES: Record<WhisperModel, number> = {
  tiny: 75 * 1024 * 1024,
  base: 142 * 1024 * 1024,
  small: 466 * 1024 * 1024,
  medium: 1500 * 1024 * 1024,
  large: 2900 * 1024 * 1024
}

const MODEL_URLS: Record<WhisperModel, string> = {
  tiny: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  base: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  small: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  medium: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  large: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
}

export function modelFileName(model: WhisperModel): string {
  return `ggml-${model}.bin`
}

export function modelPath(model: WhisperModel): string {
  return join(getModelsDir(), modelFileName(model))
}

export function isModelDownloaded(model: WhisperModel): boolean {
  return existsSync(modelPath(model))
}

// ---------------------------------------------------------------------------

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

interface ActiveDownload {
  cancel: () => void
}

const activeDownloads = new Map<WhisperModel, ActiveDownload>()

function downloadModel(model: WhisperModel): Promise<void> {
  return new Promise((resolve, reject) => {
    const dest = modelPath(model)
    const url = MODEL_URLS[model]
    let currentReq: ClientRequest | null = null
    let cancelled = false

    function fetch(fetchUrl: string): void {
      if (cancelled) {
        reject(new Error('Cancelled'))
        return
      }

      const parsed = new URL(fetchUrl)
      const lib = parsed.protocol === 'https:' ? https : http

      currentReq = (lib.get as (url: string, cb: (res: IncomingMessage) => void) => ClientRequest)(
        fetchUrl,
        (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            const location = res.headers.location
            const next = location.startsWith('http')
              ? location
              : `${parsed.protocol}//${parsed.host}${location}`
            fetch(next)
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
            const bytesPerSec = received / elapsed
            const percent = total > 0 ? (received / total) * 100 : 0
            broadcast('models:download-progress', {
              model,
              percent: Math.min(Math.round(percent), 99),
              bytesPerSec: Math.round(bytesPerSec)
            })
          })

          res.pipe(file)

          file.on('finish', () => {
            activeDownloads.delete(model)
            if (cancelled) {
              try { unlinkSync(dest) } catch { /* ignore */ }
              reject(new Error('Cancelled'))
            } else {
              broadcast('models:download-progress', { model, percent: 100, bytesPerSec: 0 })
              broadcast('models:download-done', { model })
              resolve()
            }
          })

          file.on('error', (err) => {
            activeDownloads.delete(model)
            try { unlinkSync(dest) } catch { /* ignore */ }
            reject(err)
          })

          res.on('error', (err) => {
            activeDownloads.delete(model)
            try { unlinkSync(dest) } catch { /* ignore */ }
            reject(err)
          })
        }
      )

      currentReq.on('error', (err) => {
        if (!cancelled) {
          activeDownloads.delete(model)
          reject(err)
        }
      })
    }

    activeDownloads.set(model, {
      cancel: () => {
        cancelled = true
        currentReq?.destroy()
      }
    })

    fetch(url)
  })
}

// ---------------------------------------------------------------------------

export function registerModelHandlers(): void {
  ipcMain.handle('models:list', (): ModelInfo[] => {
    const models: WhisperModel[] = ['tiny', 'base', 'small', 'medium', 'large']
    return models.map((model) => ({
      model,
      sizeBytes: MODEL_SIZES[model],
      downloaded: isModelDownloaded(model)
    }))
  })

  ipcMain.handle('models:download', async (_e, model: WhisperModel) => {
    if (isModelDownloaded(model)) return
    if (activeDownloads.has(model)) return
    try {
      await downloadModel(model)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message !== 'Cancelled') {
        broadcast('models:download-error', { model, message })
      }
    }
  })

  ipcMain.handle('models:cancel-download', (_e, model: WhisperModel) => {
    activeDownloads.get(model)?.cancel()
    activeDownloads.delete(model)
  })

  ipcMain.handle('models:delete', (_e, model: WhisperModel) => {
    const p = modelPath(model)
    if (existsSync(p)) unlinkSync(p)
  })
}
