import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../network', () => ({ providerFetch: mocks.fetch }))
vi.mock('fs', () => ({ readFileSync: () => Buffer.from('test audio') }))
import { openaiTranscribe, validateKey } from './client'

beforeEach(() => vi.resetAllMocks())

it('uses the provider transport for multipart transcription and preserves cancellation', async () => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ text: 'hello' })))
  const signal = new AbortController().signal
  await expect(
    openaiTranscribe('/audio.wav', {
      apiKey: 'test',
      model: 'whisper-1',
      responseFormat: 'json',
      signal
    })
  ).resolves.toEqual({ text: 'hello' })
  const [url, init] = mocks.fetch.mock.calls[0]
  expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
  expect(init.signal).toBe(signal)
  expect(init.headers.Authorization).toBe('Bearer test')
  expect(init.body).toBeInstanceOf(FormData)
  expect(init.body.get('model')).toBe('whisper-1')
  expect(init.body.get('file').name).toBe('audio.wav')
})

it.each([
  [200, true],
  [401, false],
  [500, false]
])('uses the same provider transport for key verification (%s)', async (status, ok) => {
  mocks.fetch.mockResolvedValue(new Response('{}', { status }))
  expect((await validateKey('test')).ok).toBe(ok)
  expect(mocks.fetch).toHaveBeenCalledWith(
    'https://api.openai.com/v1/models',
    expect.objectContaining({
      headers: { Authorization: 'Bearer test' },
      signal: expect.any(AbortSignal)
    })
  )
})

it('reports connection failures and timeouts during key verification', async () => {
  mocks.fetch.mockRejectedValueOnce(new Error('Proxy unavailable'))
  await expect(validateKey('test')).resolves.toEqual({ ok: false, message: 'Proxy unavailable' })
  mocks.fetch.mockRejectedValueOnce(new DOMException('timeout', 'TimeoutError'))
  await expect(validateKey('test')).resolves.toEqual({ ok: false, message: 'Request timed out' })
})
