# Dual-Source Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record mic + system audio simultaneously into one session with auto-labeled speakers, saved as `audioSources[]` per session.

**Architecture:** Separate always-on-top frameless BrowserWindow for recording UI; MediaRecorder streams chunks via IPC to main process which writes files; on stop, main creates session and notifies main window. `audioSources: AudioSource[]` replaces the single `audioFile` field via in-place migration.

**Tech Stack:** Electron 39, React 19, TypeScript, Mantine 8, Tailwind 3, electron-vite 5, Web Audio API (AnalyserNode), MediaRecorder API, desktopCapturer (main process)

---

## File Map

**New files:**

- `src/renderer/recording/index.html` — recording window HTML entry
- `src/renderer/recording/main.tsx` — React root for recording window
- `src/renderer/recording/App.tsx` — state machine: checking → permissions | recording
- `src/renderer/recording/PermissionsGate.tsx` — permission request UI
- `src/renderer/recording/RecordingPanel.tsx` — active recording UI
- `src/renderer/recording/VuMeter.tsx` — animated level bar component
- `src/renderer/recording/useRecording.ts` — hook: MediaRecorder + AnalyserNode + IPC
- `src/preload/recording.ts` — contextBridge for recording window
- `src/preload/recording.d.ts` — TypeScript declarations for window.recordingApi
- `src/main/window/recording.ts` — BrowserWindow lifecycle for recording window
- `src/main/ipc/recording.ts` — all recording IPC handlers

**Modified files:**

- `src/renderer/src/types/ipc.ts` — AudioSource type, Session v2, new IPC channels
- `src/main/storage/sessions.ts` — migrate() + createSession() with audioSources
- `src/main/storage/paths.ts` — recording file path helpers
- `src/main/whisper/runner.ts` — extract runWhisper(), add transcribeAllSources()
- `src/main/ipc/audio.ts` — use audioSources[0].path
- `src/main/ipc/index.ts` — register recording handlers
- `src/main/ipc/whisper.ts` — add whisper:transcribe-all handler
- `src/main/index.ts` — setPermissionRequestHandler, import recording window
- `src/renderer/src/screens/Home.tsx` — Record button, session-created listener
- `src/renderer/src/screens/Session.tsx` — fix audioFile refs, multi-source transcribe UI
- `electron.vite.config.ts` — add recording preload + renderer entries
- `tailwind.config.js` — add recording window to content paths

---

## Task 1: Session schema — types and migration

**Files:**

- Modify: `src/renderer/src/types/ipc.ts`
- Modify: `src/main/storage/sessions.ts`

- [ ] **Step 1: Add AudioSource interface and update Session in ipc.ts**

Replace the `Session` interface and add `AudioSource`. Also add the new IPC channels.

In `src/renderer/src/types/ipc.ts`, replace the entire file with:

