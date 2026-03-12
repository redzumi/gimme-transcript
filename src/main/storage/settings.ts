import { readFileSync, writeFileSync, existsSync } from 'fs'
import { app } from 'electron'
import type { Settings } from '../../renderer/src/types/ipc'
import { getSettingsPath } from './paths'

function defaults(): Settings {
  return {
    defaultModel: 'medium',
    defaultLanguage: 'auto',
    storagePath: app.getPath('userData')
  }
}

export function getSettings(): Settings {
  const p = getSettingsPath()
  if (!existsSync(p)) return defaults()
  try {
    return { ...defaults(), ...(JSON.parse(readFileSync(p, 'utf8')) as Partial<Settings>) }
  } catch {
    return defaults()
  }
}

export function updateSettings(data: Partial<Settings>): Settings {
  const current = getSettings()
  const updated: Settings = { ...current, ...data }
  writeFileSync(getSettingsPath(), JSON.stringify(updated, null, 2), 'utf8')
  return updated
}
