import { ipcMain } from 'electron'
import {
  listSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession
} from '../storage/sessions'
import type { Session } from '../../renderer/src/types/ipc'

export function registerSessionHandlers(): void {
  ipcMain.handle('sessions:list', () => listSessions())

  ipcMain.handle('sessions:get', (_e, id: string) => getSession(id))

  ipcMain.handle(
    'sessions:create',
    (_e, audioFile: string, model: string, language: string, engine?: string) =>
      createSession(audioFile, model, language, engine)
  )

  ipcMain.handle('sessions:update', (_e, id: string, data: Partial<Session>) =>
    updateSession(id, data)
  )

  ipcMain.handle('sessions:delete', (_e, id: string) => deleteSession(id))
}
