import os from 'os'
import { ipcMain } from 'electron'
import type { EngineInfo, EngineModelInfo } from '../../renderer/src/types/ipc'
import { listEngines, getEngine } from '../transcription/engines'
import { getAvailableEngines } from '../transcription/types'
import {
  engineStatus,
  getEngineModels,
  downloadEngineModel,
  cancelEngineDownload,
  deleteEngineModel
} from '../transcription/models'

function dedupeLanguages(
  langs: { code: string; name: string }[]
): { code: string; name: string }[] {
  const seen = new Set<string>()
  return langs.filter((l) => (seen.has(l.code) ? false : seen.add(l.code)))
}

export function registerEngineHandlers(): void {
  ipcMain.handle('engines:list', (): EngineInfo[] =>
    getAvailableEngines(listEngines().map((e) => e.definition)).map((def) => {
      const plat = def.platforms.find((p) => p.platform === os.platform() && p.arch === os.arch())
      return {
        id: def.id,
        name: def.name,
        description: def.description,
        languages: dedupeLanguages(def.languages),
        features: def.features,
        platformNote: plat?.note,
        status: engineStatus(def.id)
      }
    })
  )

  ipcMain.handle('engines:models', (_e, engineId: string): EngineModelInfo[] =>
    getEngineModels(engineId)
  )

  ipcMain.handle('engines:download-model', async (_e, engineId: string, modelId: string) => {
    try {
      await downloadEngineModel(engineId, modelId)
    } catch (err) {
      // Errors surface via engines:download-error; swallow Cancelled.
      const message = err instanceof Error ? err.message : String(err)
      if (message !== 'Cancelled') throw err
    }
  })

  ipcMain.handle('engines:cancel-download', (_e, engineId: string, modelId: string) =>
    cancelEngineDownload(engineId, modelId)
  )

  ipcMain.handle('engines:delete-model', (_e, engineId: string, modelId: string) =>
    deleteEngineModel(engineId, modelId)
  )

  ipcMain.handle('engines:validate-key', (_e, engineId: string, key: string) => {
    const engine = getEngine(engineId)
    return engine?.validateKey ? engine.validateKey(key) : { ok: true }
  })
}
