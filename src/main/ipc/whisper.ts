import { ipcMain } from 'electron'
import { transcribeSession, cancelTranscription } from '../whisper'

export function registerWhisperHandlers(): void {
  ipcMain.handle('whisper:transcribe', (_e, sessionId: string) => {
    return transcribeSession(sessionId)
  })

  ipcMain.handle('whisper:cancel', (_e, sessionId: string) => {
    cancelTranscription(sessionId)
  })
}
