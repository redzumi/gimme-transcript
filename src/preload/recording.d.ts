export interface RecordingApi {
  checkPermissions(): Promise<{ mic: boolean; screenRecording: boolean }>
  openSettings(permission: string): Promise<void>
  getDesktopSources(): Promise<Array<{ id: string; name: string }>>
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
