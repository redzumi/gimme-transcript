import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  IpcInvokeChannel,
  IpcEventChannel,
  InvokeArgs,
  InvokeReturn,
  EventPayload
} from '../renderer/src/types/ipc'

const api = {
  invoke<C extends IpcInvokeChannel>(
    channel: C,
    ...args: InvokeArgs<C>
  ): Promise<InvokeReturn<C>> {
    return ipcRenderer.invoke(channel, ...args) as Promise<InvokeReturn<C>>
  },

  on<C extends IpcEventChannel>(
    channel: C,
    listener: (payload: EventPayload<C>) => void
  ): () => void {
    const handler = (_event: Electron.IpcRendererEvent, payload: EventPayload<C>): void =>
      listener(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  off<C extends IpcEventChannel>(
    channel: C,
    listener: (payload: EventPayload<C>) => void
  ): void {
    ipcRenderer.removeAllListeners(channel)
    void listener
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
