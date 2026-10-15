import { once } from 'events'
import { expect, it } from 'vitest'
import { spawnCancellable } from './process'

it('stops a child process on cancellation', async () => {
  const controller = new AbortController()
  const proc = spawnCancellable(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    controller.signal
  )
  const closed = once(proc, 'close')
  controller.abort()
  const [code, signal] = await closed
  expect(code).toBeNull()
  expect(signal).toBe('SIGTERM')
})

it('kills a child that ignores graceful cancellation', async () => {
  const controller = new AbortController()
  const proc = spawnCancellable(
    process.execPath,
    ['-e', 'process.on("SIGTERM", () => {}); console.log("ready"); setInterval(() => {}, 1000)'],
    controller.signal
  )
  try {
    await once(proc.stdout, 'data')
    const closed = once(proc, 'close')
    controller.abort()
    const [code, signal] = await closed
    expect(code).toBeNull()
    expect(signal).toBe('SIGKILL')
  } finally {
    proc.kill('SIGKILL')
  }
})

it('does not launch a child when already cancelled', () => {
  const controller = new AbortController()
  controller.abort()
  expect(() => spawnCancellable(process.execPath, [], controller.signal)).toThrow()
})
