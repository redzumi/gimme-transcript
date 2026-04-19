import type {
  IpcInvokeChannel,
  IpcEventChannel,
  InvokeArgs,
  InvokeReturn,
  EventPayload
} from '../renderer/src/types/ipc'

interface Api {
  invoke<C extends IpcInvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeReturn<C>>
  on<C extends IpcEventChannel>(
    channel: C,
    listener: (payload: EventPayload<C>) => void
  ): () => void
}

declare global {
  interface Window {
    api: Api
  }
}
