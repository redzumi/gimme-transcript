# Gimme Transcript — Product Spec

## Problem

Recording multi-speaker meetings is easy. Getting a readable transcript with "who said what" is not — unless you pay $64 for MacWhisper's diarization tier. This tool does it for free, locally, with no data leaving your machine.

## Goal

A desktop app (macOS first) that:

1. Takes one or more audio files as input
2. Transcribes them locally using Whisper
3. Lets the user assign speakers to transcript segments
4. Exports the result as a clean, readable document

## Non-goals (MVP)

- No cloud, no API keys, no accounts
- No real-time transcription
- No automatic speaker identification (user labels speakers manually)
- No translation
- No mobile

---

## Stack

| Layer         | Choice                       |
| ------------- | ---------------------------- |
| App shell     | Electron                     |
| Build tool    | Electron Vite                |
| UI            | Mantine + Tailwind CSS       |
| Transcription | whisper.cpp binary (bundled) |
| Diarization   | Manual (user-driven)         |
| Language      | TypeScript                   |
| Storage       | JSON (local, AppData)        |
| Distribution  | .dmg (GitHub Releases)       |
| License       | MIT                          |

---

## User Flow (MVP)

### 1. Import

- User drops audio file(s) into the app (drag & drop or file picker)
- Supported formats: `.mp3`, `.m4a`, `.wav`, `.ogg`
- Each file = separate session with its own transcript and speaker labeling

### 2. Model setup (first run only)

- App checks if Whisper model is downloaded
- If not → shows download prompt with model size info
- User can select model: `tiny / base / small / medium / large`
- Downloaded to: `~/Library/Application Support/Gimme Transcript/models/`
- Default: `medium` (best balance between speed and accuracy)

### 3. Transcription

- User hits "Transcribe"
- Whisper.cpp binary spawned via `child_process.spawn`
- Segments streamed to UI in real time via stdout parsing
- Language: auto-detect (can be overridden in Settings)

### 4. Speaker labeling

- Each segment shows: `[timestamp] [Speaker ?] text`
- User clicks "Speaker ?" → selects from speaker database or types new name
- New name → added to global speaker database automatically
- Bulk assign: select multiple segments → assign speaker in one click

### 5. Export

- Per-file export or merge multiple files into one "meeting" document
- Formats on export: Markdown, plain text
- Internal storage format: JSON (with timestamps, speaker IDs, segments)

Export example (Markdown):

```
**Rustam** [00:00:12]
We need to decide on the legal entity first.

**Anton** [00:00:45]
I think Kazakhstan ТОО is the right move for now.
```

---

## Screens

---

### Screen 0: First Launch — Model Setup

Shown once on first launch. Blocks navigation to Home until model is downloaded.

```
┌────────────────────────────────────────────────────┐
│                                                    │
│         Gimme Transcript                          │
│                                                    │
│   To get started, download a Whisper model.        │
│   Models run locally — no internet after this.     │
│                                                    │
│   ○ tiny    75 MB   — fast, less accurate          │
│   ● medium  1.5 GB  — recommended                  │
│   ○ large   2.9 GB  — slow, most accurate          │
│                                                    │
│              [ Download model ]                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Downloading state:**

```
│   Downloading medium… ████████░░░░  54%  780 MB/s  │
│              [ Cancel ]                            │
```

**Done state:**

```
│   ✓ Model ready.                                   │
│              [ Get started ]                       │
```

**Notes:**

- After download → Home
- Models can be added/removed later in Settings
- If cancelled → this screen is shown again on next launch

---

### Screen 1: Home

Entry point. Two columns: sessions list + speakers sidebar.

```
┌────────────────────────────────────────────────────┐
│  Gimme Transcript        [model: medium ▾]  ⚙️     │
├─────────────────────────────┬──────────────────────┤
│  Sessions                   │  Speakers            │
│                             │                      │
│  [+ New session]            │  [+ Add speaker]     │
│                             │                      │
│  📄 meeting-part-1.m4a      │  Rustam              │
│     done · 12 min ago       │  Anton               │
│                             │  Evgeny              │
│  📄 meeting-part-2.m4a      │                      │
│     transcribing… 64%       │                      │
│                             │                      │
│  📄 meeting-part-3.m4a      │                      │
│     idle                    │                      │
│                             │                      │
└─────────────────────────────┴──────────────────────┘
```

**States of a session row:**

- `idle` — file loaded, not transcribed yet
- `transcribing… N%` — in progress
- `done` — transcript ready, can be opened
- `labeled` — transcript labeled with speakers

**Actions:**

- Click session → opens Session screen
- `[+ New session]` → file picker → creates session in `idle`
- `[model: medium ▾]` in header → change model without going to Settings
- `⚙️` → Settings screen

---

### Screen 2: Session — idle

File loaded, transcription not started yet.

```
┌────────────────────────────────────────────────────┐
│  ← Home       meeting-part-1.m4a       [⚙️]        │
├────────────────────────────────────────────────────┤
│                                                    │
│  Audio file:  meeting-part-1.m4a  (14:32)          │
│                                                    │
│  Model:    [medium ▾]                              │
│  Language: [auto-detect ▾]                         │
│                                                    │
│                  [ Transcribe ]                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

