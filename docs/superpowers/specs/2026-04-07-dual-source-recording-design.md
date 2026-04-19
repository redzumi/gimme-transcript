# Dual-Source Recording — Design Spec

**Date:** 2026-04-07  
**Status:** Approved

## Overview

Add the ability to record audio simultaneously from two sources — microphone and system audio (speakers) — saving them as separate labeled tracks within a single session. After recording, both tracks are transcribed and merged by timestamp with speakers auto-labeled, eliminating manual diarization for recorded conversations.

---

## Goals

- Record mic + system audio simultaneously into one session
- Files written incrementally to disk (no data loss on crash)
- Floating recording window that stays on top while user works in other apps
- Permissions explained clearly before recording starts
- `audioSources` array schema replaces single `audioFile` (clean, no hacks)
- Transcription of multiple sources with auto speaker labeling and timestamp merge

## Non-goals

- Mixing tracks into a single file
- Recording more than two sources simultaneously (extendable later)
- Noise cancellation or audio processing

---

## Architecture

### New files

```
src/
├── main/
│   ├── window/recording.ts          ← BrowserWindow management
│   └── ipc/recording.ts             ← IPC handlers
├── preload/recording.ts             ← contextBridge for recording window
└── renderer/recording/
    ├── index.html
    └── index.tsx                    ← React: PermissionsGate | RecordingPanel
```

### Modified files

```
electron.vite.config.ts              ← add 'recording' entry to preload + renderer
src/renderer/src/types/ipc.ts        ← new IPC channels, AudioSource type, Session v2
src/main/storage/sessions.ts         ← migrate audioFile → audioSources
src/main/ipc/index.ts                ← register recording handlers
src/renderer/src/screens/Home.tsx    ← add "Record" option to "+ New" menu
src/renderer/src/screens/Session.tsx ← show multi-source transcribe UI
```

---

## Session Schema (v2)

```typescript
interface AudioSource {
  id: string
  path: string
  label: string // e.g. "Microphone", "System Audio", "interview.mp3"
  speakerId: string | null
}

interface Session {
  schemaVersion: number // bumped to 2 for all sessions after migration
  id: string
  name?: string
  createdAt: string
  model: WhisperModel
  language: string
  status: 'idle' | 'transcribing' | 'done'
  segments: Segment[]

  // v2: replaces audioFile
  audioSources: AudioSource[]

  // v1 legacy — present on old sessions, used only during migration
  audioFile?: string
  recordingSource?: 'recorded'
}
```

**Migration** (in `migrate()` in `sessions.ts`):

```typescript
if (!session.audioSources) {
  session.audioSources = [
    {
      id: randomUUID(),
      path: session.audioFile ?? '',
      label: 'Audio',
      speakerId: null
    }
  ]
}
```

All existing code that reads `session.audioFile` is updated to read `session.audioSources[0].path`.

**Files on disk:**

```
sessions/
├── <id>.json
├── <id>_mic.webm        ← microphone track
└── <id>_speaker.webm    ← system audio track
```

---

## Recording Window

### BrowserWindow config

```typescript
new BrowserWindow({
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
  webPreferences: { preload: 'preload/recording.js', sandbox: false }
})

win.setAlwaysOnTop(true, 'screen-saver', 1)
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
win.showInactive() // don't steal focus
```

### IPC channels (recording window ↔ main)

```
recording:check-permissions  → { mic: boolean, screenRecording: boolean }
recording:open-settings      ← opens System Preferences for given permission
recording:start              → creates temp files on disk, returns { sessionId }
                               (chunks must reference this sessionId)
recording:chunk              ← { sessionId, source: 'mic'|'speaker', data: Buffer }
recording:stop               → finalizes files, creates Session, notifies main window
recording:cancel             → deletes temp files, closes window
```

Main window listens for `recording:session-created` event and prepends the new session to the list.

### States

**PermissionsGate** — shown when `mic === false || (platform === 'darwin' && screenRecording === false)`:

- List of required permissions with status icons
- "Open Settings" button links to System Preferences (macOS) or Settings (Windows)
- System Audio permission marked as optional on Windows/Linux (not needed)
- "Start Recording" enabled only when microphone is granted

**RecordingPanel** — active recording:

- Drag handle header with timer and Stop button
- Two source rows: icon + label + live VU meter bar + dB value
- VU meter driven by `AnalyserNode` via `requestAnimationFrame`
- If system audio source fails to start: row shows "unavailable" state, recording continues with mic only

### Visual style

Matches main app: `backdrop-filter: blur(18px)`, `background: rgba(255,255,255,0.88)`, `border-radius: 16px`, Mantine color tokens.

---

## Recording Flow (renderer)

```
getUserMedia({ audio: true })               → micStream
desktopCapturer.getSources({ types: ['screen'] })
  → getUserMedia({ audio: { chromeMediaSource: 'desktop', ... } })  → speakerStream

AudioContext → AnalyserNode (mic)   → VU meter animation
AudioContext → AnalyserNode (speaker) → VU meter animation

MediaRecorder(micStream,     { timeslice: 1000 }) → ondataavailable → IPC recording:chunk
MediaRecorder(speakerStream, { timeslice: 1000 }) → ondataavailable → IPC recording:chunk
```

Chunks are appended to files in main process as they arrive. If `speakerStream` fails (permission denied, no sources), recording proceeds with mic only — `speakerAudioFile` is not created.

---

## Transcription (multi-source)

Session screen shows sources when `audioSources.length > 1`:

```
Sources:
  🎤 Microphone      [Transcribe]
  🔊 System Audio    [Transcribe]
                  [Transcribe All]
```

For single-source sessions: existing UI unchanged.

**"Transcribe All" flow:**

1. Run whisper on each source sequentially (reuses existing whisper runner)
2. Each segment gets `speakerId` from `source.speakerId`
3. All segments merged and sorted by `start` time
4. Overlapping segments kept as-is (simultaneous speech is valid)
5. Session status → `done`

**Auto-created speakers on recording:**  
When a recorded session is created, two global speakers are upserted:

- `"You"` — assigned to the mic source
- `"Other"` — assigned to the system audio source

If these speaker names already exist, their IDs are reused.

---

## Permissions (macOS)

Checked via `systemPreferences.getMediaAccessStatus()`:

- `'microphone'` — required on all platforms
- `'screen'` — required on macOS only (for `desktopCapturer` system audio)

On Windows/Linux: only microphone permission checked. System audio captured via `desktopCapturer` without extra OS-level permission.

Deep link to System Preferences:

- Microphone: `x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone`
- Screen Recording: `x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture`

---

## Error Handling

| Scenario                   | Behavior                                                      |
| -------------------------- | ------------------------------------------------------------- |
| Mic permission denied      | Cannot start recording, PermissionsGate shown                 |
| System audio unavailable   | Recording proceeds with mic only, source marked "unavailable" |
| IPC chunk write fails      | Log error, continue recording (chunk lost, not fatal)         |
| App crashes mid-recording  | Partial `.webm` files remain on disk, session not created     |
| Stop with 0 bytes recorded | Session not created, files deleted, window closes             |

---

## Out of Scope (this iteration)

- Multi-file import (user imports 3+ audio files into one session) — schema supports it, UI left for later
- Audio waveform scrubbing per source in session view
- Cancelling a running transcription per-source individually
