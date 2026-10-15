import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  proxy: '',
  fromPartition: vi.fn(),
  setProxy: vi.fn(),
  fetch: vi.fn()
}))
vi.mock('electron', () => ({ session: { fromPartition: mocks.fromPartition } }))
vi.mock('../storage', () => ({ getSettings: () => ({ providerProxyUrl: mocks.proxy }) }))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.proxy = ''
  mocks.setProxy.mockResolvedValue(undefined)
  mocks.fetch.mockResolvedValue(new Response('{}'))
  mocks.fromPartition.mockImplementation(() => ({ setProxy: mocks.setProxy, fetch: mocks.fetch }))
})

it('uses an isolated direct connection when the proxy is empty', async () => {
  const { providerFetch } = await import('./network')
  await providerFetch('https://provider.example')
  expect(mocks.fromPartition).toHaveBeenCalledWith(expect.stringMatching(/^provider-network-/), {
    cache: false
  })
  expect(mocks.setProxy).toHaveBeenCalledWith({ mode: 'direct' })
})

it('shares proxy configuration across concurrent requests and forwards body and cancellation', async () => {
  mocks.proxy = 'socks5://127.0.0.1:1080'
  const { providerFetch } = await import('./network')
  const signal = new AbortController().signal
  const init = { method: 'POST', body: 'audio', signal }
  await Promise.all([
    providerFetch('https://provider.example', init),
    providerFetch('https://provider.example/models')
  ])
  expect(mocks.setProxy).toHaveBeenCalledOnce()
  expect(mocks.setProxy).toHaveBeenCalledWith({ mode: 'fixed_servers', proxyRules: mocks.proxy })
  expect(mocks.fetch).toHaveBeenCalledWith('https://provider.example', init)
})

it('creates a fresh connection pool after changing or disabling the proxy', async () => {
  const { providerFetch } = await import('./network')
  mocks.proxy = 'http://localhost:8080'
  await providerFetch('https://provider.example')
  mocks.proxy = 'socks5://localhost:1080'
  await providerFetch('https://provider.example')
  mocks.proxy = ''
  await providerFetch('https://provider.example')
  expect(mocks.fromPartition).toHaveBeenCalledTimes(3)
  expect(new Set(mocks.fromPartition.mock.calls.map((call) => call[0])).size).toBe(3)
  expect(mocks.setProxy).toHaveBeenLastCalledWith({ mode: 'direct' })
})

it('does not send a request cancelled while proxy configuration is pending', async () => {
  let finish!: () => void
  mocks.setProxy.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
  const { providerFetch } = await import('./network')
  const controller = new AbortController()
  const request = providerFetch('https://provider.example', { signal: controller.signal })
  const rejected = expect(request).rejects.toThrow()
  controller.abort()
  finish()
  await rejected
  expect(mocks.fetch).not.toHaveBeenCalled()
})

it('retries failed configuration without silently using a direct connection', async () => {
  mocks.proxy = 'http://localhost:8080'
  mocks.setProxy.mockRejectedValueOnce(new Error('configuration failed'))
  const { providerFetch } = await import('./network')
  await expect(providerFetch('https://provider.example')).rejects.toThrow('configuration failed')
  expect(mocks.fetch).not.toHaveBeenCalled()
  await providerFetch('https://provider.example')
  expect(mocks.setProxy).toHaveBeenCalledTimes(2)
  expect(mocks.setProxy).toHaveBeenLastCalledWith({
    mode: 'fixed_servers',
    proxyRules: mocks.proxy
  })
})
