import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'

// Wait for close in the caller so cancellation finishes before temporary files
// are removed or the session can be started again.
export function spawnCancellable(
  command: string,
  args: string[],
  signal?: AbortSignal
): ChildProcessWithoutNullStreams {
  signal?.throwIfAborted()
  const proc = spawn(command, args)
  let killTimer: ReturnType<typeof setTimeout> | undefined
  const abort = (): void => {
    proc.kill('SIGTERM')
    killTimer = setTimeout(() => proc.kill('SIGKILL'), 1000)
    killTimer.unref()
  }
  signal?.addEventListener('abort', abort, { once: true })
  proc.once('close', () => {
    signal?.removeEventListener('abort', abort)
    clearTimeout(killTimer)
  })
  return proc
}
