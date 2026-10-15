import { EventEmitter } from 'events'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Session } from 'electron'

const mocks = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('electron', () => ({ net: { request: mocks.request } }))
import { fetchWithProxyAuth } from './proxy-auth'

const credentials = { host: 'proxy.example', port: 8080, username: 'user', password: 'test-secret' }
// The session is passed through to Electron; no session methods are used here.
const provider = {} as Session
const challenge = { isProxy: true, host: 'proxy.example', port: 8080 }
let request: EventEmitter & { end: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.resetAllMocks()
  request = Object.assign(new EventEmitter(), { end: vi.fn(), abort: vi.fn() })
  mocks.request.mockReturnValue(request)
})

function response(statusCode = 200): EventEmitter {
  const incoming = Object.assign(new EventEmitter(), {
    statusCode,
    statusMessage: 'OK',
    headers: { 'content-type': 'application/json' }
  })
  request.emit('response', incoming)
  return incoming
}

it('answers only the configured proxy challenge and returns the complete response', async () => {
  const running = fetchWithProxyAuth(provider, 'https://provider.example', undefined, credentials)
  // Electron can close the upload stream before the proxy login/response arrives.
  request.emit('close')
  const callback = vi.fn()
  request.emit('login', challenge, callback)
  expect(callback).toHaveBeenCalledWith('user', 'test-secret')
  expect(mocks.request.mock.calls[0][0].headers).not.toHaveProperty('Proxy-Authorization')
  const incoming = response()
  incoming.emit('data', Buffer.from('{"text":"hello"}'))
  incoming.emit('end')
  request.emit('close')
  expect(await (await running).json()).toEqual({ text: 'hello' })
})

it.each([
  { ...challenge, isProxy: false },
  { ...challenge, host: 'another-proxy.example' },
  { ...challenge, port: 8081 }
])('does not disclose proxy credentials to a different authentication target', async (authInfo) => {
  const running = fetchWithProxyAuth(provider, 'https://provider.example', undefined, credentials)
  const callback = vi.fn()
  request.emit('login', authInfo, callback)
  expect(callback).toHaveBeenCalledWith()
  const incoming = response(401)
  incoming.emit('end')
  expect((await running).status).toBe(401)
})

it('stops retrying rejected credentials', async () => {
  const running = fetchWithProxyAuth(provider, 'https://provider.example', undefined, credentials)
  const failed = expect(running).rejects.toThrow('Proxy authentication failed')
  const callback = vi.fn()
  request.emit('login', challenge, callback)
  request.emit('login', challenge, callback)
  await failed
  expect(request.abort).toHaveBeenCalledOnce()
  expect(callback).toHaveBeenLastCalledWith()
})

it('encodes multipart uploads and keeps the provider API key on the origin request', async () => {
  const body = new FormData()
  body.append('file', new Blob(['audio']), 'test.wav')
  body.append('model', 'whisper-1')
  const running = fetchWithProxyAuth(
    provider,
    'https://provider.example',
    {
      method: 'POST',
      body,
      headers: { Authorization: 'Bearer test-key' }
    },
    credentials
  )
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce())
  const options = mocks.request.mock.calls[0][0]
  expect(options.headers.authorization).toBe('Bearer test-key')
  expect(options.headers['content-type']).toMatch(/multipart\/form-data; boundary=/)
  const sent = request.end.mock.calls[0][0].toString()
  expect(sent).toContain('test.wav')
  expect(sent).toContain('whisper-1')
  expect(sent).not.toContain('test-secret')
  const incoming = response()
  incoming.emit('end')
  await running
})

it.each([false, true])(
  'cancels a stalled request, including while reading a response (%s)',
  async (receiving) => {
    const controller = new AbortController()
    const running = fetchWithProxyAuth(
      provider,
      'https://provider.example',
      { signal: controller.signal },
      credentials
    )
    const failed = expect(running).rejects.toThrow('cancelled by test')
    if (receiving) response().emit('data', Buffer.from('{'))
    controller.abort(new Error('cancelled by test'))
    await failed
    expect(request.abort).toHaveBeenCalledOnce()
  }
)

it('does not launch an already cancelled request', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    fetchWithProxyAuth(
      provider,
      'https://provider.example',
      { signal: controller.signal },
      credentials
    )
  ).rejects.toThrow()
  expect(mocks.request).not.toHaveBeenCalled()
})
