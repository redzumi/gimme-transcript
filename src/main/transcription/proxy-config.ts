const DEFAULT_PORTS: Record<string, string> = {
  'http:': '80',
  'https:': '443',
  'socks4:': '1080',
  'socks5:': '1080'
}

export function normalizeProviderProxy(value: string): string {
  const input = value.trim()
  if (!input) return ''

  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error(
      'Enter a proxy URL, for example http://127.0.0.1:8080 or socks5://127.0.0.1:1080.'
    )
  }
  if (!DEFAULT_PORTS[url.protocol] || !/^[a-z\d._:[\]-]+$/i.test(url.hostname)) {
    throw new Error('Proxy must use HTTP, HTTPS, SOCKS4 or SOCKS5 and include a host.')
  }
  if (url.username || url.password) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(
        'SOCKS proxy authentication is not supported. Use an HTTP or HTTPS proxy with authentication.'
      )
    }
    try {
      decodeURIComponent(url.username)
      decodeURIComponent(url.password)
    } catch {
      throw new Error('Proxy credentials contain invalid URL encoding.')
    }
  }
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error('Proxy URL must contain only a scheme, host and optional port.')
  }
  const port = url.port || DEFAULT_PORTS[url.protocol]
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Proxy port must be between 1 and 65535.')
  }
  const credentials = url.username || url.password ? `${url.username}:${url.password}@` : ''
  return `${url.protocol}//${credentials}${url.hostname}:${port}`
}
