import type { TranscriptionEngine } from './ipc'

export interface EngineInfo {
  id: TranscriptionEngine
  name: string
  description: string
  languages: { code: string; name: string }[]
  features: {
    timestamps: boolean
    autoLanguage: boolean
    streamingProgress: boolean
    requiresApiKey: boolean
    requiresNetwork: boolean
    diarization: boolean
  }
  platformNote?: string
  status: 'available' | 'needs-download' | 'needs-key' | 'unavailable'
}

export interface EngineModelInfo {
  id: string
  name: string
  sizeBytes: number
  downloaded: boolean
  pricePerMinute?: number
}
