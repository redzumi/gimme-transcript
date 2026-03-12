import { ipcMain } from 'electron'
import { listSpeakers, createSpeaker, updateSpeaker, deleteSpeaker } from '../storage/speakers'

export function registerSpeakerHandlers(): void {
  ipcMain.handle('speakers:list', () => listSpeakers())

  ipcMain.handle('speakers:create', (_e, name: string) => createSpeaker(name))

  ipcMain.handle('speakers:update', (_e, id: string, name: string) => updateSpeaker(id, name))

  ipcMain.handle('speakers:delete', (_e, id: string) => deleteSpeaker(id))
}
