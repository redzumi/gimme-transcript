import { ipcMain, systemPreferences, shell, BrowserWindow, desktopCapturer } from 'electron'
import { openRecordingWindow, closeRecordingWindow } from '../window/recording'
import { writeFileSync, appendFileSync, existsSync, statSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'
import log from 'electron-log'
import { getRecordingFilePath } from '../storage/paths'
import { createRecordedSession } from '../storage/sessions'
import { listSpeakers, createSpeaker } from '../storage/speakers'
import { getSettings } from '../storage'
import type { AudioSource } from '../../renderer/src/types/ipc'

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

function upsertRecordingSpeakers(): { micSpeakerId: string; systemSpeakerId: string } {
  const speakers = listSpeakers()

  let you = speakers.find((s) => s.name === 'You')
  if (!you) you = createSpeaker('You')

  let other = speakers.find((s) => s.name === 'Other')
  if (!other) other = createSpeaker('Other')

  return { micSpeakerId: you.id, systemSpeakerId: other.id }
}

export function registerRecordingHandlers(): void {
  // Open recording window from main window
  ipcMain.handle('recording:open', () => {
    openRecordingWindow()
  })

  // Check OS-level permissions
  ipcMain.handle('recording:check-permissions', async () => {
    if (process.platform === 'darwin') {
      // Trigger OS dialogs on first run (not-determined state)
      if (systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
        await systemPreferences.askForMediaAccess('microphone')
      }
      if (systemPreferences.getMediaAccessStatus('screen') === 'not-determined') {
        await desktopCapturer.getSources({ types: ['screen'] }).catch(() => {})
      }

      const mic = systemPreferences.getMediaAccessStatus('microphone')
      const screen = systemPreferences.getMediaAccessStatus('screen')
      return {
        mic: mic === 'granted',
        screenRecording: screen === 'granted'
      }
    }
    return { mic: true, screenRecording: true }
  })

  // Open system settings to grant a permission
  ipcMain.handle('recording:open-settings', async (_e, permission: string) => {
    if (process.platform === 'darwin') {
      const urlMap: Record<string, string> = {
        microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
        screenRecording:
          'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
      }
      if (urlMap[permission]) await shell.openExternal(urlMap[permission])
    } else if (process.platform === 'win32' && permission === 'microphone') {
      await shell.openExternal('ms-settings:privacy-microphone')
    }
  })

  // Get current platform
  ipcMain.handle('recording:get-platform', () => process.platform)

  ipcMain.handle('recording:reveal-path', (_e, filePath: string) => {
    try {
      return shell.showItemInFolder(filePath)
    } catch (err) {
      log.error('[RECORDING] reveal path error', { filePath, err })
      return false
    }
  })

  // Start recording: create empty files on disk, return a session ID
  ipcMain.handle('recording:start', () => {
    const sessionId = randomUUID()
    writeFileSync(getRecordingFilePath(sessionId, 'mic'), Buffer.alloc(0))
    writeFileSync(getRecordingFilePath(sessionId, 'speaker'), Buffer.alloc(0))
    log.info('[RECORDING] start', { sessionId })
    return { sessionId }
  })

  // Append a chunk to the appropriate file
  ipcMain.handle(
    'recording:chunk',
    (_e, sessionId: string, source: 'mic' | 'speaker', data: ArrayBuffer) => {
      try {
        appendFileSync(getRecordingFilePath(sessionId, source), Buffer.from(data))
      } catch (err) {
        log.error('[RECORDING] chunk write error', { sessionId, source, err })
      }
    }
  )

  // Stop: finalize files, create session, notify main window
  ipcMain.handle('recording:stop', (_e, sessionId: string, hasSpeaker: boolean) => {
    const micPath = getRecordingFilePath(sessionId, 'mic')
    const speakerPath = getRecordingFilePath(sessionId, 'speaker')

    const micSize = existsSync(micPath) ? statSync(micPath).size : 0
    if (micSize === 0) {
      log.warn('[RECORDING] stop: mic file empty, discarding')
      if (existsSync(micPath)) unlinkSync(micPath)
      if (existsSync(speakerPath)) unlinkSync(speakerPath)
      return null
    }

    const { micSpeakerId, systemSpeakerId } = upsertRecordingSpeakers()

    const audioSources: AudioSource[] = [
      { id: randomUUID(), path: micPath, label: 'Microphone', speakerId: micSpeakerId }
    ]

    const speakerSize = hasSpeaker && existsSync(speakerPath) ? statSync(speakerPath).size : 0

    if (speakerSize > 0) {
      audioSources.push({
        id: randomUUID(),
        path: speakerPath,
        label: 'System Audio',
        speakerId: systemSpeakerId
      })
    } else if (existsSync(speakerPath)) {
      unlinkSync(speakerPath)
    }

    const settings = getSettings()
    const session = createRecordedSession(
      audioSources,
      settings.defaultModel,
      settings.defaultLanguage ?? 'auto'
    )

    log.info('[RECORDING] session created', { sessionId: session.id, sources: audioSources.length })
    broadcast('recording:session-created', { session })
    return session
  })

  // Cancel: delete temp files
  ipcMain.handle('recording:cancel', (_e, sessionId: string) => {
    const mic = getRecordingFilePath(sessionId, 'mic')
    const speaker = getRecordingFilePath(sessionId, 'speaker')
    if (existsSync(mic)) unlinkSync(mic)
    if (existsSync(speaker)) unlinkSync(speaker)
    log.info('[RECORDING] cancelled', { sessionId })
  })

  ipcMain.on('recording:close-window', () => {
    closeRecordingWindow()
  })
}
