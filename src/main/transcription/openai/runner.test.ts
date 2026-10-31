import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  request: vi.fn(),
  cleanup: vi.fn(),
  write: vi.fn(),
  send: vi.fn(),
  session: {
    id: 's',
    engine: 'openai',
    model: 'whisper-1',
    language: 'auto',
    status: 'idle',
    segments: [],
    audioSources: [{ path: '/audio.wav', speakerId: null }]
  }
}))
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: mocks.send } }]
  }
}))
vi.mock('fs', () => ({ existsSync: () => true, writeFileSync: mocks.write }))
vi.mock('fs/promises', () => ({ writeFile: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../storage', () => ({
  getSession: () => structuredClone(mocks.session),
  updateSession: vi.fn(),
  getSessionPath: () => '/s.json',
  getSettings: () => ({ openaiApiKey: 'test' }),
  listSpeakers: () => [],
  createSpeaker: vi.fn()
}))
vi.mock('./chunking', () => ({ planAudioParts: mocks.plan }))
vi.mock('./client', () => ({ openaiTranscribe: mocks.request }))

import { transcribeSession, transcribeAllSources, cancelTranscription } from './runner'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.plan.mockResolvedValue({
    parts: [{ path: '/audio.wav', offsetSec: 0, durationSec: 10 }],
    durationSec: 10,
    cleanup: mocks.cleanup
  })
})

it.each([transcribeSession, transcribeAllSources])(
  'cancels a stalled network request without reporting an error',
  async (start) => {
    mocks.request.mockImplementation(
      (_path: string, { signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
        })
    )
    const running = start('s')
    await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1))
    cancelTranscription('s')
    await running
    expect(JSON.parse(mocks.write.mock.lastCall?.[1] as string).status).toBe('idle')
    expect(mocks.cleanup).toHaveBeenCalledOnce()
    expect(mocks.send).not.toHaveBeenCalledWith('whisper:error', expect.anything())
    expect(mocks.send).not.toHaveBeenCalledWith('whisper:done', expect.anything())
  }
)

it('cancels during preparation without sending an upload', async () => {
  mocks.plan.mockImplementation(
    (_path: string, signal: AbortSignal) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
  )
  const running = transcribeSession('s')
  cancelTranscription('s')
  await running
  expect(mocks.request).not.toHaveBeenCalled()
  expect(JSON.parse(mocks.write.mock.lastCall?.[1] as string).status).toBe('idle')
})
