// T-022 + T-024: Spawn whisper.cpp, stream segments via IPC, support cancellation.

import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { existsSync, unlinkSync, writeFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { cpus } from 'os'
import { BrowserWindow } from 'electron'
import { getWhisperBinaryPath } from './binary'
import { prepareAudio } from './convert'
import { parseSegmentLine, parseProgressLine } from './parser'
import { modelPath, resolveDownloadedModel } from '../ipc/models'
import { getSession, updateSession } from '../storage'
import { getSessionPath } from '../storage/paths'

const activeProcesses = new Map<string, ChildProcess>()
const cancelledSessions = new Set<string>()

function broadcast(channel: string, payload: unknown): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  })
}

export async function transcribeSession(sessionId: string): Promise<void> {
  const session = getSession(sessionId)
  if (!session) throw new Error(`Session not found: ${sessionId}`)

  const binaryPath = getWhisperBinaryPath()
  if (!existsSync(binaryPath)) {
    throw new Error(`whisper.cpp binary not found at ${binaryPath}.\nRun: npm run whisper:setup`)
  }

  const actualModel = resolveDownloadedModel(session.model)
  if (!actualModel) {
    throw new Error(`Model "${session.model}" is not downloaded`)
  }
  const mPath = modelPath(actualModel)

  // Convert audio if needed (async, non-blocking)
  const { audioPath, tempFile } = await prepareAudio(session.audioFile)

  updateSession(sessionId, { status: 'transcribing', segments: [], model: actualModel })

  const threadCount = String(Math.max(1, Math.floor(cpus().length / 2)))
  const lang = session.language === 'auto' ? 'auto' : session.language
  const args = ['-m', mPath, '-f', audioPath, '-l', lang, '--print-progress', '-t', threadCount]

  return new Promise((resolve, reject) => {
    const proc = spawn(binaryPath, args)
    activeProcesses.set(sessionId, proc)

    // In-memory session copy — updated cheaply without disk reads
    const liveSession: typeof session = {
      ...session,
      model: actualModel,
      status: 'transcribing',
      segments: []
    }
    const sessionFilePath = getSessionPath(sessionId)
    let stdoutBuf = ''
    let segmentsSinceFlush = 0
    const FLUSH_EVERY = 10

    function flushAsync(): void {
      writeFile(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8').catch(() => {})
    }

    proc.stdout.on('data', (data: Buffer) => {
      stdoutBuf += data.toString()
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() ?? ''
      for (const line of lines) {
        const seg = parseSegmentLine(line)
        if (seg) {
          liveSession.segments.push(seg)
          broadcast('whisper:segment', { sessionId, segment: seg })
          segmentsSinceFlush++
          if (segmentsSinceFlush >= FLUSH_EVERY) {
            flushAsync()
            segmentsSinceFlush = 0
          }
        }
      }
    })

    proc.stderr.on('data', (data: Buffer) => {
      const text = data.toString()
      process.stdout.write('[whisper stderr] ' + text)
      for (const line of text.split('\n')) {
        const pct = parseProgressLine(line)
        if (pct !== null) {
          broadcast('whisper:progress', { sessionId, percent: pct, eta: null })
        }
      }
    })

    proc.on('close', (code) => {
      activeProcesses.delete(sessionId)
      const wasCancelled = cancelledSessions.delete(sessionId)

      if (tempFile) {
        try {
          unlinkSync(audioPath)
        } catch {
          /* ignore */
        }
      }

      if (wasCancelled) {
        liveSession.status = 'idle'
        writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
        resolve()
        return
      }

      // Flush remaining stdout buffer
      if (stdoutBuf.trim()) {
        const seg = parseSegmentLine(stdoutBuf)
        if (seg) {
          liveSession.segments.push(seg)
          broadcast('whisper:segment', { sessionId, segment: seg })
        }
      }

      if (code === 0) {
        liveSession.status = 'done'
        writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
        broadcast('whisper:done', { sessionId })
        resolve()
      } else {
        liveSession.status = 'idle'
        writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
        const msg = `whisper.cpp exited with code ${code}`
        broadcast('whisper:error', { sessionId, message: msg })
        reject(new Error(msg))
      }
    })

    proc.on('error', (err) => {
      activeProcesses.delete(sessionId)
      cancelledSessions.delete(sessionId)
      if (tempFile) {
        try {
          unlinkSync(audioPath)
        } catch {
          /* ignore */
        }
      }
      liveSession.status = 'idle'
      writeFileSync(sessionFilePath, JSON.stringify(liveSession, null, 2), 'utf8')
      broadcast('whisper:error', { sessionId, message: err.message })
      reject(err)
    })
  })
}

export function cancelTranscription(sessionId: string): void {
  const proc = activeProcesses.get(sessionId)
  if (proc) {
    cancelledSessions.add(sessionId)
    proc.kill('SIGTERM')
  }
}
