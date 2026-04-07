import { contextBridge, ipcRenderer } from 'electron'

const recordingApi = {
  checkPermissions: (): Promise<{ mic: boolean; screenRecording: boolean }> =>
    ipcRenderer.invoke('recording:check-permissions'),

  openSettings: (permission: string): Promise<void> =>
    ipcRenderer.invoke('recording:open-settings', permission),

  getDesktopSources: (): Promise<Array<{ id: string; name: string }>> =>
    ipcRenderer.invoke('recording:get-desktop-sources'),

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
