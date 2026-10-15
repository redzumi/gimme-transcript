import { randomUUID } from 'crypto'
import { session, type Session } from 'electron'
import { getSettings } from '../storage'
import { normalizeProviderProxy } from './proxy-config'
import { fetchWithProxyAuth, type ProxyCredentials } from './proxy-auth'

interface ProviderConnection {
  session: Session
  credentials?: ProxyCredentials
}

let cached: { proxyUrl: string; ready: Promise<ProviderConnection> } | undefined

async function providerSession(proxyUrl: string): Promise<ProviderConnection> {
  // A separate in-memory session keeps provider traffic isolated from the UI.
  // Changing proxy creates a new connection pool without interrupting active jobs.
  const provider = session.fromPartition(`provider-network-${randomUUID()}`, { cache: false })
  const parsed = proxyUrl ? new URL(proxyUrl) : undefined
  const credentials =
    parsed && (parsed.username || parsed.password)
      ? {
          host: parsed.hostname.replace(/^\[|\]$/g, ''),
          port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)),
          username: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password)
        }
      : undefined
  if (parsed) {
    parsed.username = ''
    parsed.password = ''
  }
  await provider.setProxy(
    parsed
      ? { mode: 'fixed_servers', proxyRules: `${parsed.protocol}//${parsed.host}` }
      : { mode: 'direct' }
  )
  return { session: provider, credentials }
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
  return provider.credentials
    ? fetchWithProxyAuth(provider.session, url, init, provider.credentials)
    : provider.session.fetch(url, init)
}
