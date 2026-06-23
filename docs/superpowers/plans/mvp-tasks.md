# Multi-Engine MVP Tasks

Implementation tasks for multi-engine architecture (whisper.cpp + OpenAI + Cohere Transcribe).

Parent plans:

- [Multi-engine architecture](./multi-engine-architecture.md)
- [OpenAI transcription integration](./openai-transcription-integration.md)
- [Cohere Transcribe integration](./cohere-transcribe-integration.md)

Date: 2026-04-19

---

## Phase 1: Foundation + Structure (13 tasks)

Generalize types, add engine concept, refactor file structure. Don't break existing functionality.

- [ ] **1.1** Generalize `WhisperModel` usage
  - `Session.model`: `WhisperModel` → `string`
  - `Settings.defaultModel`: `WhisperModel` → `string`
  - `ModelInfo.model`: `WhisperModel` → `string`
  - `WhisperModel` type stays (used internally by whisper engine)
  - Files: `src/renderer/src/types/ipc.ts`
  - Update all references that cast to `WhisperModel`

- [ ] **1.2** Add engine field to Session
  - `Session.engine: string` (default `'whisper'`)
  - `Session.schemaVersion: 3`
  - Files: `src/renderer/src/types/ipc.ts`

- [ ] **1.3** Update Settings type
  - Add `defaultEngine: TranscriptionEngine` (default `'whisper'`)
  - Add `huggingfaceToken?: string`
  - Add `openaiApiKey?: string`
  - Files: `src/renderer/src/types/ipc.ts`, `src/main/storage/settings.ts`

- [ ] **1.4** Create engine registry types
  - New file: `src/main/transcription/types.ts`
  - Types: `TranscriptionEngine`, `EngineDef`, `PlatformSupport`, `BinaryDef`, `ModelDef`, `EngineFeatures`, `LanguageDef`
  - Helper: `getAvailableEngines(): EngineDef[]` (filter by current platform/os version)
  - Helper: `getEngineDef(engineId: string): EngineDef | undefined`

- [ ] **1.5** Create engine registry data
  - New file: `src/main/transcription/registry.ts`
  - `ENGINE_REGISTRY: EngineDef[]` with whisper, openai, and cohere entries
  - Whisper: platforms (darwin/linux), 5 models, 99+ languages
  - OpenAI: all platforms, 4 models, 50+ languages, requiresApiKey, requiresNetwork
  - Cohere: platforms (darwin arm64 only), 1 model, 14 languages, minRamMB 6000
  - Binary URLs from GitHub releases, model URLs from HuggingFace

- [ ] **1.6** Shared engine types for renderer
  - New file: `src/renderer/src/types/engines.ts`
  - `EngineInfo`: UI-friendly view of `EngineDef` (id, name, description, languages, features, platformNote, ready status)
  - `EngineModelInfo`: UI-friendly model info per engine

- [ ] **1.7** Session migration v2→v3
  - File: `src/main/storage/sessions.ts`
  - In `getSession()`: if `schemaVersion < 3` → set `engine = 'whisper'`, `schemaVersion = 3`
  - Update existing sessions on disk

- [ ] **1.8** Move whisper files to transcription/whisper/
  - Move `src/main/whisper/binary.ts` → `src/main/transcription/whisper/binary.ts`
  - Move `src/main/whisper/parser.ts` → `src/main/transcription/whisper/parser.ts`
  - Move `src/main/whisper/runner.ts` → `src/main/transcription/whisper/runner.ts`
  - Move `src/main/whisper/convert.ts` → `src/main/transcription/whisper/convert.ts`
  - Delete `src/main/whisper/index.ts`

- [ ] **1.9** Create transcription barrel
  - New file: `src/main/transcription/index.ts`
  - Export: `transcribeSession`, `cancelTranscription`, `transcribeAllSources`, `getWhisperBinaryPath`
  - Export: engine registry functions, types

- [ ] **1.10** Update all imports after move
  - `src/main/ipc/whisper.ts`: update import paths
  - `src/main/ipc/models.ts`: update import paths (modelPath, resolveDownloadedModel, etc.)
  - `src/main/index.ts`: update import paths
  - Any other files importing from `src/main/whisper/`

