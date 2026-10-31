// ElevenLabs (Scribe) cloud transcription runner. One request per audio source:
// Scribe accepts recordings up to 10 hours, so speaker labels stay consistent
// across the whole file. Streams Segments + progress over the shared
// `whisper:*` IPC channels, mirroring the other runners.

import { randomUUID } from 'crypto'
import { existsSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import type { Segment, Session } from '../../../renderer/src/types/ipc'
import {
  getSession,
  updateSession,
  getSessionPath,
  getSettings,
  listSpeakers,
  createSpeaker
} from '../../storage'
import { compressToMp3 } from '../ffmpeg'
import { elevenlabsTranscribe } from './client'
import { parseWords } from './parser'

// Larger files are compressed to a small mono MP3 first: faster uploads and
// fewer network timeouts on slow links.
const COMPRESS_ABOVE_BYTES = 25 * 1024 * 1024
const DIARIZE_SUFFIX = '-diarize'

const controllers = new Map<string, AbortController>()
const cancelled = new Set<string>()

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

// Registry model ids encode diarization: 'scribe_v2-diarize' → scribe_v2 + diarize.
export function parseModel(model: string): { apiModel: string; diarize: boolean } {
  return model.endsWith(DIARIZE_SUFFIX)
    ? { apiModel: model.slice(0, -DIARIZE_SUFFIX.length), diarize: true }
    : { apiModel: model, diarize: false }
}

function resolveSpeakerId(name: string, cache: Map<string, string>): string {
  const cached = cache.get(name)
  if (cached) return cached
  const existing = listSpeakers().find((s) => s.name === name)
  const speaker = existing ?? createSpeaker(name)
  cache.set(name, speaker.id)
  return speaker.id
}

async function prepareUpload(
  audioPath: string,
  signal: AbortSignal
): Promise<{ path: string; cleanup: () => void }> {
  if (statSync(audioPath).size <= COMPRESS_ABOVE_BYTES) {
    return { path: audioPath, cleanup: () => {} }
  }
  const mp3 = join(tmpdir(), `elevenlabs-${randomUUID()}.mp3`)
  const cleanup = (): void => {
    try {
      unlinkSync(mp3)
    } catch {
      /* ignore */
    }
  }
  try {
    await compressToMp3(audioPath, mp3, signal)
  } catch (err) {
    cleanup()
    throw err
  }
  return { path: mp3, cleanup }
}

async function transcribeOneSource(
  sessionId: string,
  audioPath: string,
  apiKey: string,
  model: string,
  language: string,
  onProgress: (percent: number) => void
): Promise<Segment[]> {
  const controller = controllers.get(sessionId)
  if (!controller) throw new Error('Transcription is not running')
  const { signal } = controller
  const { apiModel, diarize } = parseModel(model)

  const upload = await prepareUpload(audioPath, signal)
  try {
    onProgress(5)
    const resp = await elevenlabsTranscribe(upload.path, {
      apiKey,
      model: apiModel,
      language,
      diarize,
      signal
    })
    signal.throwIfAborted()

    const speakerCache = new Map<string, string>()
    const segments = parseWords(resp).map(
      (ps): Segment => ({
        id: randomUUID(),
        start: ps.start,
        end: ps.end || ps.start,
        text: ps.text,
        speakerId: ps.speaker ? resolveSpeakerId(ps.speaker, speakerCache) : null
      })
    )
    onProgress(99)
    return segments
  } finally {
    upload.cleanup()
  }
}

function requireApiKey(): string {
  const key = getSettings().elevenlabsApiKey
  if (!key) throw new Error('Set your ElevenLabs API key in Settings.')
  return key
}

export async function transcribeSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  const primary = session.audioSources[0]?.path ?? ''
  if (!primary || !existsSync(primary)) throw new Error('Audio file not found')

  cancelled.delete(sessionId)
  controllers.set(sessionId, new AbortController())
  const sessionFilePath = getSessionPath(sessionId)
  const liveSession: Session = { ...session, status: 'transcribing', segments: [] }

  try {
    const key = requireApiKey()
    updateSession(sessionId, { status: 'transcribing', segments: [] })

    const segments = await transcribeOneSource(
      sessionId,
      primary,
      key,
      session.model,
      session.language,
      (percent) => broadcast('whisper:progress', { sessionId, percent, eta: null })
    )

    if (cancelled.has(sessionId)) {
      liveSession.status = 'idle'
      writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
      return
    }

    for (const segment of segments) broadcast('whisper:segment', { sessionId, segment })
    liveSession.segments = segments
    liveSession.status = 'done'
    writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
    broadcast('whisper:done', { sessionId })
  } catch (err) {
    liveSession.status = 'idle'
    writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
    if (cancelled.has(sessionId)) return
    const message = err instanceof Error ? err.message : String(err)
    broadcast('whisper:error', { sessionId, message })
    throw err
  } finally {
    cancelled.delete(sessionId)
    controllers.delete(sessionId)
  }
}

export async function transcribeAllSources(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  cancelled.delete(sessionId)
  controllers.set(sessionId, new AbortController())
  const sessionFilePath = getSessionPath(sessionId)
  const allSegments: Segment[] = []

  try {
    const key = requireApiKey()
    updateSession(sessionId, { status: 'transcribing', segments: [] })

    const sources = session.audioSources.filter((s) => s.path && existsSync(s.path))
    for (let i = 0; i < sources.length; i++) {
      if (cancelled.has(sessionId)) break
      const source = sources[i]
      const segments = await transcribeOneSource(
        sessionId,
        source.path,
        key,
        session.model,
        session.language,
        (percent) =>
          broadcast('whisper:progress', {
            sessionId,
            percent: Math.min(99, Math.round(((i + percent / 100) / sources.length) * 100)),
            eta: null
          })
      )
      // Without diarization, attribute segments to the source's speaker.
      allSegments.push(
        ...segments.map((seg) => ({
          ...seg,
          speakerId: seg.speakerId ?? source.speakerId ?? null
        }))
      )
    }

    allSegments.sort((a, b) => a.start - b.start)
    const wasCancelled = cancelled.has(sessionId)
    const updated: Session = {
      ...session,
      status: wasCancelled ? 'idle' : 'done',
      segments: allSegments
    }
    writeFileSync(sessionFilePath, JSON.stringify(updated, null, 2), 'utf8')
    if (!wasCancelled) broadcast('whisper:done', { sessionId })
  } catch (err) {
    const updated: Session = { ...session, status: 'idle', segments: allSegments }
    writeFileSync(sessionFilePath, JSON.stringify(updated, null, 2), 'utf8')
    if (cancelled.has(sessionId)) return
    const message = err instanceof Error ? err.message : String(err)
    broadcast('whisper:error', { sessionId, message })
    throw err
  } finally {
    cancelled.delete(sessionId)
    controllers.delete(sessionId)
  }
}

export function cancelTranscription(sessionId: string): void {
  if (!controllers.has(sessionId)) return
  cancelled.add(sessionId)
  controllers.get(sessionId)?.abort()
}
