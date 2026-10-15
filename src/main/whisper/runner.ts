// Spawn whisper.cpp, stream segments via IPC, and cancel preparation or inference.

import { existsSync, rmSync, writeFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { cpus } from 'os'
import { BrowserWindow } from 'electron'
import type { Segment, Session } from '../../renderer/src/types/ipc'
import { getWhisperBinaryPath } from './binary'
import { prepareAudio } from './convert'
import { parseSegmentLine, parseProgressLine } from './parser'
import { modelPath, resolveDownloadedModel } from '../ipc/models'
import { getSession, updateSession } from '../storage'
import { getSessionPath } from '../storage/paths'
import { spawnCancellable } from '../transcription/process'

const controllers = new Map<string, AbortController>()

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

async function runWhisper(
  sessionId: string,
  audioPath: string,
  binaryPath: string,
  mPath: string,
  lang: string,
  signal: AbortSignal,
  onSegment: (segment: Segment) => void
): Promise<void> {
  const { audioPath: preparedPath, tempFile } = await prepareAudio(audioPath, signal)
  try {
    signal.throwIfAborted()
    const threadCount = String(Math.max(1, Math.floor(cpus().length / 2)))
    const args = [
      '-m',
      mPath,
      '-f',
      preparedPath,
      '-l',
      lang,
      '--print-progress',
      '-t',
      threadCount
    ]

    await new Promise<void>((resolve, reject) => {
      const proc = spawnCancellable(binaryPath, args, signal)
      let stdoutBuf = ''
      const emitLine = (line: string): void => {
        if (signal.aborted) return
        const seg = parseSegmentLine(line)
        if (seg) onSegment(seg)
      }

      proc.stdout.on('data', (data: Buffer) => {
        stdoutBuf += data.toString()
        const lines = stdoutBuf.split('\n')
        stdoutBuf = lines.pop() ?? ''
        lines.forEach(emitLine)
      })
      proc.stderr.on('data', (data: Buffer) => {
        if (signal.aborted) return
        for (const line of data.toString().split('\n')) {
          const percent = parseProgressLine(line)
          if (percent !== null) broadcast('whisper:progress', { sessionId, percent, eta: null })
        }
      })
      proc.on('close', (code) => {
        if (signal.aborted) {
          reject(signal.reason)
          return
        }
        if (stdoutBuf.trim()) emitLine(stdoutBuf)
        if (code === 0) resolve()
        else reject(new Error(`whisper.cpp exited with code ${code}`))
      })
      proc.on('error', reject)
    })
  } finally {
    if (tempFile) rmSync(preparedPath, { force: true })
  }
}

async function transcribe(sessionId: string, allSources: boolean): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)
  if (controllers.has(sessionId)) throw new Error('Session is already transcribing')

  const controller = new AbortController()
  controllers.set(sessionId, controller)
  const { signal } = controller
  const sessionFilePath = getSessionPath(sessionId)
  const liveSession: Session = { ...session, status: 'transcribing', segments: [] }
  // Serialize periodic saves and finish them before writing the terminal status.
  let pendingSave = Promise.resolve()
  let segmentsSinceFlush = 0

  try {
    const binaryPath = getWhisperBinaryPath()
    if (!existsSync(binaryPath)) {
      throw new Error(`whisper.cpp binary not found at ${binaryPath}.\nRun: npm run whisper:setup`)
    }
    const actualModel = resolveDownloadedModel(session.model)
    if (!actualModel) throw new Error(`Model "${session.model}" is not downloaded`)
    liveSession.model = actualModel
    updateSession(sessionId, { status: 'transcribing', segments: [], model: actualModel })

    const sources = allSources ? session.audioSources : session.audioSources.slice(0, 1)
    for (const source of sources) {
      signal.throwIfAborted()
      if (!source.path || !existsSync(source.path)) {
        if (allSources) continue
        throw new Error('Audio file not found')
      }
      await runWhisper(
        sessionId,
        source.path,
        binaryPath,
        modelPath(actualModel),
        session.language,
        signal,
        (segment) => {
          const seg = allSources ? { ...segment, speakerId: source.speakerId ?? null } : segment
          liveSession.segments.push(seg)
          broadcast('whisper:segment', { sessionId, segment: seg })
          if (++segmentsSinceFlush >= 10) {
            segmentsSinceFlush = 0
            const snapshot = JSON.stringify(liveSession, null, 2)
            pendingSave = pendingSave
              .then(() => writeFile(sessionFilePath, snapshot, 'utf8'))
              .catch(() => {})
          }
        }
      )
    }
    signal.throwIfAborted()
    liveSession.status = 'done'
  } catch (err) {
    liveSession.status = 'idle'
    if (!signal.aborted) {
      const message = err instanceof Error ? err.message : String(err)
      broadcast('whisper:error', { sessionId, message })
      throw err
    }
  } finally {
    try {
      await pendingSave
      if (signal.aborted) liveSession.status = 'idle'
      liveSession.segments.sort((a, b) => a.start - b.start)
      writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
    } finally {
      controllers.delete(sessionId)
    }
  }
  if (liveSession.status === 'done') broadcast('whisper:done', { sessionId })
}

export function transcribeSession(sessionId: string): Promise<void> {
  return transcribe(sessionId, false)
}

export function transcribeAllSources(sessionId: string): Promise<void> {
  return transcribe(sessionId, true)
}

export function cancelTranscription(sessionId: string): void {
  controllers.get(sessionId)?.abort()
}
