import { contextBridge, ipcRenderer } from 'electron'
import type { RecordingPermission, RecordingPermissions } from '../renderer/src/types/ipc'

const recordingApi = {
  checkPermissions: (): Promise<RecordingPermissions> =>
    ipcRenderer.invoke('recording:check-permissions'),

  openSettings: (permission: RecordingPermission): Promise<void> =>
    ipcRenderer.invoke('recording:open-settings', permission),

  getPlatform: (): Promise<string> => ipcRenderer.invoke('recording:get-platform'),

  start: (): Promise<{ sessionId: string }> => ipcRenderer.invoke('recording:start'),

  sendChunk: (sessionId: string, source: 'mic' | 'speaker', data: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('recording:chunk', sessionId, source, data),

  stop: (sessionId: string, hasSpeaker: boolean): Promise<unknown> =>
    ipcRenderer.invoke('recording:stop', sessionId, hasSpeaker),

  cancel: (sessionId: string): Promise<void> => ipcRenderer.invoke('recording:cancel', sessionId),

  closeWindow: (): void => ipcRenderer.send('recording:close-window')
}

contextBridge.exposeInMainWorld('recordingApi', recordingApi)