```typescript
// Shared IPC type definitions — used by preload and renderer.

export type WhisperModel = 'tiny' | 'base' | 'small' | 'medium' | 'large'

export interface AudioSource {
  id: string
  path: string
  label: string
  speakerId: string | null
}

export interface Session {
  schemaVersion: number
  id: string
  name?: string
  createdAt: string
  model: WhisperModel
  language: string
  status: 'idle' | 'transcribing' | 'done'
  segments: Segment[]
  audioSources: AudioSource[]
  convertedAudioPath?: string
  audioConvertedCBR?: boolean
  recordingSource?: 'recorded'
  // v1 legacy — only for migration
  audioFile?: string
}

export interface Segment {
  id: string
  start: number
  end: number
  text: string
  speakerId: string | null
}

export interface Speaker {
  id: string
  name: string
  createdAt: string
}

export interface Settings {
  defaultModel: WhisperModel
  defaultLanguage: string
  storagePath: string
}

export interface ModelInfo {
  model: WhisperModel
  sizeBytes: number
  downloaded: boolean
}

// ---------------------------------------------------------------------------
// Invoke channels (renderer → main, returns a value)
// ---------------------------------------------------------------------------

export interface IpcInvokeMap {
  // Sessions
  'sessions:list': { args: []; return: Session[] }
  'sessions:get': { args: [id: string]; return: Session | null }
  'sessions:create': {
    args: [audioFile: string, model: WhisperModel, language: string]
    return: Session
  }
  'sessions:update': { args: [id: string, data: Partial<Session>]; return: Session }
  'sessions:delete': { args: [id: string]; return: void }

  // Speakers
  'speakers:list': { args: []; return: Speaker[] }
  'speakers:create': { args: [name: string]; return: Speaker }
  'speakers:update': { args: [id: string, name: string]; return: Speaker }
  'speakers:delete': { args: [id: string]; return: void }

  // Settings
  'settings:get': { args: []; return: Settings }
  'settings:update': { args: [data: Partial<Settings>]; return: Settings }

  // Models
  'models:list': { args: []; return: ModelInfo[] }
  'models:download': { args: [model: WhisperModel]; return: void }
  'models:cancel-download': { args: [model: WhisperModel]; return: void }
  'models:delete': { args: [model: WhisperModel]; return: void }

  // Whisper transcription
  'whisper:transcribe': { args: [sessionId: string]; return: void }
  'whisper:transcribe-all': { args: [sessionId: string]; return: void }
  'whisper:cancel': { args: [sessionId: string]; return: void }

  // Native dialogs
  'dialog:open-audio': { args: []; return: string[] | null }
  'dialog:open-text': { args: []; return: { path: string; content: string } | null }
  'dialog:save': { args: [defaultName: string, format: 'md' | 'txt']; return: string | null }

  // Audio conversion
  'audio:convert': { args: [sessionId: string]; return: void }
  'audio:reset-converted': { args: [sessionId: string]; return: void }

  // File export
  'export:write': { args: [filePath: string, content: string]; return: void }

  // Recording window
  'recording:open': { args: []; return: void }
}

export type IpcInvokeChannel = keyof IpcInvokeMap

// ---------------------------------------------------------------------------
// Event channels (main → renderer, one-way push)
// ---------------------------------------------------------------------------

export interface IpcEventMap {
  'whisper:segment': { sessionId: string; segment: Segment }
  'whisper:progress': { sessionId: string; percent: number; eta: number | null }
  'whisper:done': { sessionId: string }
  'whisper:error': { sessionId: string; message: string }
  'models:download-progress': { model: WhisperModel; percent: number; bytesPerSec: number }
  'models:download-done': { model: WhisperModel }
  'models:download-error': { model: WhisperModel; message: string }
  'audio:convert-progress': { sessionId: string; percent: number }
  'audio:convert-done': { sessionId: string; convertedAudioPath: string }
  'audio:convert-error': { sessionId: string; message: string }
  'recording:session-created': { session: Session }
}

export type IpcEventChannel = keyof IpcEventMap

// ---------------------------------------------------------------------------
// Typed invoke / on helpers (used in preload and renderer)
// ---------------------------------------------------------------------------

export type InvokeArgs<C extends IpcInvokeChannel> = IpcInvokeMap[C]['args']
export type InvokeReturn<C extends IpcInvokeChannel> = IpcInvokeMap[C]['return']
export type EventPayload<C extends IpcEventChannel> = IpcEventMap[C]
```

- [ ] **Step 2: Update migrate() and createSession() in sessions.ts**

In `src/main/storage/sessions.ts`, update the imports and `migrate` + `createSession` functions:

```typescript
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Session, AudioSource, WhisperModel } from '../../renderer/src/types/ipc'
import { getSessionPath, getSessionsDir } from './paths'

function migrate(session: Session): Session {
  let s = { ...session }
  // v1 → v2: backfill schemaVersion and audioSources
  if (!s.schemaVersion) {
    s.schemaVersion = 1
  }
  if (!s.audioSources) {
    s.audioSources = [
      {
        id: randomUUID(),
        path: s.audioFile ?? '',
        label: 'Audio',
        speakerId: null
      }
    ]
    s.schemaVersion = 2
  }
  return s
}
```

Update `createSession` to always populate `audioSources`:

```typescript
export function createSession(audioFile: string, model: WhisperModel, language: string): Session {
  const defaultName =
    audioFile
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? audioFile
  const sourceId = randomUUID()
  const session: Session = {
    schemaVersion: 2,
    id: randomUUID(),
    name: defaultName || 'Session',
    createdAt: new Date().toISOString(),
    audioFile,
    audioSources: [{ id: sourceId, path: audioFile, label: 'Audio', speakerId: null }],
    model,
    language,
    status: 'idle',
    segments: []
  }
  write(session)
  return session
}
```

Add a new export used by the recording IPC handler:

```typescript
export function createRecordedSession(
  audioSources: AudioSource[],
  model: WhisperModel,
  language: string
): Session {
  const firstName =
    audioSources[0]?.path
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? 'Recording'
  const session: Session = {
    schemaVersion: 2,
    id: randomUUID(),
    name: firstName,
    createdAt: new Date().toISOString(),
    audioSources,
    model,
    language,
    status: 'idle',
    segments: [],
    recordingSource: 'recorded'
  }
  write(session)
  return session
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/types/ipc.ts src/main/storage/sessions.ts
git commit -m "feat: add AudioSource type and audioSources migration to Session schema"
```

---

## Task 2: Fix all audioFile references in existing code

**Files:**

- Modify: `src/main/whisper/runner.ts:41`
- Modify: `src/main/ipc/audio.ts:21,25`
- Modify: `src/renderer/src/screens/Session.tsx:227,229,254,303`

- [ ] **Step 1: Fix runner.ts — use audioSources[0].path**

In `src/main/whisper/runner.ts`, update line 41:

```typescript
// Before:
const { audioPath, tempFile } = await prepareAudio(session.audioFile)

// After:
const primaryPath = session.audioSources[0]?.path ?? ''
const { audioPath, tempFile } = await prepareAudio(primaryPath)
```

