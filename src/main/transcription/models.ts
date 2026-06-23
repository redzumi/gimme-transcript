// Engine-agnostic model manager: per-engine model directories, download/delete,
// and readiness status. Local engines (whisper ggml, t-one onnx) download files;
// cloud engines (openai) have nothing to download — readiness depends on an API
// key (see engineStatus).

import { existsSync, createWriteStream, unlinkSync, mkdirSync } from 'fs'
import { basename, join } from 'path'
import https from 'https'
import http from 'http'
import type { ClientRequest, IncomingMessage } from 'http'
import { BrowserWindow } from 'electron'
import type { EngineModelInfo } from '../../renderer/src/types/ipc'
import { getModelsDir } from '../storage/paths'
import { getSettings } from '../storage/settings'
import { ENGINE_REGISTRY } from './registry'
import { getEngineDef } from './types'
import type { EngineDef, ModelDef } from './types'

export type EngineStatus = 'available' | 'needs-download' | 'needs-key' | 'unavailable'

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

// whisper keeps the legacy flat models/ dir (back-compat with ipc/models.ts);
// every other engine gets models/<engineId>/.
export function engineModelDir(engineId: string): string {
  const dir = engineId === 'whisper' ? getModelsDir() : join(getModelsDir(), engineId)
  mkdirSync(dir, { recursive: true })
  return dir
}

function isLocalModel(engine: EngineDef): boolean {
  return !engine.features.requiresNetwork
}

export function modelFilePath(engineId: string, def: ModelDef): string {
  return join(engineModelDir(engineId), basename(new URL(def.url).pathname))
}

export function isModelDownloaded(engine: EngineDef, def: ModelDef): boolean {
  if (!isLocalModel(engine)) return true // cloud model: nothing to fetch
  return existsSync(modelFilePath(engine.id, def))
}

export function getEngineModels(engineId: string): EngineModelInfo[] {
  const engine = getEngineDef(ENGINE_REGISTRY, engineId)
  if (!engine) return []
  return engine.models.map((m) => ({
    id: m.id,
    name: m.name,
    sizeBytes: m.sizeBytes,
    downloaded: isModelDownloaded(engine, m),
    pricePerMinute: m.pricePerMinute
  }))
}

function apiKeyFor(engineId: string): string | undefined {
  if (engineId === 'openai') return getSettings().openaiApiKey
  return undefined
}

export function engineStatus(engineId: string): EngineStatus {
  const engine = getEngineDef(ENGINE_REGISTRY, engineId)
  if (!engine) return 'unavailable'
  if (engine.features.requiresApiKey) {
    return apiKeyFor(engineId) ? 'available' : 'needs-key'
  }
  if (isLocalModel(engine) && engine.models.length > 0) {
    const anyDownloaded = engine.models.some((m) => isModelDownloaded(engine, m))
    if (!anyDownloaded) return 'needs-download'
  }
  return 'available'
}

// ---------------------------------------------------------------------------

const activeDownloads = new Map<string, () => void>()
const dlKey = (engineId: string, modelId: string): string => `${engineId}:${modelId}`

function downloadFile(
  url: string,
  dest: string,
  onProgress: (received: number, total: number) => void,
  isCancelled: () => boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    function fetch(fetchUrl: string): void {
      if (isCancelled()) {
        reject(new Error('Cancelled'))
        return
      }
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
          const loc = res.headers.location
          fetch(loc.startsWith('http') ? loc : `${parsed.protocol}//${parsed.host}${loc}`)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let received = 0
        const file = createWriteStream(dest)
        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          onProgress(received, total)
        })
        res.pipe(file)
        file.on('finish', () => {
          if (isCancelled()) {
            try {
              unlinkSync(dest)
            } catch {
              /* ignore */
            }
            reject(new Error('Cancelled'))
          } else {
            resolve()
          }
        })
        file.on('error', (err) => {
          try {
            unlinkSync(dest)
          } catch {
            /* ignore */
          }
          reject(err)
        })
        res.on('error', reject)
      })
      req.on('error', reject)
    }
    fetch(url)
  })
}

export async function downloadEngineModel(engineId: string, modelId: string): Promise<void> {
  const engine = getEngineDef(ENGINE_REGISTRY, engineId)
  const def = engine?.models.find((m) => m.id === modelId)
  if (!engine || !def) throw new Error(`Unknown model ${engineId}/${modelId}`)
  if (!isLocalModel(engine)) return // cloud: nothing to download
  const dest = modelFilePath(engineId, def)
  if (existsSync(dest)) return
  if (activeDownloads.has(dlKey(engineId, modelId))) return

  let cancelled = false
  activeDownloads.set(dlKey(engineId, modelId), () => {
    cancelled = true
  })
  const startTime = Date.now()
  try {
    await downloadFile(
      def.url,
      dest,
      (received, total) => {
        const elapsed = (Date.now() - startTime) / 1000 || 0.001
        broadcast('engines:download-progress', {
          engineId,
          modelId,
          percent: total > 0 ? Math.min(Math.round((received / total) * 100), 99) : 0,
          bytesPerSec: Math.round(received / elapsed)
        })
      },
      () => cancelled
    )
    broadcast('engines:download-progress', { engineId, modelId, percent: 100, bytesPerSec: 0 })
    broadcast('engines:download-done', { engineId, modelId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message !== 'Cancelled') {
      broadcast('engines:download-error', { engineId, modelId, message })
    }
    throw err
  } finally {
    activeDownloads.delete(dlKey(engineId, modelId))
  }
}

export function cancelEngineDownload(engineId: string, modelId: string): void {
  activeDownloads.get(dlKey(engineId, modelId))?.()
  activeDownloads.delete(dlKey(engineId, modelId))
}

export function deleteEngineModel(engineId: string, modelId: string): void {
  const engine = getEngineDef(ENGINE_REGISTRY, engineId)
  const def = engine?.models.find((m) => m.id === modelId)
  if (!engine || !def || !isLocalModel(engine)) return
  const p = modelFilePath(engineId, def)
  if (existsSync(p)) unlinkSync(p)
}
