import { ipcMain } from 'electron'
import { getSettings, updateSettings, setCustomStoragePath } from '../storage'
import type { Settings } from '../../renderer/src/types/ipc'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:update', (_e, data: Partial<Settings>) => {
    const updated = updateSettings(data)
    if (data.storagePath) {
      setCustomStoragePath(data.storagePath)
    }
    return updated
  })
}
