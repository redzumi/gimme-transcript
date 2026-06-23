import { readFileSync, writeFileSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Speaker } from '../../renderer/src/types/ipc'
import { getSpeakersPath } from './paths'

function readAll(): Speaker[] {
  const p = getSpeakersPath()
  if (!existsSync(p)) return []
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Array<
      Omit<Speaker, 'color'> & { color?: number }
    >
    const needsMigration = raw.some((sp) => sp.color === undefined)
    const migrated = raw.map((sp, i) => ({ ...sp, color: sp.color ?? i % 16 }))
    if (needsMigration) writeAll(migrated)
    return migrated
  } catch {
    return []
  }
}

function writeAll(speakers: Speaker[]): void {
  writeFileSync(getSpeakersPath(), JSON.stringify(speakers, null, 2), 'utf8')
}

export function listSpeakers(): Speaker[] {
  return readAll()
}

export function createSpeaker(name: string): Speaker {
  const speakers = readAll()
  const speaker: Speaker = {
    id: randomUUID(),
    name,
    color: speakers.length % 16,
    createdAt: new Date().toISOString()
  }
  speakers.push(speaker)
  writeAll(speakers)
  return speaker
}

export function updateSpeaker(id: string, name: string, color?: number): Speaker {
  const speakers = readAll()
  const idx = speakers.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`Speaker not found: ${id}`)
  speakers[idx] = {
    ...speakers[idx],
    name,
    ...(color !== undefined ? { color } : {})
  }
  writeAll(speakers)
  return speakers[idx]
}

export function deleteSpeaker(id: string): void {
  const speakers = readAll().filter((s) => s.id !== id)
  writeAll(speakers)
}
