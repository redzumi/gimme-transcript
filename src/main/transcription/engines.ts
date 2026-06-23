// Central registry of engine plugins — the single source of truth for which
// engines exist and how they behave. Pairs each EngineDef (registry.ts metadata)
// with its runner functions. dispatch.ts and ipc/engines.ts derive from this.

import type { Engine } from './engine'
import { ENGINE_REGISTRY } from './registry'
import { getEngineDef } from './types'
import * as whisper from '../whisper'
import * as tone from '../t-one'
import * as openai from './openai'

function defOf(id: string): Engine['definition'] {
  const def = getEngineDef(ENGINE_REGISTRY, id)
  if (!def) throw new Error(`No EngineDef registered for "${id}"`)
  return def
}

export const ENGINES: Record<string, Engine> = {
  whisper: {
    definition: defOf('whisper'),
    transcribeSession: whisper.transcribeSession,
    transcribeAllSources: whisper.transcribeAllSources,
    cancelTranscription: whisper.cancelTranscription
  },
  't-one': {
    definition: defOf('t-one'),
    transcribeSession: tone.transcribeSession,
    transcribeAllSources: tone.transcribeAllSources,
    cancelTranscription: tone.cancelTranscription
  },
  openai: {
    definition: defOf('openai'),
    transcribeSession: openai.transcribeSession,
    transcribeAllSources: openai.transcribeAllSources,
    cancelTranscription: openai.cancelTranscription,
    validateKey: openai.validateKey
  }
}

export function getEngine(engineId: string): Engine | undefined {
  return ENGINES[engineId]
}

export function listEngines(): Engine[] {
  return Object.values(ENGINES)
}
