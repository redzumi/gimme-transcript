import { randomUUID } from 'crypto'
import { session, type Session } from 'electron'
import { getSettings } from '../storage'
import { normalizeProviderProxy } from './proxy-config'

let cached: { proxyUrl: string; ready: Promise<Session> } | undefined

async function providerSession(proxyUrl: string): Promise<Session> {
  // A separate in-memory session keeps provider traffic isolated from the UI.
  // Changing proxy creates a new connection pool without interrupting active jobs.
  const provider = session.fromPartition(`provider-network-${randomUUID()}`, { cache: false })
  await provider.setProxy(
    proxyUrl ? { mode: 'fixed_servers', proxyRules: proxyUrl } : { mode: 'direct' }
  )
  return provider
}

export async function providerFetch(url: string, init?: RequestInit): Promise<Response> {
  init?.signal?.throwIfAborted()
  const proxyUrl = normalizeProviderProxy(getSettings().providerProxyUrl ?? '')
  if (!cached || cached.proxyUrl !== proxyUrl) {
    const entry = { proxyUrl, ready: providerSession(proxyUrl) }
    cached = entry
    // Failed configuration must be retryable on the next request.
    void entry.ready.catch(() => {
      if (cached === entry) cached = undefined
    })
  }
  const provider = await cached.ready
  init?.signal?.throwIfAborted()
  return provider.fetch(url, init)
}
