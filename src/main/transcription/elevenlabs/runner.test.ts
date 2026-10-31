import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  compress: vi.fn(),
  write: vi.fn(),
  send: vi.fn(),
  createSpeaker: vi.fn((name: string) => ({ id: `id-${name}`, name })),
  size: 1024,
  session: {
    id: 's',
    engine: 'elevenlabs',
    model: 'scribe_v2-diarize',
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
vi.mock('fs', () => ({
  existsSync: () => true,
  statSync: () => ({ size: mocks.size }),
  unlinkSync: vi.fn(),
  writeFileSync: mocks.write
}))
vi.mock('../../storage', () => ({
  getSession: () => structuredClone(mocks.session),
  updateSession: vi.fn(),
  getSessionPath: () => '/s.json',
  getSettings: () => ({ elevenlabsApiKey: 'test' }),
  listSpeakers: () => [],
  createSpeaker: mocks.createSpeaker
}))
vi.mock('../ffmpeg', () => ({ compressToMp3: mocks.compress }))
vi.mock('./client', () => ({ elevenlabsTranscribe: mocks.request }))

import { transcribeSession, transcribeAllSources, cancelTranscription, parseModel } from './runner'

function lastSaved(): { status: string; segments: { text: string; speakerId: string | null }[] } {
  return JSON.parse(mocks.write.mock.lastCall?.[1] as string)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.size = 1024
  mocks.compress.mockResolvedValue(undefined)
})

it('parses diarization from the model id', () => {
  expect(parseModel('scribe_v2')).toEqual({ apiModel: 'scribe_v2', diarize: false })
  expect(parseModel('scribe_v2-diarize')).toEqual({ apiModel: 'scribe_v2', diarize: true })
})

it('transcribes in one request and resolves diarized speakers', async () => {
  mocks.request.mockResolvedValue({
    words: [
      { text: 'Hi.', start: 0, end: 0.5, type: 'word', speaker_id: 'speaker_0' },
      { text: 'Hello.', start: 1, end: 1.5, type: 'word', speaker_id: 'speaker_1' }
    ]
  })
  await transcribeSession('s')
  expect(mocks.request).toHaveBeenCalledOnce()
  expect(mocks.request.mock.calls[0][1]).toMatchObject({ model: 'scribe_v2', diarize: true })
  expect(mocks.compress).not.toHaveBeenCalled()
  const saved = lastSaved()
  expect(saved.status).toBe('done')
  expect(saved.segments.map((s) => [s.text, s.speakerId])).toEqual([
    ['Hi.', 'id-Speaker 1'],
    ['Hello.', 'id-Speaker 2']
  ])
  expect(mocks.send).toHaveBeenCalledWith('whisper:done', { sessionId: 's' })
})

it('compresses large files before upload', async () => {
  mocks.size = 200 * 1024 * 1024
  mocks.request.mockResolvedValue({ words: [] })
  await transcribeSession('s')
  expect(mocks.compress).toHaveBeenCalledOnce()
  expect(mocks.request.mock.calls[0][0]).toMatch(/elevenlabs-.*\.mp3$/)
})

it.each([transcribeSession, transcribeAllSources])(
  'cancels a stalled request without reporting an error',
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
    expect(lastSaved().status).toBe('idle')
    expect(mocks.send).not.toHaveBeenCalledWith('whisper:error', expect.anything())
    expect(mocks.send).not.toHaveBeenCalledWith('whisper:done', expect.anything())
  }
)

it('reports API errors', async () => {
  mocks.request.mockRejectedValue(new Error('ElevenLabs error 422: bad file'))
  await expect(transcribeSession('s')).rejects.toThrow('bad file')
  expect(mocks.send).toHaveBeenCalledWith('whisper:error', {
    sessionId: 's',
    message: 'ElevenLabs error 422: bad file'
  })
  expect(lastSaved().status).toBe('idle')
})
