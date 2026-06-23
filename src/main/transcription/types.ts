import os from 'os'

export type TranscriptionEngine = 'whisper' | 'openai' | 'cohere' | 't-one'

export type Platform = ReturnType<typeof os.platform>
export type Arch = ReturnType<typeof os.arch>

export interface PlatformSupport {
  platform: string
  arch: string
  note?: string
  minOsVersion?: number
}

export interface BinaryDef {
  platform: string
  arch: string
  url: string
  sizeBytes: number
  sha256?: string
}

export interface ModelDef {
  id: string
  name: string
  sizeBytes: number
  url: string
  gated?: boolean
  isDirectory?: boolean
  version?: string
  latest?: boolean
  pricePerMinute?: number
}

export interface LanguageDef {
  code: string
  name: string
}

export interface EngineFeatures {
  timestamps: boolean
  autoLanguage: boolean
  streamingProgress: boolean
  requiresApiKey: boolean
  requiresNetwork: boolean
  diarization: boolean
}

export interface EngineDef {
  id: TranscriptionEngine
  name: string
  description: string
  platforms: PlatformSupport[]
  minRamMB?: number
  binaries: BinaryDef[]
  models: ModelDef[]
  languages: LanguageDef[]
  features: EngineFeatures
}

export function getAvailableEngines(registry: EngineDef[]): EngineDef[] {
  const currentPlatform = os.platform()
  const currentArch = os.arch()
  const osMajor = parseInt(os.release().split('.')[0], 10)

  return registry.filter((engine) =>
    engine.platforms.some(
      (p) =>
        p.platform === currentPlatform &&
        p.arch === currentArch &&
        (p.minOsVersion === undefined || osMajor >= p.minOsVersion)
    )
  )
}

export function getEngineDef(registry: EngineDef[], engineId: string): EngineDef | undefined {
  return registry.find((e) => e.id === engineId)
}