- [ ] **Step 2: Fix audio.ts — use audioSources[0].path**

In `src/main/ipc/audio.ts`, update lines 20-22:

```typescript
// Before:
await convertForPlayback(session.audioFile, outputPath, (percent) => {

// After:
const primaryPath = session.audioSources[0]?.path ?? ''
await convertForPlayback(primaryPath, outputPath, (percent) => {
```

- [ ] **Step 3: Fix Session.tsx — four audioFile usages**

In `src/renderer/src/screens/Session.tsx`:

Line 227 — `hasAudio` check:

```typescript
// Before:
const hasAudio = !!session?.audioFile && session.audioFile !== ''

// After:
const hasAudio = (session?.audioSources?.[0]?.path ?? '') !== ''
```

Line 229 — `audioSrc` computation:

```typescript
// Before:
? 'file://' + encodeURI(session?.convertedAudioPath ?? session?.audioFile ?? '')

// After:
? 'file://' + encodeURI(session?.convertedAudioPath ?? session?.audioSources?.[0]?.path ?? '')
```

Line 254 — extension check for playback:

```typescript
// Before:
const ext = session.audioFile.split('.').pop()?.toLowerCase() ?? ''

// After:
const ext = (session.audioSources[0]?.path ?? '').split('.').pop()?.toLowerCase() ?? ''
```

Line 303 — session name fallback:

```typescript
// Before:
const sessionName = session.name ?? session.audioFile.split('/').pop() ?? session.audioFile

// After:
const sessionName = session.name ?? session.audioSources[0]?.path.split('/').pop() ?? 'Session'
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/whisper/runner.ts src/main/ipc/audio.ts src/renderer/src/screens/Session.tsx
git commit -m "refactor: replace session.audioFile with audioSources[0].path in all existing code"
```

---

## Task 3: Build config — add recording window entries

**Files:**

- Modify: `electron.vite.config.ts`
- Modify: `tailwind.config.js`

- [ ] **Step 1: Update electron.vite.config.ts**

Replace the file with:

```typescript
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          recording: resolve(__dirname, 'src/preload/recording.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          recording: resolve(__dirname, 'src/renderer/recording/index.html')
        }
      }
    },
    plugins: [react()]
  }
})
```

- [ ] **Step 2: Update tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
    './src/renderer/recording/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {}
  },
  plugins: []
}
```

- [ ] **Step 3: Commit**

```bash
git add electron.vite.config.ts tailwind.config.js
git commit -m "build: add recording window entry to electron-vite and tailwind config"
```

---

## Task 4: Main process — recording IPC handlers

**Files:**

- Modify: `src/main/storage/paths.ts`
- Create: `src/main/ipc/recording.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add recording file path helpers to paths.ts**

Append to `src/main/storage/paths.ts`:

```typescript
export function getRecordingFilePath(sessionId: string, source: 'mic' | 'speaker'): string {
  return join(getSessionsDir(), `${sessionId}_${source}.webm`)
}
```

- [ ] **Step 2: Create src/main/ipc/recording.ts**

```typescript
import { ipcMain, systemPreferences, shell, BrowserWindow, desktopCapturer } from 'electron'
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
      const mic = systemPreferences.getMediaAccessStatus('microphone')
      const screen = systemPreferences.getMediaAccessStatus('screen')
      return {
        mic: mic === 'granted',
        screenRecording: screen === 'granted'
      }
    }
    // Windows / Linux: mic only — system audio needs no extra OS permission
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

  // Get desktop sources for system audio capture
  ipcMain.handle('recording:get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    return sources.map((s) => ({ id: s.id, name: s.name }))
  })

  // Get current platform
  ipcMain.handle('recording:get-platform', () => process.platform)

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
}
```

- [ ] **Step 3: Register in ipc/index.ts**

Add the import and call to `src/main/ipc/index.ts`:

```typescript
import { registerSessionHandlers } from './sessions'
import { registerSpeakerHandlers } from './speakers'
import { registerSettingsHandlers } from './settings'
import { registerDialogHandlers } from './dialog'
import { registerModelHandlers } from './models'
import { registerWhisperHandlers } from './whisper'
import { registerAudioHandlers } from './audio'
import { registerRecordingHandlers } from './recording'

export function registerHandlers(): void {
  registerSessionHandlers()
  registerSpeakerHandlers()
  registerSettingsHandlers()
  registerDialogHandlers()
  registerModelHandlers()
  registerWhisperHandlers()
  registerAudioHandlers()
  registerRecordingHandlers()
}
```

- [ ] **Step 4: Add setPermissionRequestHandler to main/index.ts**

In `src/main/index.ts`, add to the `app.whenReady()` block, before `registerHandlers()`:

```typescript
import { app, shell, BrowserWindow, session } from 'electron'
```

And inside `app.whenReady().then(() => {`:

