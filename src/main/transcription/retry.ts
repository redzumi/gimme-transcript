// Retry policy for cloud provider requests. Transient failures — Chromium
// network errors (net::ERR_TIMED_OUT, ERR_CONNECTION_RESET, ...), 429 and
// 5xx — are retried with backoff; everything else is returned to the caller.

const DEFAULT_DELAYS_MS = [2000, 5000]

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

function isRetryableNetworkError(err: unknown): boolean {
  return err instanceof Error && /net::ERR_/.test(err.message)
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// Calls `request` until it returns a non-retryable response or retries run
// out. The last response (possibly !ok) is returned; the caller maps errors.
export async function fetchWithRetry(
  request: () => Promise<Response>,
  signal?: AbortSignal,
  delaysMs: number[] = DEFAULT_DELAYS_MS
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < delaysMs.length
    let res: Response
    try {
      res = await request()
    } catch (err) {
      if (signal?.aborted || !canRetry || !isRetryableNetworkError(err)) throw err
      await sleep(delaysMs[attempt], signal)
      continue
    }
    if (canRetry && isRetryableStatus(res.status)) {
      await res.body?.cancel().catch(() => {})
      await sleep(delaysMs[attempt], signal)
      continue
    }
    return res
  }
}
