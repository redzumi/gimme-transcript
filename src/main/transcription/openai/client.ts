// OpenAI audio transcription REST client.
// POST https://api.openai.com/v1/audio/transcriptions (multipart/form-data).

import { readFileSync } from 'fs'
import { basename } from 'path'
import { providerFetch } from '../network'

export type OpenAIResponseFormat = 'verbose_json' | 'diarized_json' | 'json' | 'text'

export interface OpenAITranscribeOptions {
  apiKey: string
  model: string
  responseFormat: OpenAIResponseFormat
  language?: string
  prompt?: string
  chunkingAuto?: boolean
  signal?: AbortSignal
}

function mapError(status: number, body: string): Error {
  if (status === 401) return new Error('Invalid OpenAI API key. Check it in Settings.')
  if (status === 429) return new Error('OpenAI rate limited. Try again shortly.')
  if (status === 413) return new Error('Audio file too large for OpenAI (25 MB limit).')
  if (status === 402) return new Error('OpenAI quota exceeded.')
  return new Error(`OpenAI error ${status}: ${body.slice(0, 200)}`)
}

const RETRY_DELAYS_MS = [2000, 5000]

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

// Chromium network-stack failures (net::ERR_TIMED_OUT, ERR_CONNECTION_RESET, ...).
function isRetryableNetworkError(err: unknown): boolean {
  return err instanceof Error && /net::ERR_/.test(err.message)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
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

// Returns parsed JSON (verbose_json / diarized_json / json) or { text } for text.
// Transient failures (network errors, 429, 5xx) are retried with backoff.
export async function openaiTranscribe(
  audioPath: string,
  opts: OpenAITranscribeOptions
): Promise<unknown> {
  const buf = readFileSync(audioPath)
  const buildForm = (): FormData => {
    const form = new FormData()
    form.append('file', new Blob([buf]), basename(audioPath))
    form.append('model', opts.model)
    form.append('response_format', opts.responseFormat)
    if (opts.language && opts.language !== 'auto') form.append('language', opts.language)
    if (opts.prompt) form.append('prompt', opts.prompt)
    if (opts.chunkingAuto) form.append('chunking_strategy', 'auto')
    return form
  }

  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt < RETRY_DELAYS_MS.length
    let res: Response
    try {
      res = await providerFetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}` },
        body: buildForm(),
        signal: opts.signal
      })
    } catch (err) {
      if (opts.signal?.aborted || !canRetry || !isRetryableNetworkError(err)) throw err
      await sleep(RETRY_DELAYS_MS[attempt], opts.signal)
      continue
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (canRetry && isRetryableStatus(res.status)) {
        await sleep(RETRY_DELAYS_MS[attempt], opts.signal)
        continue
      }
      throw mapError(res.status, body)
    }
    if (opts.responseFormat === 'text') return { text: await res.text() }
    return res.json()
  }
}

// Validate an API key against GET /v1/models.
export async function validateKey(key: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await providerFetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000)
    })
    await res.body?.cancel()
    if (res.status === 200) return { ok: true }
    if (res.status === 401) return { ok: false, message: 'Invalid API key' }
    return { ok: false, message: `HTTP ${res.status}` }
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error && err.name === 'TimeoutError'
          ? 'Request timed out'
          : err instanceof Error
            ? err.message
            : String(err)
    }
  }
}
