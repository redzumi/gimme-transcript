# scribe-my-bitch-up — Task Breakdown

Атомарные задачи для агентов. Каждая задача независима и имеет чёткий результат.
Порядок важен внутри фаз — между фазами можно параллелить.

---

## Phase 0: Project Bootstrap

- [x] **T-001** Init Electron Vite project (`electron-vite` template, TypeScript)
- [x] **T-002** Install and configure Mantine + Tailwind CSS
- [x] **T-003** Set up folder structure (`main/`, `renderer/`, `preload/`, `resources/`)
- [x] **T-004** Configure IPC bridge (preload.ts, contextBridge, typed IPC channels)
- [x] **T-005** Add electron-builder config for `.dmg` output (macOS)

---

## Phase 1: Storage Layer

- [x] **T-010** Implement AppData path resolution (macOS: `~/Library/Application Support/scribe-my-bitch-up/`)
- [x] **T-011** Implement session storage (CRUD for session JSON files)
- [x] **T-012** Implement speaker database (`speakers.json` — CRUD)
- [x] **T-013** Implement settings storage (`settings.json` — model, language, storage path)
- [x] **T-014** IPC handlers for all storage operations (sessions, speakers, settings)

---

## Phase 2: Whisper Integration

- [ ] **T-020** Bundle whisper.cpp binary into `resources/` (macOS arm64 + x64)
- [ ] **T-021** Implement model download manager (fetch from Hugging Face, progress events via IPC)
- [ ] **T-022** Implement Whisper runner (`child_process.spawn`, parse stdout segments, stream via IPC)
- [ ] **T-023** Segment parser — convert whisper.cpp stdout to `Segment[]` objects with timestamps
- [ ] **T-024** Cancel transcription (kill subprocess gracefully)

---

## Phase 3: Screens

Each screen is independent after Phase 0–1 are done.

- [x] **T-030** Screen 0: First Launch / Model Setup (select model, download, progress, "Get started")
- [x] **T-031** Screen 1: Home (sessions list + speakers sidebar, "New session" button)
- [x] **T-032** Screen 2: Session — idle (file info, model/language picker, "Transcribe" button)
- [x] **T-033** Screen 3: Session — transcribing (progress bar, live segment stream)
- [x] **T-034** Screen 4: Session — done (transcript, speaker picker per segment, bulk assign)
- [x] **T-035** Screen 5: Settings (model management, default language, storage path)

---

## Phase 4: Speaker Labeling

- [ ] **T-040** SpeakerPicker component (dropdown with existing speakers + "Add new" inline)
- [ ] **T-041** Bulk assign UI (multi-select segments → assign speaker)
- [ ] **T-042** Persist speaker assignments to session JSON on every change

---

## Phase 5: Export

- [ ] **T-050** Export single session to Markdown
- [ ] **T-051** Export single session to plain text
- [ ] **T-052** Merge multiple sessions → export as one document (MD or TXT)
- [ ] **T-053** Export file dialog (native, via Electron `dialog.showSaveDialog`)

---

## Phase 6: Polish

- [ ] **T-060** Header model switcher (quick model change without going to Settings)
- [ ] **T-061** Session status badges (idle / transcribing / done / labeled)
- [ ] **T-062** Empty states (no sessions, no speakers)
- [ ] **T-063** Error handling (transcription failed, model not found, file unreadable)
- [ ] **T-064** First-launch detection (skip Screen 0 if model already downloaded)
