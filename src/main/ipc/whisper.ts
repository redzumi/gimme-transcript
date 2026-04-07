import { ipcMain } from 'electron'
import { transcribeSession, cancelTranscription, transcribeAllSources } from '../whisper'

export function registerWhisperHandlers(): void {
  ipcMain.handle('whisper:transcribe', (_e, sessionId: string) => {
    return transcribeSession(sessionId)
  })

  ipcMain.handle('whisper:transcribe-all', (_e, sessionId: string) => {
    return transcribeAllSources(sessionId)
  })

  ipcMain.handle('whisper:cancel', (_e, sessionId: string) => {
    cancelTranscription(sessionId)
  })
}
