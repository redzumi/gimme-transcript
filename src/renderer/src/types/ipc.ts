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

export interface RecordingPermissions {
  mic: boolean
  screenRecording: boolean
}

export type RecordingPermission = 'microphone' | 'screenRecording'

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
  'recording:check-permissions': { args: []; return: RecordingPermissions }
  'recording:open-settings': { args: [permission: RecordingPermission]; return: void }
  'recording:get-platform': { args: []; return: string }
  'recording:reveal-path': { args: [path: string]; return: boolean }
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
