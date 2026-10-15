import { net, type Session } from 'electron'

export interface ProxyCredentials {
  host: string
  port: number
  username: string
  password: string
}

// net.request exposes the proxy login challenge; session.fetch does not provide
// a per-request login callback. Request encodes FormData with its correct boundary.
export async function fetchWithProxyAuth(
  provider: Session,
  url: string,
  init: RequestInit | undefined,
  credentials: ProxyCredentials
): Promise<Response> {
  const prepared = new Request(url, init)
  const body = prepared.body ? Buffer.from(await prepared.arrayBuffer()) : undefined
  const signal = init?.signal
  signal?.throwIfAborted()

  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method: prepared.method,
      headers: Object.fromEntries(prepared.headers),
      session: provider,
      redirect: init?.redirect ?? 'error'
    })
    let settled = false
    let attemptedLogin = false
    const finish = (err?: unknown, response?: Response): void => {
      if (settled) return
      settled = true
      signal?.removeEventListener('abort', abort)
      if (response) resolve(response)
      else reject(err)
    }
    const abort = (): void => {
      finish(signal?.reason)
      request.abort()
    }

    signal?.addEventListener('abort', abort, { once: true })
    request.on('login', (authInfo, callback) => {
      // Credentials belong only to this proxy, never to an origin's challenge.
      if (
        !authInfo.isProxy ||
        authInfo.host !== credentials.host ||
        authInfo.port !== credentials.port
      ) {
        callback()
        return
      }
      if (attemptedLogin) {
        finish(new Error('Proxy authentication failed. Check the proxy username and password.'))
        callback()
        request.abort()
        return
      }
      attemptedLogin = true
      callback(credentials.username, credentials.password)
    })
    request.on('error', (err) => finish(err))
    // The upload stream can emit close before login/response. Completion is
    // determined by response end/error rather than the request's close event.
    request.on('response', (response) => {
      const chunks: Buffer[] = []
      response.on('error', (err) => finish(err))
      response.on('aborted', () =>
        finish(signal?.reason ?? new Error('Provider response was interrupted.'))
      )
      response.on('end', () => {
        const headers = new Headers()
        for (const [name, value] of Object.entries(response.headers)) {
          for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item)
        }
        try {
          const empty = prepared.method === 'HEAD' || [204, 205, 304].includes(response.statusCode)
          finish(
            undefined,
            new Response(empty ? null : Buffer.concat(chunks), {
              status: response.statusCode,
              statusText: response.statusMessage,
              headers
            })
          )
        } catch (err) {
          finish(err)
        }
      })
      response.on('data', (chunk) => chunks.push(chunk))
    })
    request.end(body)
  })
}
