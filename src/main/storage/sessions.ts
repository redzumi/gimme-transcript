import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Session, WhisperModel } from '../../renderer/src/types/ipc'
import { getSessionPath, getSessionsDir } from './paths'

function read(id: string): Session | null {
  const p = getSessionPath(id)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as Session
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
        return JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Session
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

export function createSession(
  audioFile: string,
  model: WhisperModel,
  language: string
): Session {
  const session: Session = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    audioFile,
    model,
    language,
    status: 'idle',
    segments: []
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