```typescript
// Allow media permissions (mic + screen) for all windows
session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
  if (permission === 'media') {
    callback(true)
  } else {
    callback(false)
  }
})
```

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/storage/paths.ts src/main/ipc/recording.ts src/main/ipc/index.ts src/main/index.ts
git commit -m "feat: add recording IPC handlers (start, chunk, stop, cancel, permissions)"
```

---

## Task 5: Recording BrowserWindow management

**Files:**

- Create: `src/main/window/recording.ts`

- [ ] **Step 1: Create src/main/window/recording.ts**

```typescript
import { BrowserWindow, app } from 'electron'
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
    width: 360,
    height: 200,
    frame: false,
    transparent: true,
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
```

- [ ] **Step 2: Commit**

```bash
git add src/main/window/recording.ts
git commit -m "feat: add recording BrowserWindow with alwaysOnTop and workspace visibility"
```

---

## Task 6: Recording window preload

**Files:**

- Create: `src/preload/recording.ts`
- Create: `src/preload/recording.d.ts`

- [ ] **Step 1: Create src/preload/recording.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

const recordingApi = {
  checkPermissions: (): Promise<{ mic: boolean; screenRecording: boolean }> =>
    ipcRenderer.invoke('recording:check-permissions'),

  openSettings: (permission: string): Promise<void> =>
    ipcRenderer.invoke('recording:open-settings', permission),

  getDesktopSources: (): Promise<Array<{ id: string; name: string }>> =>
    ipcRenderer.invoke('recording:get-desktop-sources'),

  getPlatform: (): Promise<string> => ipcRenderer.invoke('recording:get-platform'),

  start: (): Promise<{ sessionId: string }> => ipcRenderer.invoke('recording:start'),

  sendChunk: (sessionId: string, source: 'mic' | 'speaker', data: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('recording:chunk', sessionId, source, data),

  stop: (sessionId: string, hasSpeaker: boolean): Promise<unknown> =>
    ipcRenderer.invoke('recording:stop', sessionId, hasSpeaker),

  cancel: (sessionId: string): Promise<void> => ipcRenderer.invoke('recording:cancel', sessionId),

  closeWindow: (): void => ipcRenderer.send('recording:close-window')
}

contextBridge.exposeInMainWorld('recordingApi', recordingApi)
```

- [ ] **Step 2: Add close-window handler to recording.ts IPC**

In `src/main/ipc/recording.ts`, add to `registerRecordingHandlers()`:

```typescript
import { ipcMain, ..., } from 'electron'
import { closeRecordingWindow } from '../window/recording'

// Inside registerRecordingHandlers():
ipcMain.on('recording:close-window', () => {
  closeRecordingWindow()
})
```

- [ ] **Step 3: Create src/preload/recording.d.ts**

```typescript
export interface RecordingApi {
  checkPermissions(): Promise<{ mic: boolean; screenRecording: boolean }>
  openSettings(permission: string): Promise<void>
  getDesktopSources(): Promise<Array<{ id: string; name: string }>>
  getPlatform(): Promise<string>
  start(): Promise<{ sessionId: string }>
  sendChunk(sessionId: string, source: 'mic' | 'speaker', data: ArrayBuffer): Promise<void>
  stop(sessionId: string, hasSpeaker: boolean): Promise<unknown>
  cancel(sessionId: string): Promise<void>
  closeWindow(): void
}

declare global {
  interface Window {
    recordingApi: RecordingApi
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/preload/recording.ts src/preload/recording.d.ts src/main/ipc/recording.ts
git commit -m "feat: add recording window preload with contextBridge"
```

---

## Task 7: Recording window React app

**Files:**

- Create: `src/renderer/recording/index.html`
- Create: `src/renderer/recording/main.tsx`
- Create: `src/renderer/recording/App.tsx`
- Create: `src/renderer/recording/VuMeter.tsx`
- Create: `src/renderer/recording/PermissionsGate.tsx`
- Create: `src/renderer/recording/RecordingPanel.tsx`
- Create: `src/renderer/recording/useRecording.ts`

