import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Session, AudioSource, WhisperModel } from '../../renderer/src/types/ipc'
import { getSessionPath, getSessionsDir } from './paths'

function migrate(session: Session): Session {
  const s = { ...session }
  // v1 → v2: backfill schemaVersion and audioSources
  if (!s.schemaVersion) {
    s.schemaVersion = 1
  }
  if (!s.audioSources) {
    s.audioSources = [
      {
        id: randomUUID(),
        path: s.audioFile ?? '',
        label: 'Audio',
        speakerId: null
      }
    ]
    s.schemaVersion = 2
  }
  return s
}

function read(id: string): Session | null {
  const p = getSessionPath(id)
  if (!existsSync(p)) return null
  return migrate(JSON.parse(readFileSync(p, 'utf8')) as Session)
}

function write(session: Session): void {
  writeFileSync(getSessionPath(session.id), JSON.stringify(session, null, 2), 'utf8')
}

export function listSessions(): Session[] {
  const dir = getSessionsDir()
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return migrate(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Session)
      } catch {
        return null
      }
    })
    .filter((s): s is Session => s !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getSession(id: string): Session | null {
  return read(id)
}

export function createSession(audioFile: string, model: WhisperModel, language: string): Session {
  const defaultName =
    audioFile
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? audioFile
  const sourceId = randomUUID()
  const session: Session = {
    schemaVersion: 2,
    id: randomUUID(),
    name: defaultName || 'Session',
    createdAt: new Date().toISOString(),
    audioFile,
    audioSources: [{ id: sourceId, path: audioFile, label: 'Audio', speakerId: null }],
    model,
    language,
    status: 'idle',
    segments: []
  }
  write(session)
  return session
}

export function createRecordedSession(
  audioSources: AudioSource[],
  model: WhisperModel,
  language: string
): Session {
  const firstName =
    audioSources[0]?.path
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') || 'Recording'
  const session: Session = {
    schemaVersion: 2,
    id: randomUUID(),
    name: firstName,
    createdAt: new Date().toISOString(),
    audioSources,
    model,
    language,
    status: 'idle',
    segments: [],
    recordingSource: 'recorded'
  }
  write(session)
  return session
}

export function updateSession(id: string, data: Partial<Session>): Session {
  const existing = read(id)
  if (!existing) throw new Error(`Session not found: ${id}`)
  const updated: Session = { ...existing, ...data, id }
  write(updated)
  return updated
}

export function deleteSession(id: string): void {
  const p = getSessionPath(id)
  if (existsSync(p)) rmSync(p)
}
