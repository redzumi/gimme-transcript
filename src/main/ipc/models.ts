import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import type { WhisperModel, ModelInfo } from '../../renderer/src/types/ipc'
import { getModelsDir } from '../storage/paths'

const MODEL_SIZES: Record<WhisperModel, number> = {
  tiny: 75 * 1024 * 1024,
  base: 142 * 1024 * 1024,
  small: 466 * 1024 * 1024,
  medium: 1500 * 1024 * 1024,
  large: 2900 * 1024 * 1024
}

export function modelFileName(model: WhisperModel): string {
  return `ggml-${model}.bin`
}

export function modelPath(model: WhisperModel): string {
  return join(getModelsDir(), modelFileName(model))
}

export function isModelDownloaded(model: WhisperModel): boolean {
  return existsSync(modelPath(model))
}

export function registerModelHandlers(): void {
  ipcMain.handle('models:list', (): ModelInfo[] => {
    const models: WhisperModel[] = ['tiny', 'base', 'small', 'medium', 'large']
    return models.map((model) => ({
      model,
      sizeBytes: MODEL_SIZES[model],
      downloaded: isModelDownloaded(model)
    }))
  })

  // Download and cancel-download are implemented in T-021
  ipcMain.handle('models:download', (_e, _model: WhisperModel) => {
    // Placeholder — real implementation in T-021
  })

  ipcMain.handle('models:cancel-download', (_e, _model: WhisperModel) => {
    // Placeholder — real implementation in T-021
  })

  ipcMain.handle('models:delete', (_e, model: WhisperModel) => {
    const p = modelPath(model)
    if (existsSync(p)) {
      const { rmSync } = require('fs')
      rmSync(p)
    }
  })
}