- [ ] **Step 1: Create index.html**

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Recording</title>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
      }
      body {
        background: transparent;
        overflow: hidden;
        font-family:
          'Avenir Next',
          Inter,
          -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          sans-serif;
        -webkit-font-smoothing: antialiased;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create main.tsx**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import App from './App'

const theme = createTheme({
  primaryColor: 'sunset',
  defaultRadius: 'md',
  colors: {
    sunset: [
      '#fff0eb',
      '#ffd8cd',
      '#ffb7a1',
      '#ff9477',
      '#ff7458',
      '#ff5a46',
      '#ff4d6d',
      '#e53b61',
      '#c92f58',
      '#ac254c'
    ],
    lilac: [
      '#f6efff',
      '#e7d7ff',
      '#d5b9ff',
      '#c195ff',
      '#af74ff',
      '#a05dff',
      '#8f3ff2',
      '#7d31d5',
      '#6c27b7',
      '#591f97'
    ]
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider defaultColorScheme="light" theme={theme}>
      <App />
    </MantineProvider>
  </StrictMode>
)
```

- [ ] **Step 3: Create VuMeter.tsx**

```tsx
interface Props {
  level: number // 0–1
  label: string
  icon: string
  available: boolean
}

export function VuMeter({ level, label, icon, available }: Props): React.JSX.Element {
  const barWidth = available ? Math.round(level * 100) : 0

  return (
    <div className="flex items-center gap-2 px-1">
      <span className="text-base w-5 text-center">{icon}</span>
      <div className="flex-1">
        <p className="text-[10px] font-medium text-[#5b4653] mb-0.5 uppercase tracking-wide leading-none">
          {label}
        </p>
        <div className="h-1.5 w-full rounded-full bg-[#f3e5dd] overflow-hidden">
          {available ? (
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#ff7458] to-[#ff4d6d] transition-all duration-75"
              style={{ width: `${barWidth}%` }}
            />
          ) : (
            <div className="h-full w-full rounded-full bg-[#e0d0d8]" />
          )}
        </div>
      </div>
      {!available && (
        <span className="text-[9px] text-[#ccb8c1] whitespace-nowrap">unavailable</span>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create PermissionsGate.tsx**

```tsx
import { useState } from 'react'
import { Button } from '@mantine/core'

interface Permissions {
  mic: boolean
  screenRecording: boolean
}

interface Props {
  permissions: Permissions
  platform: string
  onRecheck: () => void
}

export function PermissionsGate({ permissions, platform, onRecheck }: Props): React.JSX.Element {
  const [checking, setChecking] = useState(false)

  async function openSettings(permission: string): Promise<void> {
    await window.recordingApi.openSettings(permission)
  }

  async function recheck(): Promise<void> {
    setChecking(true)
    await new Promise((r) => setTimeout(r, 500))
    onRecheck()
    setChecking(false)
  }

  return (
    <div
      className="w-[360px] rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/88 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-[18px] p-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <p className="text-xs font-semibold text-[#24191f] mb-3">Permissions needed to record</p>

        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>🎤</span>
              <span className="text-xs text-[#5b4653]">Microphone</span>
              <span className="text-[9px] uppercase font-medium text-red-400 bg-red-50 px-1.5 py-0.5 rounded">
                required
              </span>
            </div>
            {permissions.mic ? (
              <span className="text-xs text-emerald-500">✓ granted</span>
            ) : (
              <Button
                size="xs"
                variant="subtle"
                color="sunset"
                onClick={() => openSettings('microphone')}
              >
                Open Settings
              </Button>
            )}
          </div>

          {platform === 'darwin' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>🖥</span>
                <span className="text-xs text-[#5b4653]">Screen Recording</span>
                <span className="text-[9px] uppercase font-medium text-[#ccb8c1] bg-[#f8f0f5] px-1.5 py-0.5 rounded">
                  for system audio
                </span>
              </div>
              {permissions.screenRecording ? (
                <span className="text-xs text-emerald-500">✓ granted</span>
              ) : (
                <Button
                  size="xs"
                  variant="subtle"
                  color="lilac"
                  onClick={() => openSettings('screenRecording')}
                >
                  Open Settings
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            size="xs"
            flex={1}
            color="sunset"
            disabled={!permissions.mic || checking}
            loading={checking}
            onClick={recheck}
          >
            {permissions.mic ? 'Start Recording' : 'Recheck'}
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="gray"
            onClick={() => window.recordingApi.closeWindow()}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create useRecording.ts**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react'

interface RecordingState {
  sessionId: string | null
  isRecording: boolean
  micLevel: number
  speakerLevel: number
  speakerAvailable: boolean
  elapsed: number
}

interface UseRecordingReturn extends RecordingState {
  stop: () => Promise<void>
}

export function useRecording(): UseRecordingReturn {
  const [state, setState] = useState<RecordingState>({
    sessionId: null,
    isRecording: false,
    micLevel: 0,
    speakerLevel: 0,
    speakerAvailable: false,
    elapsed: 0
  })

  const micRecorderRef = useRef<MediaRecorder | null>(null)
  const speakerRecorderRef = useRef<MediaRecorder | null>(null)
  const micAnalyserRef = useRef<AnalyserNode | null>(null)
  const speakerAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const sessionIdRef = useRef<string | null>(null)
  const speakerAvailableRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function startRecording(): Promise<void> {
      const { sessionId } = await window.recordingApi.start()
      if (cancelled) {
        await window.recordingApi.cancel(sessionId)
        return
      }
      sessionIdRef.current = sessionId

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx

      // Microphone
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const micSrc = audioCtx.createMediaStreamSource(micStream)
      const micAnalyser = audioCtx.createAnalyser()
      micAnalyser.fftSize = 256
      micSrc.connect(micAnalyser)
      micAnalyserRef.current = micAnalyser

      const micRecorder = new MediaRecorder(micStream)
      micRecorderRef.current = micRecorder
      micRecorder.ondataavailable = async (e): Promise<void> => {
        if (e.data.size > 0 && sessionIdRef.current) {
          const buf = await e.data.arrayBuffer()
          await window.recordingApi.sendChunk(sessionIdRef.current, 'mic', buf)
        }
      }
      micRecorder.start(1000)

      // System audio
      try {
        const sources = await window.recordingApi.getDesktopSources()
        if (sources.length > 0) {
          const speakerStream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'desktop' } },
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sources[0].id,
                minWidth: 1,
                maxWidth: 1,
                minHeight: 1,
                maxHeight: 1
              }
            }
          } as MediaStreamConstraints)

          speakerStream.getVideoTracks().forEach((t) => t.stop())
          const audioOnly = new MediaStream(speakerStream.getAudioTracks())

          const speakerSrc = audioCtx.createMediaStreamSource(audioOnly)
          const speakerAnalyser = audioCtx.createAnalyser()
          speakerAnalyser.fftSize = 256
          speakerSrc.connect(speakerAnalyser)
          speakerAnalyserRef.current = speakerAnalyser

          const speakerRecorder = new MediaRecorder(audioOnly)
          speakerRecorderRef.current = speakerRecorder
          speakerRecorder.ondataavailable = async (e): Promise<void> => {
            if (e.data.size > 0 && sessionIdRef.current) {
              const buf = await e.data.arrayBuffer()
              await window.recordingApi.sendChunk(sessionIdRef.current, 'speaker', buf)
            }
          }
          speakerRecorder.start(1000)
          speakerAvailableRef.current = true
        }
      } catch {
        speakerAvailableRef.current = false
      }

      startTimeRef.current = Date.now()

      if (!cancelled) {
        setState((prev) => ({
          ...prev,
          sessionId,
          isRecording: true,
          speakerAvailable: speakerAvailableRef.current
        }))
      }

      const dataArr = new Uint8Array(128)

      function animate(): void {
        rafRef.current = requestAnimationFrame(animate)

        setState((prev) => ({
          ...prev,
          elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000)
        }))

        if (micAnalyserRef.current) {
          micAnalyserRef.current.getByteFrequencyData(dataArr)
          const avg = dataArr.reduce((s, v) => s + v, 0) / dataArr.length / 255
          setState((prev) => ({ ...prev, micLevel: avg }))
        }

        if (speakerAnalyserRef.current) {
          speakerAnalyserRef.current.getByteFrequencyData(dataArr)
          const avg = dataArr.reduce((s, v) => s + v, 0) / dataArr.length / 255
          setState((prev) => ({ ...prev, speakerLevel: avg }))
        }
      }
      animate()
    }

    startRecording().catch(console.error)

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      micRecorderRef.current?.stop()
      speakerRecorderRef.current?.stop()
      audioCtxRef.current?.close()
    }
  }, [])

  const stop = useCallback(async (): Promise<void> => {
    if (!sessionIdRef.current) return

    cancelAnimationFrame(rafRef.current)

    await Promise.all([
      micRecorderRef.current
        ? new Promise<void>((res) => {
            micRecorderRef.current!.addEventListener('stop', () => res(), { once: true })
            micRecorderRef.current!.stop()
          })
        : Promise.resolve(),
      speakerRecorderRef.current
        ? new Promise<void>((res) => {
            speakerRecorderRef.current!.addEventListener('stop', () => res(), { once: true })
            speakerRecorderRef.current!.stop()
          })
        : Promise.resolve()
    ])

    // Allow final IPC writes to complete
    await new Promise((r) => setTimeout(r, 300))

    await window.recordingApi.stop(sessionIdRef.current, speakerAvailableRef.current)
    audioCtxRef.current?.close()
    window.recordingApi.closeWindow()
  }, [])

  return { ...state, stop }
}
```

- [ ] **Step 6: Create RecordingPanel.tsx**

```tsx
import { Button } from '@mantine/core'
import { VuMeter } from './VuMeter'
import { useRecording } from './useRecording'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function RecordingPanel(): React.JSX.Element {
  const { isRecording, micLevel, speakerLevel, speakerAvailable, elapsed, stop } = useRecording()
  const [stopping, setStopping] = React.useState(false)

  async function handleStop(): Promise<void> {
    setStopping(true)
    await stop()
  }

  return (
    <div
      className="w-[360px] rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/88 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-[18px]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b border-[#f3e5dd]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {isRecording && !stopping && (
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
          <span className="text-xs font-semibold text-[#24191f]">
            {stopping ? 'Saving…' : 'Recording'}
          </span>
        </div>
        <div
          className="flex items-center gap-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <span className="text-xs font-mono text-[#8f7982]">{formatTime(elapsed)}</span>
          <Button
            size="xs"
            color="sunset"
            loading={stopping}
            disabled={!isRecording}
            onClick={handleStop}
          >
            Stop
          </Button>
        </div>
      </div>

      {/* VU meters */}
      <div
        className="flex flex-col gap-3 px-3 py-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <VuMeter level={micLevel} label="Microphone" icon="🎤" available={true} />
        <VuMeter level={speakerLevel} label="System Audio" icon="🔊" available={speakerAvailable} />
      </div>
    </div>
  )
}
```

Note: add `import React, { useState } from 'react'` at the top of RecordingPanel.tsx.

- [ ] **Step 7: Create App.tsx**

```tsx
import { useState, useEffect } from 'react'
import { PermissionsGate } from './PermissionsGate'
import { RecordingPanel } from './RecordingPanel'

type AppState = 'checking' | 'permissions' | 'recording'

interface Permissions {
  mic: boolean
  screenRecording: boolean
}

export default function App(): React.JSX.Element {
  const [appState, setAppState] = useState<AppState>('checking')
  const [permissions, setPermissions] = useState<Permissions>({
    mic: false,
    screenRecording: false
  })
  const [platform, setPlatform] = useState('')

  async function checkPermissions(): Promise<void> {
    const [perms, plat] = await Promise.all([
      window.recordingApi.checkPermissions(),
      window.recordingApi.getPlatform()
    ])
    setPlatform(plat)
    setPermissions(perms)
    // Need at least mic. Screen recording is optional (system audio degrades gracefully).
    if (perms.mic) {
      setAppState('recording')
    } else {
      setAppState('permissions')
    }
  }

  useEffect(() => {
    checkPermissions().catch(console.error)
  }, [])

  if (appState === 'checking') {
    return (
      <div className="w-[360px] h-[80px] flex items-center justify-center rounded-2xl bg-white/88 backdrop-blur-[18px]">
        <span className="text-xs text-[#8f7982]">Checking permissions…</span>
      </div>
    )
  }

  if (appState === 'permissions') {
    return (
      <PermissionsGate permissions={permissions} platform={platform} onRecheck={checkPermissions} />
    )
  }

  return <RecordingPanel />
}
```

- [ ] **Step 8: Commit**

```bash
git add src/renderer/recording/
git commit -m "feat: add recording window React app (PermissionsGate, RecordingPanel, VuMeter, useRecording)"
```

---

## Task 8: Home screen — Record button + session-created listener

**Files:**

- Modify: `src/renderer/src/screens/Home.tsx`

- [ ] **Step 1: Add "Record conversation" to the + New menu in Home.tsx**

Add a handler after `handleEmptySession`:

```typescript
async function handleRecord(): Promise<void> {
  setNewMenuOpen(false)
  await window.api.invoke('recording:open')
}
```

Add the menu item inside the `newMenuOpen` dropdown (after "Empty session"):

```tsx
<div className="my-1 border-t border-[#f3e5dd]" />
<button
  className="w-full px-3 py-2 text-left text-sm text-[#5b4653] transition-colors hover:bg-[#fff4ee]"
  onClick={handleRecord}
>
  Record conversation
</button>
```

- [ ] **Step 2: Listen for recording:session-created and navigate to new session**

In the `useEffect` that registers listeners (where `offProgress` and `offDone` are set up), add:

```typescript
const offRecorded = window.api.on('recording:session-created', ({ session }) => {
  setSessions((prev) => [session, ...prev])
  onOpenSession(session.id)
})
```

And return it in the cleanup:

```typescript
return () => {
  offProgress()
  offDone()
  offRecorded()
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/screens/Home.tsx
git commit -m "feat: add Record conversation button to Home and auto-navigate on session created"
```

---

## Task 9: Multi-source transcription

**Files:**

- Modify: `src/main/whisper/runner.ts`
- Modify: `src/main/ipc/whisper.ts`
- Modify: `src/renderer/src/screens/Session.tsx`

- [ ] **Step 1: Extract runWhisper() helper and add transcribeAllSources() to runner.ts**

At the top of `src/main/whisper/runner.ts`, add `existsSync` to imports:

```typescript
import { existsSync, unlinkSync, writeFileSync } from 'fs'
```

Add a private `runWhisper` helper that transcribes a single audio file and returns its segments. Insert before the existing `transcribeSession` export:

```typescript
async function runWhisper(
  sessionId: string,
  audioPath: string,
  binaryPath: string,
  mPath: string,
  lang: string
): Promise<{ segments: Segment[]; tempFile: boolean; preparedPath: string }> {
  const { audioPath: preparedPath, tempFile } = await prepareAudio(audioPath)
  const threadCount = String(Math.max(1, Math.floor(cpus().length / 2)))
  const args = ['-m', mPath, '-f', preparedPath, '-l', lang, '--print-progress', '-t', threadCount]
  const segments: Segment[] = []

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(binaryPath, args)
    activeProcesses.set(sessionId + ':' + audioPath, proc)
    let stdoutBuf = ''

    proc.stdout.on('data', (data: Buffer) => {
      stdoutBuf += data.toString()
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() ?? ''
      for (const line of lines) {
        const seg = parseSegmentLine(line)
        if (seg) segments.push(seg)
      }
    })

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      for (const line of text.split('\n')) {
        const pct = parseProgressLine(line)
        if (pct !== null) broadcast('whisper:progress', { sessionId, percent: pct, eta: null })
      }
    })

    proc.on('close', (code) => {
      activeProcesses.delete(sessionId + ':' + audioPath)
      if (stdoutBuf.trim()) {
        const seg = parseSegmentLine(stdoutBuf)
        if (seg) segments.push(seg)
      }
      if (code === 0) resolve()
      else reject(new Error(`whisper.cpp exited with code ${code}`))
    })

    proc.on('error', (err) => {
      activeProcesses.delete(sessionId + ':' + audioPath)
      reject(err)
    })
  })

  return { segments, tempFile, preparedPath }
}
```

Add the `Segment` type import at the top:

```typescript
import type { Segment } from '../../renderer/src/types/ipc'
```

Now add `transcribeAllSources` after `transcribeSession`:

```typescript
export async function transcribeAllSources(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  const binaryPath = getWhisperBinaryPath()
  if (!existsSync(binaryPath)) {
    throw new Error(`whisper.cpp binary not found at ${binaryPath}.\nRun: npm run whisper:setup`)
  }

  const actualModel = resolveDownloadedModel(session.model)
  if (!actualModel) throw new Error(`Model "${session.model}" is not downloaded`)
  const mPath = modelPath(actualModel)
  const lang = session.language === 'auto' ? 'auto' : session.language

  updateSession(sessionId, { status: 'transcribing', segments: [], model: actualModel })

  const allSegments: Segment[] = []

  for (const source of session.audioSources) {
    if (!source.path || !existsSync(source.path)) continue
    const { segments, tempFile, preparedPath } = await runWhisper(
      sessionId,
      source.path,
      binaryPath,
      mPath,
      lang
    )
    if (tempFile) {
      try {
        unlinkSync(preparedPath)
      } catch {
        /* ignore */
      }
    }
    allSegments.push(...segments.map((seg) => ({ ...seg, speakerId: source.speakerId ?? null })))
  }

  allSegments.sort((a, b) => a.start - b.start)

  const sessionFilePath = getSessionPath(sessionId)
  const updated = { ...session, status: 'done' as const, segments: allSegments, model: actualModel }
  writeFileSync(sessionFilePath, JSON.stringify(updated, null, 2), 'utf8')
  broadcast('whisper:done', { sessionId })
}
```

- [ ] **Step 2: Add whisper:transcribe-all handler to ipc/whisper.ts**

```typescript
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
```

- [ ] **Step 3: Add multi-source transcribe UI to Session.tsx**

In `src/renderer/src/screens/Session.tsx`, find the idle state section (around line 446). Add a `handleTranscribeAll` handler alongside `handleTranscribe`:

```typescript
async function handleTranscribeAll(): Promise<void> {
  setError(null)
  setSession((prev) => (prev ? { ...prev, status: 'transcribing' } : prev))
  await window.api.invoke('whisper:transcribe-all', sessionId)
}
```

In the idle state JSX, replace the single `<Button ... onClick={handleTranscribe}>Transcribe</Button>` block with:

```tsx
{
  session.audioSources.length > 1 ? (
    <div className="flex flex-col items-center gap-3">
      <div className="w-full max-w-xs flex flex-col gap-1.5">
        {session.audioSources.map((src) => (
          <div
            key={src.id}
            className="flex items-center justify-between rounded-lg border border-[#edd8ce] bg-white/70 px-3 py-2"
          >
            <span className="text-xs text-[#5b4653] truncate">{src.label}</span>
          </div>
        ))}
      </div>
      <Button color="sunset" disabled={downloadedModels.length === 0} onClick={handleTranscribeAll}>
        Transcribe All Sources
      </Button>
    </div>
  ) : (
    <Button color="sunset" disabled={downloadedModels.length === 0} onClick={handleTranscribe}>
      Transcribe
    </Button>
  )
}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/whisper/runner.ts src/main/ipc/whisper.ts src/renderer/src/screens/Session.tsx
git commit -m "feat: add multi-source transcription with auto speaker labeling and timestamp merge"
```

---

## Final verification

- [ ] **Start dev server and smoke-test**

```bash
npm run dev
```

Manual checklist:

1. App opens normally, existing sessions load — no regression from schema migration
2. Click "+ New" → "Record conversation" — recording window appears on top
3. macOS: permissions gate shows if screen recording not granted; "Open Settings" opens System Prefs
4. Recording panel shows two VU meters, timer increments
5. System audio meter shows "unavailable" if permission denied (recording continues with mic)
6. Click "Stop" — window closes, new session appears in list, app navigates to session
7. Session screen shows "Transcribe All Sources" button for recorded sessions
8. "Transcribe All Sources" runs whisper on both tracks, segments are labeled with "You"/"Other"
9. Imported sessions (single source) show regular "Transcribe" button — no regression
