import type { RecordingPermission, RecordingPermissions } from '../renderer/src/types/ipc'

export interface RecordingApi {
  checkPermissions(): Promise<RecordingPermissions>
  openSettings(permission: RecordingPermission): Promise<void>
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
