import { readFileSync, writeFileSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import type { Speaker } from '../../renderer/src/types/ipc'
import { getSpeakersPath } from './paths'

function readAll(): Speaker[] {
  const p = getSpeakersPath()
  if (!existsSync(p)) return []
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Speaker[]
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
    createdAt: new Date().toISOString()
  }
  speakers.push(speaker)
  writeAll(speakers)
  return speaker
}

export function updateSpeaker(id: string, name: string): Speaker {
  const speakers = readAll()
  const idx = speakers.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`Speaker not found: ${id}`)
  speakers[idx] = { ...speakers[idx], name }
  writeAll(speakers)
  return speakers[idx]
}

export function deleteSpeaker(id: string): void {
  const speakers = readAll().filter((s) => s.id !== id)
  writeAll(speakers)
}
