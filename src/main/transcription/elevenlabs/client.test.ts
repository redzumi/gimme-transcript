import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../network', () => ({ providerFetch: mocks.fetch }))
vi.mock('fs', () => ({ readFileSync: () => Buffer.from('test audio') }))
import { elevenlabsTranscribe, validateKey } from './client'

beforeEach(() => vi.resetAllMocks())

it('sends a multipart request with model, language and diarization', async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ text: 'hi', words: [] })))
  const signal = new AbortController().signal
  await expect(
    elevenlabsTranscribe('/audio.mp3', {
      apiKey: 'key',
      model: 'scribe_v2',
      language: 'ru',
      diarize: true,
      signal
    })
  ).resolves.toEqual({ text: 'hi', words: [] })
  const [url, init] = mocks.fetch.mock.calls[0]
  expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text')
  expect(init.signal).toBe(signal)
  expect(init.headers['xi-api-key']).toBe('key')
  expect(init.body.get('model_id')).toBe('scribe_v2')
  expect(init.body.get('language_code')).toBe('ru')
  expect(init.body.get('diarize')).toBe('true')
  expect(init.body.get('timestamps_granularity')).toBe('word')
  expect(init.body.get('file').name).toBe('audio.mp3')
})

it('omits language for auto-detect', async () => {
  mocks.fetch.mockResolvedValue(new Response('{}'))
  await elevenlabsTranscribe('/a.mp3', { apiKey: 'k', model: 'scribe_v2', language: 'auto' })
  expect(mocks.fetch.mock.calls[0][1].body.has('language_code')).toBe(false)
})

it('maps API errors with the detail message', async () => {
  mocks.fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ detail: { status: 'invalid', message: 'bad file' } }), {
      status: 422
    })
  )
  await expect(elevenlabsTranscribe('/a.mp3', { apiKey: 'k', model: 'scribe_v2' })).rejects.toThrow(
    'ElevenLabs error 422: bad file'
  )
  mocks.fetch.mockResolvedValueOnce(new Response('{}', { status: 401 }))
  await expect(elevenlabsTranscribe('/a.mp3', { apiKey: 'k', model: 'scribe_v2' })).rejects.toThrow(
    'Invalid ElevenLabs API key'
  )
})

it.each([
  [200, '{}', true],
  [401, '{"detail":{"status":"missing_permissions"}}', true],
  [401, '{"detail":{"status":"invalid_api_key"}}', false],
  [500, '', false]
])('validates keys against /v1/user (%s)', async (status, body, ok) => {
  mocks.fetch.mockResolvedValue(new Response(body, { status }))
  expect((await validateKey('k')).ok).toBe(ok)
  expect(mocks.fetch).toHaveBeenCalledWith(
    'https://api.elevenlabs.io/v1/user',
    expect.objectContaining({ headers: { 'xi-api-key': 'k' } })
  )
})
