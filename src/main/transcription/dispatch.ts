// Routes transcription calls to the engine recorded on the session. Keeps the
// `whisper:*` IPC surface stable while supporting any engine in the registry.

import { getSession, updateSession } from '../storage'
import { getEngine, ENGINES } from './engines'

interface ActiveJob {
  engine: (typeof ENGINES)[string]
  done: Promise<void>
  cancelled: boolean
}

const activeJobs = new Map<string, ActiveJob>()

function runnerFor(sessionId: string): (typeof ENGINES)[string] {
  const engineId = getSession(sessionId)?.engine ?? 'whisper'
  return getEngine(engineId) ?? ENGINES.whisper
}

function start(sessionId: string, allSources: boolean): Promise<void> {
  if (activeJobs.has(sessionId)) return Promise.reject(new Error('Session is already transcribing'))
  const engine = runnerFor(sessionId)
  const job: ActiveJob = { engine, done: Promise.resolve(), cancelled: false }
  job.done = Promise.resolve()
    .then(() => {
      if (job.cancelled) return
      return allSources
        ? engine.transcribeAllSources(sessionId)
        : engine.transcribeSession(sessionId)
    })
    .finally(() => activeJobs.delete(sessionId))
  activeJobs.set(sessionId, job)
  return job.done
}

export function transcribeSession(sessionId: string): Promise<void> {
  return start(sessionId, false)
}

export function transcribeAllSources(sessionId: string): Promise<void> {
  return start(sessionId, true)
}

export async function cancelTranscription(sessionId: string): Promise<void> {
  const job = activeJobs.get(sessionId)
  if (job) {
    job.cancelled = true
    job.engine.cancelTranscription(sessionId)
    // An aborted request/process may reject; it is still a successful cancellation.
    await job.done.catch(() => {})
  }
  // Also recover sessions left in this state by a previous app run.
  if (!activeJobs.has(sessionId) && getSession(sessionId)?.status === 'transcribing') {
    updateSession(sessionId, { status: 'idle' })
  }
}
