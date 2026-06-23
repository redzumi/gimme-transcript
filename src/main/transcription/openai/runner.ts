// OpenAI cloud transcription runner. Streams Segments + progress over the
// shared `whisper:*` IPC channels, mirroring the whisper/t-one runners.

import { randomUUID } from 'crypto'
import { existsSync, writeFileSync } from 'fs'
import { writeFile } from 'fs/promises'
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
import { openaiTranscribe, type OpenAIResponseFormat } from './client'
import {
  parseVerboseJson,
  parseDiarizedJson,
  parseTextResponse,
  type ParsedSegment
} from './parser'
import { planAudioParts } from './chunking'

const controllers = new Map<string, AbortController>()
const cancelled = new Set<string>()

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

function responseFormatFor(model: string): OpenAIResponseFormat {
  if (model.includes('diarize')) return 'diarized_json'
  if (model === 'whisper-1') return 'verbose_json'
  return 'json'
}

function resolveSpeakerId(name: string, cache: Map<string, string>): string {
  const cached = cache.get(name)
  if (cached) return cached
  const existing = listSpeakers().find((s) => s.name === name)
  const speaker = existing ?? createSpeaker(name)
  cache.set(name, speaker.id)
  return speaker.id
}

async function transcribeOneSource(
  sessionId: string,
  audioPath: string,
  apiKey: string,
  model: string,
  language: string,
  onSegment: (seg: Segment) => void,
  onProgress: (percent: number) => void
): Promise<Segment[]> {
  const isDiarize = model.includes('diarize')
  const responseFormat = responseFormatFor(model)
  const plan = await planAudioParts(audioPath)
  const speakerCache = new Map<string, string>()
  const segments: Segment[] = []

  try {
    let prevText = ''
    for (let i = 0; i < plan.parts.length; i++) {
      if (cancelled.has(sessionId)) break
      const part = plan.parts[i]
      const controller = new AbortController()
      controllers.set(sessionId, controller)

      const resp = await openaiTranscribe(part.path, {
        apiKey,
        model,
        responseFormat,
        language,
        prompt: isDiarize ? undefined : prevText || undefined,
        chunkingAuto: isDiarize,
        signal: controller.signal
      })

      let parsed: ParsedSegment[]
      if (isDiarize) parsed = parseDiarizedJson(resp)
      else if (responseFormat === 'verbose_json') parsed = parseVerboseJson(resp)
      else parsed = parseTextResponse(resp, plan.durationSec)

      for (const ps of parsed) {
        if (!ps.text) continue
        const seg: Segment = {
          id: randomUUID(),
          start: ps.start + part.offsetSec,
          end: (ps.end || ps.start) + part.offsetSec,
          text: ps.text,
          speakerId: ps.speaker ? resolveSpeakerId(ps.speaker, speakerCache) : null
        }
        segments.push(seg)
        onSegment(seg)
      }
      if (parsed.length > 0) prevText = parsed[parsed.length - 1].text.slice(-400)
      onProgress(Math.min(99, Math.round(((i + 1) / plan.parts.length) * 100)))
    }
    return segments
  } finally {
    plan.cleanup()
    controllers.delete(sessionId)
  }
}

function requireApiKey(): string {
  const key = getSettings().openaiApiKey
  if (!key) throw new Error('Set your OpenAI API key in Settings.')
  return key
}

export async function transcribeSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  const primary = session.audioSources[0]?.path ?? ''
  if (!primary || !existsSync(primary)) throw new Error('Audio file not found')

  cancelled.delete(sessionId)
  const sessionFilePath = getSessionPath(sessionId)
  const liveSession: Session = { ...session, status: 'transcribing', segments: [] }

  try {
    const key = requireApiKey()
    updateSession(sessionId, { status: 'transcribing', segments: [] })

    let sinceFlush = 0
    const segments = await transcribeOneSource(
      sessionId,
      primary,
      key,
      session.model,
      session.language,
      (seg) => {
        liveSession.segments.push(seg)
        broadcast('whisper:segment', { sessionId, segment: seg })
        if (++sinceFlush >= 10) {
          sinceFlush = 0
          void writeFile(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8').catch(
            () => {}
          )
        }
      },
      (percent) => broadcast('whisper:progress', { sessionId, percent, eta: null })
    )

    if (cancelled.has(sessionId)) {
      liveSession.status = 'idle'
      writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
      return
    }

    liveSession.segments = segments
    liveSession.status = 'done'
    writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
    broadcast('whisper:done', { sessionId })
  } catch (err) {
    liveSession.status = 'idle'
    writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
    const message = err instanceof Error ? err.message : String(err)
    broadcast('whisper:error', { sessionId, message })
    throw err
  } finally {
    cancelled.delete(sessionId)
  }
}

export async function transcribeAllSources(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  cancelled.delete(sessionId)
  const sessionFilePath = getSessionPath(sessionId)
  const allSegments: Segment[] = []

  try {
    const key = requireApiKey()
    updateSession(sessionId, { status: 'transcribing', segments: [] })

    for (const source of session.audioSources) {
      if (cancelled.has(sessionId)) break
      if (!source.path || !existsSync(source.path)) continue
      const segments = await transcribeOneSource(
        sessionId,
        source.path,
        key,
        session.model,
        session.language,
        () => {},
        (percent) => broadcast('whisper:progress', { sessionId, percent, eta: null })
      )
      // For non-diarized multi-source recordings, attribute by source speaker.
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
    const message = err instanceof Error ? err.message : String(err)
    broadcast('whisper:error', { sessionId, message })
    throw err
  } finally {
    cancelled.delete(sessionId)
  }
}

export function cancelTranscription(sessionId: string): void {
  cancelled.add(sessionId)
  controllers.get(sessionId)?.abort()
}
