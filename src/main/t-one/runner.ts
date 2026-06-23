// T-one transcription runner. In-process counterpart to whisper/runner.ts:
// streams Segments + progress over the same `whisper:*` IPC channels, persists
// the session JSON, and supports cancellation.

import { randomUUID } from 'crypto'
import { existsSync, unlinkSync, writeFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { BrowserWindow } from 'electron'
import type { Segment, Session } from '../../renderer/src/types/ipc'
import { getSession, updateSession } from '../storage'
import { getSessionPath } from '../storage/paths'
import { ensureToneModel } from './model'
import { prepareAudio8k, decodeWavToInt32, buildChunks } from './audio'
import { TonePipeline } from './pipeline'

const cancelledSessions = new Set<string>()
const activeSessions = new Set<string>()

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

// Transcribe one audio file, invoking onSegment per phrase and onProgress per
// chunk. Returns all segments (speakerId left null).
async function transcribeFile(
  sessionId: string,
  audioPath: string,
  onSegment: (seg: Segment) => void,
  onProgress: (percent: number) => void
): Promise<Segment[]> {
  const { audioPath: preparedPath, tempFile } = await prepareAudio8k(audioPath)
  try {
    const samples = decodeWavToInt32(preparedPath)
    const chunks = buildChunks(samples)
    const pipeline = new TonePipeline()
    const segments: Segment[] = []

    for (let i = 0; i < chunks.length; i++) {
      if (cancelledSessions.has(sessionId)) break
      const isLast = i === chunks.length - 1
      const phrases = await pipeline.forward(chunks[i], isLast)
      for (const p of phrases) {
        const seg: Segment = {
          id: randomUUID(),
          start: p.startTime,
          end: p.endTime,
          text: p.text,
          speakerId: null
        }
        segments.push(seg)
        onSegment(seg)
      }
      onProgress(Math.min(99, Math.round(((i + 1) / chunks.length) * 100)))
    }
    return segments
  } finally {
    if (tempFile) {
      try {
        unlinkSync(preparedPath)
      } catch {
        /* ignore */
      }
    }
  }
}

export async function transcribeSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  const primaryPath = session.audioSources[0]?.path ?? ''
  if (!primaryPath || !existsSync(primaryPath)) {
    throw new Error('Audio file not found')
  }

  activeSessions.add(sessionId)
  cancelledSessions.delete(sessionId)

  const sessionFilePath = getSessionPath(sessionId)
  const liveSession: Session = { ...session, status: 'transcribing', segments: [] }

  try {
    await ensureToneModel() // download once if missing (broadcasts models:* progress)
    updateSession(sessionId, { status: 'transcribing', segments: [] })

    let sinceFlush = 0
    const FLUSH_EVERY = 10
    const segments = await transcribeFile(
      sessionId,
      primaryPath,
      (seg) => {
        liveSession.segments.push(seg)
        broadcast('whisper:segment', { sessionId, segment: seg })
        if (++sinceFlush >= FLUSH_EVERY) {
          sinceFlush = 0
          void writeFile(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8').catch(
            () => {}
          )
        }
      },
      (percent) => broadcast('whisper:progress', { sessionId, percent, eta: null })
    )

    if (cancelledSessions.has(sessionId)) {
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
    activeSessions.delete(sessionId)
    cancelledSessions.delete(sessionId)
  }
}

export async function transcribeAllSources(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  activeSessions.add(sessionId)
  cancelledSessions.delete(sessionId)

  const sessionFilePath = getSessionPath(sessionId)
  const allSegments: Segment[] = []

  try {
    await ensureToneModel()
    updateSession(sessionId, { status: 'transcribing', segments: [] })

    for (const source of session.audioSources) {
      if (cancelledSessions.has(sessionId)) break
      if (!source.path || !existsSync(source.path)) continue
      const segments = await transcribeFile(
        sessionId,
        source.path,
        () => {},
        (percent) => broadcast('whisper:progress', { sessionId, percent, eta: null })
      )
      allSegments.push(...segments.map((seg) => ({ ...seg, speakerId: source.speakerId ?? null })))
    }

    allSegments.sort((a, b) => a.start - b.start)
    const cancelled = cancelledSessions.has(sessionId)
    const updated: Session = {
      ...session,
      status: cancelled ? 'idle' : 'done',
      segments: allSegments
    }
    writeFileSync(sessionFilePath, JSON.stringify(updated, null, 2), 'utf8')
    if (!cancelled) broadcast('whisper:done', { sessionId })
  } catch (err) {
    const updated: Session = { ...session, status: 'idle', segments: allSegments }
    writeFileSync(sessionFilePath, JSON.stringify(updated, null, 2), 'utf8')
    const message = err instanceof Error ? err.message : String(err)
    broadcast('whisper:error', { sessionId, message })
    throw err
  } finally {
    activeSessions.delete(sessionId)
    cancelledSessions.delete(sessionId)
  }
}

export function cancelTranscription(sessionId: string): void {
  if (activeSessions.has(sessionId)) cancelledSessions.add(sessionId)
}
