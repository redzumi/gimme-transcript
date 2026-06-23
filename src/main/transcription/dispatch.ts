// Routes transcription calls to the engine recorded on the session. Keeps the
// `whisper:*` IPC surface stable while supporting any engine in the registry.

import { getSession } from '../storage'
import { getEngine, ENGINES } from './engines'

function runnerFor(sessionId: string): (typeof ENGINES)[string] {
  const engineId = getSession(sessionId)?.engine ?? 'whisper'
  return getEngine(engineId) ?? ENGINES.whisper
}

export function transcribeSession(sessionId: string): Promise<void> {
  return runnerFor(sessionId).transcribeSession(sessionId)
}

export function transcribeAllSources(sessionId: string): Promise<void> {
  return runnerFor(sessionId).transcribeAllSources(sessionId)
}

export function cancelTranscription(sessionId: string): void {
  runnerFor(sessionId).cancelTranscription(sessionId)
}
