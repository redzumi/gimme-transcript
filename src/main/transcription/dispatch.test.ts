import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: { engine: 'whisper', status: 'transcribing' },
  whisper: {
    transcribeSession: vi.fn(),
    transcribeAllSources: vi.fn(),
    cancelTranscription: vi.fn()
  },
  openai: {
    transcribeSession: vi.fn(),
    transcribeAllSources: vi.fn(),
    cancelTranscription: vi.fn()
  },
  updateSession: vi.fn()
}))
vi.mock('../storage', () => ({
  getSession: () => mocks.session,
  updateSession: mocks.updateSession
}))
vi.mock('./engines', () => ({
  ENGINES: { whisper: mocks.whisper, openai: mocks.openai },
  getEngine: (id: string) => (id === 'openai' ? mocks.openai : mocks.whisper)
}))

import { transcribeSession, transcribeAllSources, cancelTranscription } from './dispatch'

beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.engine = 'whisper'
  mocks.session.status = 'transcribing'
})

describe('transcription lifecycle', () => {
  it('cancels before the runner starts', async () => {
    const running = transcribeSession('s')
    await cancelTranscription('s')
    await running
    expect(mocks.whisper.transcribeSession).not.toHaveBeenCalled()
    expect(mocks.updateSession).toHaveBeenCalledWith('s', { status: 'idle' })
  })
  it('waits for the original runner to stop and persist before resolving cancellation', async () => {
    let finish!: () => void
    mocks.whisper.transcribeSession.mockImplementation(() => new Promise<void>((r) => (finish = r)))
    const running = transcribeSession('s')
    await Promise.resolve()
    // Cancellation must target the running engine even if persisted metadata changes.
    mocks.session.engine = 'openai'
    let cancelled = false
    const stopping = cancelTranscription('s').then(() => (cancelled = true))
    await Promise.resolve()
    expect(mocks.whisper.cancelTranscription).toHaveBeenCalledWith('s')
    expect(mocks.openai.cancelTranscription).not.toHaveBeenCalled()
    expect(cancelled).toBe(false)
    finish()
    await Promise.all([running, stopping])
    expect(mocks.updateSession).toHaveBeenCalledWith('s', { status: 'idle' })
  })

  it('recovers a stale transcribing session without a running process', async () => {
    await cancelTranscription('stale')
    expect(mocks.updateSession).toHaveBeenCalledWith('stale', { status: 'idle' })
    expect(mocks.whisper.cancelTranscription).not.toHaveBeenCalled()
  })

  it('does not change completed sessions', async () => {
    mocks.session.status = 'done'
    await cancelTranscription('done')
    expect(mocks.updateSession).not.toHaveBeenCalled()
  })

  it('treats an aborted runner rejection as successful cancellation', async () => {
    let fail!: (err: Error) => void
    mocks.whisper.transcribeAllSources.mockImplementation(
      () => new Promise<void>((_, reject) => (fail = reject))
    )
    mocks.whisper.cancelTranscription.mockImplementation(() => fail(new Error('aborted')))
    const running = transcribeAllSources('s')
    const failed = expect(running).rejects.toThrow('aborted')
    await Promise.resolve()
    await expect(cancelTranscription('s')).resolves.toBeUndefined()
    await failed
  })

  it('prevents duplicate jobs and permits restart after completion', async () => {
    const running = transcribeSession('s')
    await expect(transcribeAllSources('s')).rejects.toThrow('already transcribing')
    await running
    await transcribeSession('s')
    expect(mocks.whisper.transcribeSession).toHaveBeenCalledTimes(2)
  })
})
