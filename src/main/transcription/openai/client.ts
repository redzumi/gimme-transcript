// OpenAI audio transcription REST client.
// POST https://api.openai.com/v1/audio/transcriptions (multipart/form-data).

import { readFileSync } from 'fs'
import { basename } from 'path'
import https from 'https'

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

// Returns parsed JSON (verbose_json / diarized_json / json) or { text } for text.
export async function openaiTranscribe(
  audioPath: string,
  opts: OpenAITranscribeOptions
): Promise<unknown> {
  const buf = readFileSync(audioPath)
  const form = new FormData()
  form.append('file', new Blob([buf]), basename(audioPath))
  form.append('model', opts.model)
  form.append('response_format', opts.responseFormat)
  if (opts.language && opts.language !== 'auto') form.append('language', opts.language)
  if (opts.prompt) form.append('prompt', opts.prompt)
  if (opts.chunkingAuto) form.append('chunking_strategy', 'auto')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}` },
    body: form,
    signal: opts.signal
  })

  if (!res.ok) throw mapError(res.status, await res.text().catch(() => ''))
  if (opts.responseFormat === 'text') return { text: await res.text() }
  return res.json()
}

// Validate an API key against GET /v1/models.
export function validateKey(key: string): Promise<{ ok: boolean; message?: string }> {
  return new Promise((resolve) => {
    const req = https.request(
      'https://api.openai.com/v1/models',
      { method: 'GET', headers: { Authorization: `Bearer ${key}` }, timeout: 10000 },
      (res) => {
        res.resume()
        if (res.statusCode === 200) resolve({ ok: true })
        else if (res.statusCode === 401) resolve({ ok: false, message: 'Invalid API key' })
        else resolve({ ok: false, message: `HTTP ${res.statusCode}` })
      }
    )
    req.on('timeout', () => {
      req.destroy()
      resolve({ ok: false, message: 'Request timed out' })
    })
    req.on('error', (err) => resolve({ ok: false, message: err.message }))
    req.end()
  })
}
