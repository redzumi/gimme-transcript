import { BrowserWindow, app, desktopCapturer } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import log from 'electron-log'

let recordingWindow: BrowserWindow | null = null

export function openRecordingWindow(): void {
  if (recordingWindow && !recordingWindow.isDestroyed()) {
    recordingWindow.focus()
    return
  }

  recordingWindow = new BrowserWindow({
    width: 328,
    height: 88,
    frame: false,
    transparent: false,
    backgroundColor: '#fffaf5',
    alwaysOnTop: true,
    skipTaskbar: true,
    movable: true,
    focusable: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/recording.js'),
      sandbox: false
    }
  })

  recordingWindow.setAlwaysOnTop(true, 'screen-saver', 1)
  recordingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  recordingWindow.setFullScreenable(false)

  if (process.platform === 'darwin') {
    void app.dock?.show()
  }

  recordingWindow.webContents.session.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      callback({ video: sources[0] ?? null, audio: 'loopback' })
    } catch {
      callback({})
    }
  })

  recordingWindow.once('ready-to-show', () => {
    recordingWindow?.showInactive()
  })

  recordingWindow.on('closed', () => {
    log.info('[WINDOW](Recording) closed')
    recordingWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    recordingWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/recording/index.html`)
  } else {
    recordingWindow.loadFile(join(__dirname, '../renderer/recording/index.html'))
  }

  log.info('[WINDOW](Recording) created')
}

export function closeRecordingWindow(): void {
  if (recordingWindow && !recordingWindow.isDestroyed()) {
    recordingWindow.close()
  }
}

export function getRecordingWindow(): BrowserWindow | null {
  return recordingWindow
}