- [ ] **1.11** Extract audio conversion to shared
  - Move `convert.ts` → `src/main/transcription/audio.ts`
  - Rename temp file prefix from `whisper-` to generic
  - `NATIVE_FORMATS` stays as-is (applicable to all engines)
  - Update import in whisper runner

- [ ] **1.12** Create cohere + openai skeleton
  - New files (stubs with TODO):
    - `src/main/transcription/cohere/index.ts`
    - `src/main/transcription/cohere/binary.ts`
    - `src/main/transcription/cohere/server.ts`
    - `src/main/transcription/cohere/runner.ts`
    - `src/main/transcription/cohere/parser.ts`
    - `src/main/transcription/openai/index.ts`
    - `src/main/transcription/openai/client.ts`
    - `src/main/transcription/openai/parser.ts`
    - `src/main/transcription/openai/runner.ts`
    - `src/main/transcription/openai/chunking.ts`

- [ ] **1.13** Update storage paths
  - File: `src/main/storage/paths.ts`
  - Add `getEnginesDir()`: `{base}/engines/`
  - Refactor `getModelsDir()` → `getEngineModelsDir(engineId)`: `{base}/models/{engineId}/`
  - Keep backward compat: `getModelsDir()` returns whisper models dir (calls `getEngineModelsDir('whisper')`)

---

## Phase 2: OpenAI Engine (11 tasks)

OpenAI REST API integration. No binary or model downloads needed.

- [ ] **2.1** OpenAI engine registry entry
  - Platform: all (darwin, linux, win — though win is out of MVP scope)
  - Binaries: [] (no binary needed)
  - Models: whisper-1, gpt-4o-mini-transcribe, gpt-4o-transcribe, gpt-4o-transcribe-diarize
  - Features: `requiresApiKey: true`, `requiresNetwork: true`, `timestamps: true`, `diarization: true` (for diarize model)

- [ ] **2.2** API key storage + validation
  - `settings.openaiApiKey?: string`
  - UI field in Settings with reveal/hide toggle
  - Validation: send test request to `/v1/models` with the key

- [ ] **2.3** REST API client
  - File: `src/main/transcription/openai/client.ts`
  - `transcribe(audioPath, model, options): Promise<OpenAITranscriptionResponse>`
  - POST `/v1/audio/transcriptions` with multipart form
  - Headers: `Authorization: Bearer {key}`
  - Support `response_format`: `verbose_json`, `diarized_json`, `json`, `text`
  - Support `stream: true` for streaming transcription
  - Support `chunking_strategy: "auto"` for diarize model
  - Support `timestamp_granularities[]` for whisper-1
  - Error handling: 401 (bad key), 429 (rate limit), 413 (file too big)

- [ ] **2.4** Response parsers
  - File: `src/main/transcription/openai/parser.ts`
  - `parseVerboseJson(response): Segment[]` — whisper-1 verbose_json → segments with word-level timestamps
  - `parseDiarizedJson(response): DiarizedSegment[]` — diarized_json → segments with speaker, start, end
  - `parseTextResponse(response): Segment[]` — plain text → single segment (no timestamps)
  - Handle `stream: true` events: `transcript.text.delta`, `transcript.text.segment`, `transcript.text.done`

- [ ] **2.5** File size check + compression
  - Check file size before sending to API
  - If > 25MB: convert to MP3 via ffmpeg (already have dependency)
  - If MP3 still > 25MB: chunking required
  - For `gpt-4o-transcribe-diarize`: use `chunking_strategy: "auto"` (no client-side chunking needed)

- [ ] **2.6** VAD-based audio chunking
  - File: `src/main/transcription/openai/chunking.ts`
  - Use ffmpeg `silencedetect` filter to find silence points
  - Split audio at silence boundaries (avoid mid-sentence cuts)
  - Fallback: if no silence found, split at fixed intervals (~4 min)
  - Return chunks with offset information for timestamp correction

