// ElevenLabs Speech to Text REST client (Scribe).
// POST https://api.elevenlabs.io/v1/speech-to-text (multipart/form-data).

import { readFileSync } from 'fs'
import { basename } from 'path'
import { providerFetch } from '../network'
import { fetchWithRetry } from '../retry'

const API_BASE = 'https://api.elevenlabs.io/v1'

export interface ElevenLabsTranscribeOptions {
  apiKey: string
  model: string
  language?: string
  diarize?: boolean
  signal?: AbortSignal
}

export interface ElevenLabsWord {
  text: string
  start?: number
  end?: number
  type: 'word' | 'spacing' | 'audio_event'
  speaker_id?: string | null
}

export interface ElevenLabsResponse {
  language_code?: string
  text?: string
  words?: ElevenLabsWord[]
}

function detailMessage(body: string): string {
  try {
    const detail = (JSON.parse(body) as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    if (detail && typeof detail === 'object' && 'message' in detail) {
      return String((detail as { message: unknown }).message)
    }
  } catch {
    /* not JSON */
  }
  return body.slice(0, 200)
}

function mapError(status: number, body: string): Error {
  if (status === 401) return new Error('Invalid ElevenLabs API key. Check it in Settings.')
  if (status === 429) return new Error('ElevenLabs rate limited. Try again shortly.')
  if (status === 413) return new Error('Audio file too large for ElevenLabs.')
  return new Error(`ElevenLabs error ${status}: ${detailMessage(body)}`)
}

export async function elevenlabsTranscribe(
  audioPath: string,
  opts: ElevenLabsTranscribeOptions
): Promise<ElevenLabsResponse> {
  const buf = readFileSync(audioPath)
  const buildForm = (): FormData => {
    const form = new FormData()
    form.append('file', new Blob([buf]), basename(audioPath))
    form.append('model_id', opts.model)
    form.append('timestamps_granularity', 'word')
    form.append('tag_audio_events', 'false')
    form.append('diarize', opts.diarize ? 'true' : 'false')
    if (opts.language && opts.language !== 'auto') form.append('language_code', opts.language)
    return form
  }

  const res = await fetchWithRetry(
    () =>
      providerFetch(`${API_BASE}/speech-to-text`, {
        method: 'POST',
        headers: { 'xi-api-key': opts.apiKey },
        body: buildForm(),
        signal: opts.signal
      }),
    opts.signal
  )
  if (!res.ok) throw mapError(res.status, await res.text().catch(() => ''))
  return (await res.json()) as ElevenLabsResponse
}

// Validate an API key against GET /v1/user. A key restricted to speech-to-text
// lacks the user_read permission: ElevenLabs answers 401 "missing_permissions",
// which still proves the key itself is genuine.
export async function validateKey(key: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await providerFetch(`${API_BASE}/user`, {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(10000)
    })
    const body = await res.text().catch(() => '')
    if (res.status === 200) return { ok: true }
    if (res.status === 401 && body.includes('missing_permissions')) return { ok: true }
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
