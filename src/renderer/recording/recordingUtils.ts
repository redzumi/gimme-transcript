export type TrackKind = 'microphone' | 'system'

export type TrackStatus = 'idle' | 'starting' | 'recording' | 'stopping' | 'error'

export const TRACK_BAR_COUNT = 18

export function createBars(count: number = TRACK_BAR_COUNT): number[] {
  return Array.from({ length: count }, () => 0)
}

export function nowLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export function limitLogs(logs: string[], limit = 8): string[] {
  return logs.length > limit ? logs.slice(logs.length - limit) : logs
}

export function getPreferredMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ''
}

export function readBands(analyser: AnalyserNode | null): { level: number; bars: number[] } {
  if (!analyser) {
    return { level: 0, bars: createBars() }
  }

  const frequencyData = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(frequencyData)

  const level =
    frequencyData.length === 0
      ? 0
      : frequencyData.reduce((sum, value) => sum + value, 0) / frequencyData.length / 255

  const bucketSize = Math.max(1, Math.floor(frequencyData.length / TRACK_BAR_COUNT))
  const bars = Array.from({ length: TRACK_BAR_COUNT }, (_, index) => {
    const start = index * bucketSize
    const end = Math.min(frequencyData.length, start + bucketSize)
    const slice = frequencyData.slice(start, end)
    if (slice.length === 0) return 0
    return slice.reduce((sum, value) => sum + value, 0) / slice.length / 255
  })

  return { level, bars }
}
