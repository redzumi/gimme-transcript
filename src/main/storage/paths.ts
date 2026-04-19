import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import type { Settings } from '../../renderer/src/types/ipc'

let _customStoragePath: string | null = null
let _sessionsDirCache: string | null = null
let _modelsDirCache: string | null = null

export function getAppDataPath(): string {
  return app.getPath('userData')
}

export function setCustomStoragePath(p: string | null): void {
  _customStoragePath = p
  _sessionsDirCache = null
  _modelsDirCache = null
}

function getBasePath(): string {
  return _customStoragePath ?? getAppDataPath()
}

export function getSessionsDir(): string {
  if (_sessionsDirCache) return _sessionsDirCache
  const p = join(getBasePath(), 'sessions')
  mkdirSync(p, { recursive: true })
  _sessionsDirCache = p
  return p
}

export function getSessionPath(id: string): string {
  return join(getSessionsDir(), `${id}.json`)
}

export function getSpeakersPath(): string {
  return join(getBasePath(), 'speakers.json')
}

export function getSettingsPath(): string {
  return join(getBasePath(), 'settings.json')
}

export function getModelsDir(): string {
  if (_modelsDirCache) return _modelsDirCache
  const p = join(getBasePath(), 'models')
  mkdirSync(p, { recursive: true })
  _modelsDirCache = p
  return p
}

export function applyStoragePath(settings: Settings): void {
  setCustomStoragePath(settings.storagePath !== getAppDataPath() ? settings.storagePath : null)
}

export function getRecordingFilePath(sessionId: string, source: 'mic' | 'speaker'): string {
  return join(getSessionsDir(), `${sessionId}_${source}.webm`)
}
