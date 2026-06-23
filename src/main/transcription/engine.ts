// The contract every transcription engine implements. To add an engine:
//   1. write a runner module exporting transcribeSession / transcribeAllSources
//      / cancelTranscription (and optional validateKey),
//   2. add its EngineDef to registry.ts,
//   3. register one line in engines.ts (ENGINES).
// Everything else (dispatch, engines:list, key validation) derives from here.

import type { EngineDef } from './types'

export interface EngineRunner {
  transcribeSession(sessionId: string): Promise<void>
  transcribeAllSources(sessionId: string): Promise<void>
  cancelTranscription(sessionId: string): void
}

export interface Engine extends EngineRunner {
  /** Registry metadata (id, models, languages, platforms, features). */
  definition: EngineDef
  /** Cloud engines validate their API key; locals omit this. */
  validateKey?(key: string): Promise<{ ok: boolean; message?: string }>
}