- [ ] **2.7** Prompt chaining for chunk context
  - For each chunk after the first: use previous chunk's transcript as `prompt`
  - Limit prompt to model's token limit (224 for whisper-1)
  - Sequential processing (each chunk needs previous transcript)

- [ ] **2.8** Chunk merge + deduplication
  - Correct timestamps by chunk offset
  - Minimal overlap deduplication (VAD splitting should handle most cases)
  - Return unified `Segment[]`

- [ ] **2.9** OpenAI runner
  - File: `src/main/transcription/openai/runner.ts`
  - `transcribeSession(sessionId)`: resolve audio → check size → choose strategy (direct/chunk/diarize) → send → parse → broadcast segments
  - For streaming: emit `whisper:segment` events as deltas arrive
  - For non-streaming: emit all segments at once on completion
  - `cancelTranscription(sessionId)`: abort fetch

- [ ] **2.10** Cost estimation
  - `estimateCost(audioDurationSec, model): number`
  - whisper-1: $0.006/min
  - gpt-4o-transcribe: check current pricing
  - gpt-4o-mini-transcribe: check current pricing
  - gpt-4o-transcribe-diarize: check current pricing
  - Show estimate in UI before transcription starts

- [ ] **2.11** Network check + engines:\* IPC update
  - Check internet connectivity before OpenAI transcription
  - Error dialog if offline: "OpenAI requires internet connection"
  - Add OpenAI to `engines:list` response with status: ready (API key set) / needs-key

---

## Phase 3: Download Manager (10 tasks)

Extended download system for engine binaries + models (whisper + cohere).

- [ ] **3.1** Generic download task manager
  - New file: `src/main/transcription/download.ts`
  - `DownloadTask` type: id, engineId, modelId, files[], totalProgress, status
  - `DownloadFile` type: url, destPath, sizeBytes, sha256, status, progress
  - Queue: up to 2 concurrent downloads, rest queued
  - Events: `engines:download-progress`, `engines:download-done`, `engines:download-error`
  - Functions: `startDownload(task)`, `cancelDownload(taskId)`, `getActiveDownloads()`

- [ ] **3.2** Resume support
  - HTTP `Range` header for partial downloads
  - Check existing file size before starting
  - Resume from last byte on retry

- [ ] **3.3** SHA256 verification
  - After each file download: compute SHA256, compare with expected
  - Delete file if mismatch
  - Expected hashes from `BinaryDef.sha256` and `ModelDef` (if available)

- [ ] **3.4** Disk space check
  - `checkDiskSpace(requiredBytes: number, path: string): boolean`
  - Use `statfsSync` / `fs.statfs`
  - Call before starting any download task

- [ ] **3.5** Engine binary download
  - Download binary from `BinaryDef.url` to `{AppData}/engines/{binaryName}`
  - For zip archives: extract, find binary inside
  - Set executable permission (`chmod +x`)
  - Verify SHA256 before first execution

- [ ] **3.6** Refactor whisper model download
  - Move current `downloadModel()` logic from `ipc/models.ts` → use generic download manager
  - Keep `models:*` IPC channels working (backward compat)

- [ ] **3.7** HuggingFace API client
  - New file: `src/main/transcription/huggingface.ts`
  - `listRepoFiles(repoId, token?)`: GET `/api/models/{repoId}` → file list with sizes
  - `getDownloadUrl(repoId, filename, token?)`: redirect URL
  - Handle gated model authorization (401/403 errors)

- [ ] **3.8** Cohere model download
  - List files from HF repo via API client
  - Download each file to `{AppData}/models/cohere-transcribe-03-2026/`
  - Handle `vocab.json` (extract from binary release zip or download)

- [ ] **3.9** engines:\* IPC handlers
  - New file: `src/main/ipc/engines.ts`
  - `engines:list`: available engines with status
  - `engines:download`: start binary + model download
  - `engines:cancel-download`, `engines:delete`
  - `engines:disk-check`, `engines:ram-check`
  - Register in `ipc/index.ts`