### Screen 3: Session — transcribing

Whisper is running, segments streaming in real time.

```
┌────────────────────────────────────────────────────┐
│  ← Home       meeting-part-1.m4a       [⚙️]        │
├────────────────────────────────────────────────────┤
│  ████████████████░░░░░░░░  64%  ~3 min left        │
├────────────────────────────────────────────────────┤
│  00:00:12  [Speaker ? ▾]  We need to decide on…    │
│  00:00:45  [Speaker ? ▾]  I think Kazakhstan…      │
│  00:01:03  [Speaker ? ▾]  The compliance side…     │
│  ▌ (streaming…)                                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Notes:**

- Segments appear as they are processed
- Speaker assignment can start without waiting for completion
- Cancel transcription — cross button next to the progress bar

---

### Screen 4: Session — done

Transcript ready, speaker labeling, export.

```
┌────────────────────────────────────────────────────┐
│  ← Home       meeting-part-1.m4a       [⚙️]        │
├────────────────────────────────────────────────────┤
│  00:00:12  [Rustam    ▾]  We need to decide on…    │
│  00:00:45  [Anton     ▾]  I think Kazakhstan…      │
│  00:01:03  [Speaker ? ▾]  The compliance side…     │
│  00:01:44  [Evgeny    ▾]  Right, so if we do…      │
│  ...                                               │
├────────────────────────────────────────────────────┤
│  [Export this file ▾]      [Merge & Export ▾]      │
└────────────────────────────────────────────────────┘
```

**Speaker picker (on click):**

```
  [Rustam        ]
  [Anton         ]
  [Evgeny        ]
  ─────────────────
  [+ New speaker ]
```

**Export options:**

- "Export this file" → MD or TXT
- "Merge & Export" → select sessions to merge → MD or TXT

---

### Screen 5: Settings

```
┌────────────────────────────────────────────────────┐
│  ← Back                Settings                    │
├────────────────────────────────────────────────────┤
│                                                    │
│  Default model       [medium ▾]                    │
│  Default language    [auto-detect ▾]               │
│                                                    │
│  Storage path        ~/Library/…/scribe  [Change]  │
│                                                    │
│  ── Models ──────────────────────────────────      │
│  tiny    (75 MB)   [downloaded]                    │
│  base    (142 MB)  [download]                      │
│  small   (466 MB)  [download]                      │
│  medium  (1.5 GB)  [downloaded] ← current          │
│  large   (2.9 GB)  [download]                      │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Architecture

```
Electron Main Process
  ├── IPC handlers
  ├── whisper.cpp subprocess (child_process.spawn, stdout streaming)
  ├── Speaker database (JSON, AppData)
  └── File system (model storage, session storage, export)

Electron Renderer Process (React + Mantine)
  ├── DropZone (import)
  ├── TranscriptView (segments + speaker labels, live stream)
  ├── SpeakerPicker (global speaker DB + inline add)
  └── ExportPanel (per-file or merged)
```

### whisper.cpp integration

- Binary bundled in `resources/whisper.cpp/`
- Spawned with args: `--model <path> --language auto --output-txt <file>`
- Segments parsed from stdout as they arrive → pushed to renderer via IPC

### Storage

- Sessions: `~/Library/Application Support/Gimme Transcript/sessions/<id>.json`
- Speakers: `~/Library/Application Support/Gimme Transcript/speakers.json`
- Models: `~/Library/Application Support/Gimme Transcript/models/`
- Default storage path configurable in Settings

---

## Session JSON schema (internal)

```json
{
  "id": "uuid",
  "createdAt": "ISO8601",
  "audioFile": "path/to/file.m4a",
  "model": "medium",
  "language": "ru",
  "segments": [
    {
      "id": "uuid",
      "start": 12.4,
      "end": 18.1,
      "text": "We need to decide on the legal entity first.",
      "speakerId": "speaker-uuid"
    }
  ]
}
```

---

## MVP Scope

| Feature                                     | MVP   |
| ------------------------------------------- | ----- |
| Audio import (drag & drop + file picker)    | ✅    |
| whisper.cpp transcription (local)           | ✅    |
| Real-time segment streaming                 | ✅    |
| Model selection + auto-download             | ✅    |
| Manual speaker labeling                     | ✅    |
| Global speaker database                     | ✅    |
| Bulk speaker assign                         | ✅    |
| Export per file (MD, TXT)                   | ✅    |
| Merge files → export as one meeting         | ✅    |
| JSON session storage                        | ✅    |
| Configurable storage path                   | ✅    |
| Language auto-detect (override in settings) | ✅    |
| Segment merge/split                         | ❌ v2 |
| Auto diarization (pyannote)                 | ❌ v2 |
| Export to SRT/VTT                           | ❌ v2 |
| Windows support                             | ❌ v2 |

---

## First test case

Meeting: Nova AI founders call
Speakers: 3 (Rustam, Anton, Evgeny)
Files: 3 audio recordings (.m4a)
Language: mixed (multi-language)
