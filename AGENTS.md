# Agent Instructions — Gimme Transcript

Read this file before any work on the project.

---

## What this is

Desktop app for audio transcription with speaker labeling.
Local, free, open-source. No cloud, no API keys.

Full spec: `spec.md`
Task list: `tasks.md`

---

## Stack

| Layer         | Technology                     |
| ------------- | ------------------------------ |
| App           | Electron                       |
| Build         | Electron Vite                  |
| UI            | React + Mantine + Tailwind CSS |
| Language      | TypeScript (strict)            |
| Transcription | whisper.cpp binary (bundled)   |
| Storage       | JSON files (AppData)           |

---

## Project structure

```
gimme-transcript/
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.ts    # Entry point
│   │   ├── ipc/        # IPC handlers
│   │   ├── whisper/    # whisper.cpp runner + model manager
│   │   └── storage/    # sessions, speakers, settings
│   ├── preload/
│   │   └── index.ts    # contextBridge, typed IPC
│   └── renderer/
│       ├── main.tsx    # React entry
│       ├── screens/    # One file per screen
│       ├── components/ # Shared components
│       ├── hooks/      # Custom hooks
│       └── types/      # Shared TypeScript types
├── resources/
│   └── whisper.cpp/    # Bundled binary (arm64 + x64)
└── electron.vite.config.ts
```

---

## Rules

### General

- TypeScript strict mode, no `any`
- All IPC channels typed via shared `types/ipc.ts`
- Components — functional, hooks-only
- Mantine for components (inputs, modals, dropzone, etc.) — don't reinvent where ready-made exist
- Tailwind for layout and custom styles

### Main process

- All file system operations — main process only
- No direct fs in renderer
- Each IPC handler in a separate file in `main/ipc/`

### Storage

- Sessions: `{AppData}/sessions/{uuid}.json`
- Speakers: `{AppData}/speakers.json`
- Settings: `{AppData}/settings.json`
- Models: `{AppData}/models/`
- AppData path: `app.getPath('userData')`

### Whisper

- Binary in `resources/whisper.cpp/`
- Spawned via `child_process.spawn`
- Segments parsed from stdout as they arrive
- Each segment immediately sent to renderer via IPC (`whisper:segment`)
- Progress via IPC (`whisper:progress`)

### Screens

- One file per screen in `renderer/screens/`
- Navigation via simple state in App.tsx (no react-router for MVP)
- Screen determined by type: `'firstLaunch' | 'home' | 'session' | 'settings'`

---

## Session JSON Schema

```typescript
interface Session {
  id: string // uuid
  createdAt: string // ISO8601
  audioFile: string // absolute path
  model: WhisperModel // 'tiny' | 'base' | 'small' | 'medium' | 'large'
  language: string // 'auto' | 'ru' | 'en' | ...
  status: 'idle' | 'transcribing' | 'done'
  segments: Segment[]
}

interface Segment {
  id: string
  start: number // seconds
  end: number // seconds
  text: string
  speakerId: string | null
}
```

## Speaker JSON Schema

```typescript
interface Speaker {
  id: string // uuid
  name: string
  createdAt: string
}
```

## Settings JSON Schema

```typescript
interface Settings {
  defaultModel: WhisperModel
  defaultLanguage: string
  storagePath: string // custom path or default AppData
}
```

---

## How to pick a task

1. Open `tasks.md`
2. Take the first uncompleted task from the current phase
3. Read the corresponding section in `spec.md` for details
4. Implement it
5. Mark the task as `[x]` in `tasks.md`

Phases are executed in order. Within a phase, tasks can be parallelized if there are no explicit dependencies.

---

## What not to do

- Don't add dependencies without necessity
- Don't implement automatic diarization — that's v2
- Don't add cloud features
- Don't support Windows in MVP
- Don't complicate navigation (react-router not needed for MVP)
