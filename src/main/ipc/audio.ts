import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, unlinkSync } from 'fs'
import { getSession, updateSession } from '../storage'
import { getSessionsDir } from '../storage/paths'
import { convertForPlayback } from '../whisper/convert'

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

export function registerAudioHandlers(): void {
  ipcMain.handle('audio:convert', async (_e, sessionId: string) => {
    const session = getSession(sessionId)
    if (!session) throw new Error(`Session not found: ${sessionId}`)

    const outputPath = join(getSessionsDir(), `${sessionId}_audio.mp3`)

    await convertForPlayback(session.audioFile, outputPath, (percent) => {
      broadcast('audio:convert-progress', { sessionId, percent })
    })

    const updated = updateSession(sessionId, { convertedAudioPath: outputPath, audioConvertedCBR: true })
    broadcast('audio:convert-done', { sessionId, convertedAudioPath: updated.convertedAudioPath })
  })

  ipcMain.handle('audio:reset-converted', (_e, sessionId: string) => {
    const session = getSession(sessionId)
    if (!session) return
    if (session.convertedAudioPath && existsSync(session.convertedAudioPath)) {
      try { unlinkSync(session.convertedAudioPath) } catch { /* ignore */ }
    }
    updateSession(sessionId, { convertedAudioPath: undefined, audioConvertedCBR: undefined })
  })
}