- [ ] **3.10** Remove bundled binary
  - Delete `resources/whisper.cpp/` (keep `.gitkeep`)
  - Update `whisper/binary.ts`: only use `{AppData}/engines/`
  - Update `electron-builder.yml`: remove `asarUnpack: resources/**`
  - Remove `whisper:setup` script from `package.json`

---

## Phase 4: Cohere Runner (8 tasks)

Working transcription through Cohere Transcribe API server.

- [ ] **4.1** Cohere binary resolution
  - File: `src/main/transcription/cohere/binary.ts`
  - `getCohereBinaryPath(): string` → `{AppData}/engines/cohere-{platform}-{arch}`
  - Verify binary exists and is executable

- [ ] **4.2** CohereServerManager
  - File: `src/main/transcription/cohere/server.ts`
  - State: `'stopped' | 'starting' | 'ready'`
  - `ensure()`: start if stopped, return port if ready
  - `shutdown()`: graceful kill
  - `findFreePort()` before spawn
  - Wait `"Listening on"` in stdout
  - Idle timeout: 10 min auto-shutdown
  - Crash handling: detect exit, reset state

- [ ] **4.3** verbose_json parser
  - File: `src/main/transcription/cohere/parser.ts`
  - `parseCohereResponse(response): Segment[]`
  - Handle ~5s chunk overlap (keep as-is for MVP)

- [ ] **4.4** Cohere runner
  - File: `src/main/transcription/cohere/runner.ts`
  - `transcribeSession(sessionId)`: ensure server → HTTP POST verbose_json → parse → broadcast
  - No streaming segments (all at once)
  - `cancelTranscription(sessionId)`: abort HTTP + optional server shutdown
  - `transcribeAllSources(sessionId)`: sequential per audio source

- [ ] **4.5** Transcription router
  - File: `src/main/transcription/runner.ts`
  - `getRunner(engineId): TranscriptionRunner`
  - Routes to whisper, openai, or cohere runner

- [ ] **4.6** Update whisper IPC routing
  - File: `src/main/ipc/whisper.ts`
  - Read `session.engine`, use `getRunner(session.engine)`
  - Keep channel names `whisper:*`

- [ ] **4.7** RAM check
  - `checkRam(engineId)`: `os.freemem()` + `EngineDef.minRamMB`
  - Warning dialog if insufficient

- [ ] **4.8** Orphan process cleanup
  - `main/index.ts`: killOrphanProcesses on app ready
  - Graceful shutdown on app quit

---

## Phase 5: UI (10 tasks)

User-facing changes for all engines.

- [ ] **5.1** Centralize model metadata
  - New file: `src/renderer/src/data/engineMeta.ts`
  - Single source of truth for model labels, sizes, descriptions
  - Remove duplicates from FirstLaunch + Settings

- [ ] **5.2** FirstLaunch redesign
  - Step 1: Engine selection (cards, platform gating)
  - Step 2: Download (binary + model progress)
  - Step 3: Language (filtered by engine)
  - HF token / OpenAI API key prompt where needed

- [ ] **5.3** Settings: Engines section
  - Per-engine cards with status, download/delete
  - Engine-specific settings (collapsible)

- [ ] **5.4** Settings: API keys
  - OpenAI API key field (reveal/hide)
  - HuggingFace token field (reveal/hide)
  - Validation buttons

- [ ] **5.5** Home: engine badge + model picker
  - Engine name/badge next to model selector
  - Model picker filtered by current engine
  - `sessions:create` passes engine + model
  - No engine ready → "Download an engine to start"

- [ ] **5.6** Session: engine-aware UI
  - Model picker by engine, language filter
  - "Switch engine" clears segments
  - Engine-specific progress (whisper: progress bar, cohere: spinner)

- [ ] **5.7** App.tsx: first-launch check
  - Replace `models:list` with `engines:list`

- [ ] **5.8** Platform gating in UI
  - Disable unavailable engines with notes

- [ ] **5.9** Cost estimate display
  - Show estimated cost before OpenAI transcription
  - Per-model pricing info

- [ ] **5.10** Loading model state
  - Spinner for Cohere first-run model loading
