import { expect, it, vi } from 'vitest'
import { fetchWithRetry } from './retry'

it('retries network errors and 5xx, then returns the response', async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error('net::ERR_TIMED_OUT'))
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(new Response('ok'))
  const res = await fetchWithRetry(request, undefined, [0, 0])
  expect(await res.text()).toBe('ok')
  expect(request).toHaveBeenCalledTimes(3)
})

it('returns the last failing response once retries run out', async () => {
  const request = vi.fn().mockResolvedValue(new Response('', { status: 500 }))
  const res = await fetchWithRetry(request, undefined, [0])
  expect(res.status).toBe(500)
  expect(request).toHaveBeenCalledTimes(2)
})

it('does not retry client errors or non-network exceptions', async () => {
  const bad = vi.fn().mockResolvedValue(new Response('', { status: 400 }))
  expect((await fetchWithRetry(bad, undefined, [0])).status).toBe(400)
  expect(bad).toHaveBeenCalledOnce()

  const boom = vi.fn().mockRejectedValue(new Error('boom'))
  await expect(fetchWithRetry(boom, undefined, [0])).rejects.toThrow('boom')
  expect(boom).toHaveBeenCalledOnce()
})

it('stops waiting when cancelled', async () => {
  const controller = new AbortController()
  const request = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
  const running = fetchWithRetry(request, controller.signal, [60_000])
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce())
  controller.abort(new Error('cancelled'))
  await expect(running).rejects.toThrow('cancelled')
})
