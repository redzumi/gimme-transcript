import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcInvokeChannel,
  IpcEventChannel,
  InvokeArgs,
  InvokeReturn,
  EventPayload
} from '../renderer/src/types/ipc'

const api = {
  invoke<C extends IpcInvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeReturn<C>> {
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
  }
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error(error)
}
